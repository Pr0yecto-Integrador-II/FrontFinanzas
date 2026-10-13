import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetRepo } from '../features/presupuestos/data/budget.repo';
import { RuleRepo } from '../features/recurrentes/data/rule.repo';
import { TransactionRepo } from '../features/movimientos/data/transaction.repo';
import { Api, PullResponse, PushResponse } from './api';
import { AuthService } from './auth.service';
import { Clock } from './clock';
import { Db } from './db';
import { LocalStore } from './local-store';
import { Budget, Category, RecurringRule, Transaction } from './models';
import { SyncService } from './sync.service';

class FakeClock extends Clock {
  constructor(public date = new Date('2026-10-12T15:00:00Z')) {
    super();
  }
  now(): Date {
    return this.date;
  }
}

const category = (id: string, type: 'expense' | 'income' = 'expense'): Category => ({
  id,
  name: id,
  nameKey: id,
  type,
  icon: 'home',
  color: '#EF4444',
  isDefault: false,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  syncState: 'synced',
});

const tx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'expense',
  amountMinor: 2_500_000,
  categoryId: 'cat-a',
  occurredOn: '2026-10-01',
  description: null,
  note: null,
  tags: [],
  status: 'confirmed',
  recurringRuleId: null,
  createdAt: '2026-10-01T09:00:00Z',
  deletedAt: null,
  syncState: 'synced',
  ...extra,
});

