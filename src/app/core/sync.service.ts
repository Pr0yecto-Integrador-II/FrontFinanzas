import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, ApiError, PullChange, PushResponse } from './api';
import { AuthService } from './auth.service';
import { Clock } from './clock';
import { Db } from './db';
import { LocalStore } from './local-store';
import { fromPull } from './mappers';
import { liveSignal } from './live';
import { EntityName, OutboxItem } from './models';

const BATCH = 500;
const INTERVAL_MS = 60_000;

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/**
 * Sincronización con el servidor (BLUEPRINT 6.4): envía el outbox en orden,
 * luego descarga lo nuevo por `version`. Se dispara al abrir, al volver la
 * conexión o la pestaña y cada 60 s. Nunca bloquea la interfaz.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly db = inject(Db);
  private readonly store = inject(LocalStore);
  private readonly clock = inject(Clock);

  private running = false;
  private started = false;

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly status = signal<SyncStatus>('idle');
  readonly lastSyncedAt = signal<Date | null>(null);
  readonly pendingCount = liveSignal(() => this.db.outbox.count(), 0);
  readonly rejectedCount = liveSignal(
    async () =>
      (await this.db.categories.where('syncState').equals('rejected').count()) +
      (await this.db.transactions.where('syncState').equals('rejected').count()) +
      (await this.db.recurringRules.where('syncState').equals('rejected').count()) +
      (await this.db.budgets.where('syncState').equals('rejected').count()),
    0,
  );
  readonly offline = computed(() => !this.online());

  /** Engancha los disparadores automáticos. Es idempotente. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.sync();
    });
    window.addEventListener('offline', () => this.online.set(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
    setInterval(() => void this.sync(), INTERVAL_MS);
    void this.sync();
  }

  async sync(): Promise<void> {
    if (this.running || !this.online() || !this.auth.isAuthenticated()) return;
    this.running = true;
    this.status.set('syncing');
    try {
      await this.pushAll();
      await this.pullAll();
      this.lastSyncedAt.set(this.clock.now());
      this.status.set('idle');
    } catch (e) {
      const err = e as ApiError;
      this.status.set(err.offline ? 'offline' : 'error');
    } finally {
      this.running = false;
    }
  }

  private async pushAll(): Promise<void> {
    for (;;) {
      const items = await this.db.outbox.orderBy('seq').limit(BATCH).toArray();
      if (!items.length) return;
      const res = await this.api.push(
        items.map((i) => ({ entity: i.entity, op: i.op, id: i.entityId, data: i.payload ?? {} })),
      );
      const handled = await this.applyPushResult(items, res);
      if (!handled || items.length < BATCH) return;
    }
  }

  private async applyPushResult(items: OutboxItem[], res: PushResponse): Promise<boolean> {
    const applied = new Set(res.applied);
    const rejected = new Map(res.rejected.map((r) => [r.id, r]));
    let handled = false;
    await this.db.transaction(
      'rw',
      [this.db.outbox, this.db.categories, this.db.transactions, this.db.recurringRules, this.db.budgets],
      async () => {
        for (const item of items) {
          const isApplied = applied.has(item.entityId);
          const rej = rejected.get(item.entityId);
          if (!isApplied && !rej) continue;
          handled = true;
          await this.db.outbox.delete(item.seq as number);
          // Si el usuario cambió el registro mientras viajaba, queda pendiente
          const newer = await this.db.outbox.where('entityId').equals(item.entityId).count();
          if (newer) continue;
          const table = this.store.table(item.entity);
          if (rej) {
            await table.update(item.entityId, {
              syncState: 'rejected',
              rejection: { code: rej.code, message: rej.message },
            });
          } else {
            await table.update(item.entityId, { syncState: 'synced', rejection: undefined });
          }
        }
      },
    );
    return handled;
  }

  private async pullAll(): Promise<void> {
    let since = (await this.db.getMeta<number>('lastPulledVersion')) ?? 0;
    for (;;) {
      const res = await this.api.pull(since, BATCH);
      await this.applyPull(res.changes);
      since = res.next_since;
      await this.db.setMeta('lastPulledVersion', since);
      if (!res.has_more) return;
    }
  }

  private async applyPull(changes: PullChange[]): Promise<void> {
    if (!changes.length) return;
    const stamp = this.clock.now().toISOString();
    await this.db.transaction(
      'rw',
      [this.db.categories, this.db.transactions, this.db.recurringRules, this.db.budgets],
      async () => {
        for (const c of changes) {
          const table = this.store.table(c.entity);
          const local = await table.get(c.id);
          // Lo pendiente o rechazado del dispositivo manda hasta que se resuelva
          if (local && local.syncState !== 'synced') continue;
          const deletedAt = c.deleted ? (local?.deletedAt ?? stamp) : null;
          await table.put(fromPull(c.entity, c.id, c.data, deletedAt));
        }
      },
    );
  }

  /** Descarta un cambio rechazado: vuelve a la versión del servidor, o lo quita si nunca existió allí. */
  async discardRejected(entity: EntityName, id: string): Promise<void> {
    const table = this.store.table(entity);
    let since = 0;
    for (;;) {
      const res = await this.api.pull(since, BATCH);
      const hit = res.changes.find((c) => c.entity === entity && c.id === id);
      if (hit) {
        await table.put(fromPull(entity, id, hit.data, hit.deleted ? this.clock.now().toISOString() : null));
        return;
      }
      since = res.next_since;
      if (!res.has_more) break;
    }
    await table.delete(id); // nunca llegó al servidor: no hay marca de borrado que conservar
  }

  /** Reenvía un cambio rechazado tal como está (por ejemplo, tras corregir la causa). */
  async retryRejected(entity: EntityName, id: string): Promise<void> {
    const record = await this.store.table(entity).get(id);
    if (!record) return;
    if (record.deletedAt) await this.store.remove(entity, record);
    else await this.store.upsert(entity, record);
    void this.sync();
  }
}