describe('capa sin conexión', () => {
  let db: Db;
  let store: LocalStore;
  let clock: FakeClock;
  const api = { push: vi.fn(), pull: vi.fn() };

  beforeEach(async () => {
    api.push.mockReset();
    api.pull.mockReset();
    clock = new FakeClock();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clock, useValue: clock },
        { provide: Api, useValue: api },
        { provide: AuthService, useValue: { isAuthenticated: () => true, currency: () => 'COP' } },
      ],
    });
    db = TestBed.inject(Db);
    store = TestBed.inject(LocalStore);
    await db.wipe();
  });

  describe('LocalStore (escritura + outbox en una transacción)', () => {
    it('guarda el movimiento y lo encola', async () => {
      await store.upsert('transaction', tx('t1'));
      const saved = await db.transactions.get('t1');
      const queue = await db.outbox.toArray();
      expect(saved?.syncState).toBe('pending');
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({ entity: 'transaction', op: 'upsert', entityId: 't1' });
    });

    it('el payload nunca lleva user_id, version ni campos del navegador', async () => {
      await store.upsert('transaction', tx('t1'));
      const payload = (await db.outbox.toArray())[0].payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(
        [
          'amount_minor', 'category_id', 'created_at', 'description', 'note',
          'occurred_on', 'recurring_rule_id', 'status', 'tags', 'type',
        ].sort(),
      );
    });

    it('varias ediciones del mismo registro dejan un solo cambio (gana el último)', async () => {
      await store.upsert('transaction', tx('t1'));
      await store.upsert('transaction', tx('t1', { amountMinor: 999 }));
      const queue = await db.outbox.toArray();
      expect(queue).toHaveLength(1);
      expect((queue[0].payload as { amount_minor: number }).amount_minor).toBe(999);
    });

    it('eliminar es lógico: el registro sigue con deletedAt y se encola un delete', async () => {
      await store.upsert('transaction', tx('t1'));
      await store.remove('transaction', (await db.transactions.get('t1')) as Transaction);
      const row = await db.transactions.get('t1');
      expect(row?.deletedAt).not.toBeNull();
      const queue = await db.outbox.toArray();
      expect(queue).toHaveLength(1);
      expect(queue[0].op).toBe('delete');
    });

    it('deshacer antes de sincronizar cancela el borrado', async () => {
      await store.upsert('transaction', tx('t1'));
      const t = (await db.transactions.get('t1')) as Transaction;
      await store.remove('transaction', t);
      await store.restore('transaction', t);
      const queue = await db.outbox.toArray();
      expect(queue.map((q) => q.op)).toEqual(['upsert']);
      expect((await db.transactions.get('t1'))?.deletedAt).toBeNull();
    });

    it('eliminar una categoría con uso reasigna movimientos y encola reassign_to', async () => {
      await db.categories.bulkPut([category('cat-a'), category('cat-b')]);
      await db.transactions.put(tx('t1', { categoryId: 'cat-a' }));
      await store.deleteCategory('cat-a', 'cat-b');
      expect((await db.transactions.get('t1'))?.categoryId).toBe('cat-b');
      expect((await db.categories.get('cat-a'))?.deletedAt).not.toBeNull();
      const del = (await db.outbox.toArray()).find((q) => q.entity === 'category');
      expect(del).toMatchObject({ op: 'delete', payload: { reassign_to: 'cat-b' } });
    });
  });

  describe('SyncService', () => {
    const pushOk = (applied: string[], rejected: PushResponse['rejected'] = []): PushResponse => ({
      applied,
      rejected,
      version: 10,
    });
    const empty: PullResponse = { changes: [], next_since: 0, has_more: false };

    it('push aplicado: marca synced y vacía el outbox', async () => {
      await store.upsert('transaction', tx('t1'));
      api.push.mockResolvedValue(pushOk(['t1']));
      api.pull.mockResolvedValue(empty);
      await TestBed.inject(SyncService).sync();
      expect((await db.transactions.get('t1'))?.syncState).toBe('synced');
      expect(await db.outbox.count()).toBe(0);
    });

    it('push rechazado: marca rejected con el motivo y no tumba lo demás', async () => {
      await store.upsert('transaction', tx('bad'));
      await store.upsert('transaction', tx('good'));
      api.push.mockResolvedValue(
        pushOk(['good'], [{ id: 'bad', code: 'FutureDateError', message: 'La fecha no puede ser futura.' }]),
      );
      api.pull.mockResolvedValue(empty);
      await TestBed.inject(SyncService).sync();
      const bad = await db.transactions.get('bad');
      expect(bad?.syncState).toBe('rejected');
      expect(bad?.rejection?.code).toBe('FutureDateError');
      expect((await db.transactions.get('good'))?.syncState).toBe('synced');
      expect(await db.outbox.count()).toBe(0);
    });

    it('envía el outbox en el orden en que se hicieron los cambios', async () => {
      await store.upsert('transaction', tx('t1'));
      await store.upsert('transaction', tx('t2'));
      api.push.mockResolvedValue(pushOk(['t1', 't2']));
      api.pull.mockResolvedValue(empty);
      await TestBed.inject(SyncService).sync();
      const sent = api.push.mock.calls[0][0] as { id: string }[];
      expect(sent.map((c) => c.id)).toEqual(['t1', 't2']);
    });

    it('pull: aplica cambios, pagina y guarda lastPulledVersion', async () => {
      api.push.mockResolvedValue(pushOk([]));
      api.pull
        .mockResolvedValueOnce({
          changes: [
            {
              entity: 'category',
              id: 'c1',
              version: 5,
              deleted: false,
              data: { name: 'Café', type: 'expense', icon: 'local_cafe', color: '#F97316', is_default: true, created_at: '2026-10-01T00:00:00Z' },
            },
          ],
          next_since: 5,
          has_more: true,
        })
        .mockResolvedValueOnce({
          changes: [
            {
              entity: 'transaction',
              id: 't9',
              version: 8,
              deleted: false,
              data: { type: 'expense', amount_minor: 100, category_id: 'c1', occurred_on: '2026-10-02', created_at: '2026-10-02T10:00:00Z', tags: ['viaje'], status: 'confirmed' },
            },
          ],
          next_since: 8,
          has_more: false,
        });
      await TestBed.inject(SyncService).sync();
      expect(api.pull).toHaveBeenNthCalledWith(1, 0, 500);
      expect(api.pull).toHaveBeenNthCalledWith(2, 5, 500);
      expect((await db.categories.get('c1'))?.nameKey).toBe('cafe');
      expect((await db.transactions.get('t9'))?.tags).toEqual(['viaje']);
      expect(await db.getMeta('lastPulledVersion')).toBe(8);
    });

    it('pull no pisa un cambio local pendiente', async () => {
      await store.upsert('transaction', tx('t1', { amountMinor: 111 }));
      api.push.mockResolvedValue(pushOk([])); // el servidor aún no lo aplicó
      api.pull.mockResolvedValue({
        changes: [
          { entity: 'transaction', id: 't1', version: 3, deleted: false, data: { type: 'expense', amount_minor: 999, category_id: 'cat-a', occurred_on: '2026-10-01', created_at: '2026-10-01T09:00:00Z', tags: [], status: 'confirmed' } },
        ],
        next_since: 3,
        has_more: false,
      });
      await TestBed.inject(SyncService).sync();
      expect((await db.transactions.get('t1'))?.amountMinor).toBe(111);
    });

    it('pull de un borrado marca deletedAt sin quitar el registro', async () => {
      await db.transactions.put(tx('t1'));
      api.push.mockResolvedValue(pushOk([]));
      api.pull.mockResolvedValue({
        changes: [
          { entity: 'transaction', id: 't1', version: 4, deleted: true, data: { type: 'expense', amount_minor: 2_500_000, category_id: 'cat-a', occurred_on: '2026-10-01', created_at: '2026-10-01T09:00:00Z', tags: [], status: 'confirmed' } },
        ],
        next_since: 4,
        has_more: false,
      });
      await TestBed.inject(SyncService).sync();
      expect((await db.transactions.get('t1'))?.deletedAt).not.toBeNull();
    });
  });

  describe('recurrentes (HU09)', () => {
    const rule = (extra: Partial<RecurringRule> = {}): RecurringRule => ({
      id: '6f8a9d8e-6d2a-4f6c-9a53-1d2e3f4a5b6c',
      type: 'expense',
      amountMinor: 120_000_000,
      categoryId: 'cat-a',
      description: 'Arriendo',
      frequency: 'monthly',
      startOn: '2026-08-05',
      endOn: null,
      maxOccurrences: null,
      mode: 'auto',
      generateFrom: '2026-08-05',
      pausedAt: null,
      createdAt: '2026-08-01T00:00:00Z',
      deletedAt: null,
      syncState: 'synced',
      ...extra,
    });

    it('genera las ocurrencias atrasadas y no duplica al volver a correr', async () => {
      await db.recurringRules.put(rule());
      const repo = TestBed.inject(RuleRepo);
      expect(await repo.generateDue()).toBe(3); // 5 ago, 5 sep, 5 oct
      expect(await repo.generateDue()).toBe(0);
      const dates = (await db.transactions.toArray()).map((t) => t.occurredOn).sort();
      expect(dates).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    });

    it('una ocurrencia eliminada no se vuelve a generar', async () => {
      await db.recurringRules.put(rule());
      const repo = TestBed.inject(RuleRepo);
      await repo.generateDue();
      const t = (await db.transactions.toArray())[0];
      await TestBed.inject(TransactionRepo).skip(t.id);
      expect(await repo.generateDue()).toBe(0);
    });

    it('con confirmación: la ocurrencia queda pendiente y no cuenta en el balance', async () => {
      await db.recurringRules.put(rule({ mode: 'confirm', startOn: '2026-10-05', generateFrom: '2026-10-05' }));
      await TestBed.inject(RuleRepo).generateDue();
      const rows = await db.transactions.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('pending');
    });

    it('reanudar no genera las fechas del periodo pausado', async () => {
      const paused = rule({ pausedAt: '2026-09-01T00:00:00Z' });
      await db.recurringRules.put(paused);
      const repo = TestBed.inject(RuleRepo);
      await repo.resume(paused);
      await repo.generateDue();
      expect((await db.transactions.toArray()).map((t) => t.occurredOn)).toEqual([]);
      const resumed = await db.recurringRules.get(paused.id);
      expect(resumed?.generateFrom).toBe('2026-10-12');
    });

    it('eliminar la regla borra los pendientes y conserva lo registrado', async () => {
      const r = rule({ mode: 'confirm' });
      await db.recurringRules.put(r);
      await db.transactions.put(tx('done', { recurringRuleId: r.id }));
      await db.transactions.put(tx('wait', { recurringRuleId: r.id, status: 'pending' }));
      await TestBed.inject(RuleRepo).remove(r);
      expect((await db.transactions.get('done'))?.deletedAt).toBeNull();
      expect((await db.transactions.get('wait'))?.deletedAt).not.toBeNull();
      expect((await db.recurringRules.get(r.id))?.deletedAt).not.toBeNull();
    });
  });

  describe('presupuestos (HU14)', () => {
    const budget: Budget = {
      id: 'b1',
      categoryId: 'cat-a',
      amountMinor: 60_000_000,
      effectiveFrom: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      deletedAt: null,
      syncState: 'synced',
    };

    it('avisa al 80 % una sola vez y al 100 % cuando se supera', async () => {
      await db.budgets.put(budget);
      await db.transactions.put(tx('t0', { amountMinor: 45_000_000 }));
      const repo = TestBed.inject(BudgetRepo);

      const first = tx('t1', { amountMinor: 6_000_000, occurredOn: '2026-10-10' });
      await db.transactions.put(first);
      const a = await repo.alertsAfterSave(first, 0, 'COP', 'Alimentación');
      expect(a).toHaveLength(1);
      expect(a[0]).toContain('Llevas el 85 %');

      const second = tx('t2', { amountMinor: 3_000_000, occurredOn: '2026-10-11' });
      await db.transactions.put(second);
      expect(await repo.alertsAfterSave(second, 0, 'COP', 'Alimentación')).toHaveLength(0);

      const third = tx('t3', { amountMinor: 8_000_000, occurredOn: '2026-10-12' });
      await db.transactions.put(third);
      const c = await repo.alertsAfterSave(third, 0, 'COP', 'Alimentación');
      expect(c).toHaveLength(1);
      expect(c[0]).toContain('Superaste');
    });

    it('cambiar el presupuesto crea otro registro y el mes anterior conserva el suyo', async () => {
      await db.budgets.put({ ...budget, effectiveFrom: '2026-09-01' });
      const repo = TestBed.inject(BudgetRepo);
      await repo.setFrom('cat-a', 70_000_000, '2026-10');
      const all = await db.budgets.toArray();
      expect(all).toHaveLength(2);
      expect(all.find((b) => b.effectiveFrom === '2026-09-01')?.amountMinor).toBe(60_000_000);
      expect(all.find((b) => b.effectiveFrom === '2026-10-01')?.amountMinor).toBe(70_000_000);
    });
  });
});
