import { Injectable, computed, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { Clock } from '../../../core/clock';
import { Db } from '../../../core/db';
import { LocalStore, WriteOp } from '../../../core/local-store';
import { liveSignal } from '../../../core/live';
import { Frequency, RecurringRule, RuleMode, Transaction, TxType } from '../../../core/models';
import { occurrenceId, occurrencesBetween } from '../domain/recurrence';

export interface RuleInput {
  id?: string;
  type: TxType;
  amountMinor: number;
  categoryId: string;
  description: string;
  frequency: Frequency;
  startOn: string;
  endOn: string | null;
  maxOccurrences: number | null;
  mode: RuleMode;
}

@Injectable({ providedIn: 'root' })
export class RuleRepo {
  private readonly db = inject(Db);
  private readonly store = inject(LocalStore);
  private readonly clock = inject(Clock);

  private readonly everything = liveSignal(() => this.db.recurringRules.toArray(), [] as RecurringRule[]);

  readonly byId = computed(() => new Map(this.everything().map((r) => [r.id, r])));
  readonly active = computed(() =>
    this.everything()
      .filter((r) => !r.deletedAt)
      .sort((a, b) => a.startOn.localeCompare(b.startOn)),
  );

  async get(id: string): Promise<RecurringRule | undefined> {
    return this.db.recurringRules.get(id);
  }

  async save(input: RuleInput): Promise<RecurringRule> {
    const existing = input.id ? await this.db.recurringRules.get(input.id) : undefined;
    const record: RecurringRule = {
      id: existing?.id ?? uuid(),
      type: input.type,
      amountMinor: input.amountMinor,
      categoryId: input.categoryId,
      description: input.description.trim() || null,
      frequency: input.frequency,
      startOn: input.startOn,
      endOn: input.maxOccurrences ? null : input.endOn,
      maxOccurrences: input.endOn ? null : input.maxOccurrences,
      mode: input.mode,
      // `generateFrom` nunca retrocede (D-44): editar no reabre fechas ya vividas
      generateFrom:
        existing && existing.generateFrom > input.startOn ? existing.generateFrom : input.startOn,
      pausedAt: existing?.pausedAt ?? null,
      createdAt: existing?.createdAt ?? this.clock.now().toISOString(),
      deletedAt: null,
      syncState: 'pending',
    };
    await this.store.upsert('recurring_rule', record);
    return record;
  }

  async pause(rule: RecurringRule): Promise<void> {
    await this.store.upsert('recurring_rule', { ...rule, pausedAt: this.clock.now().toISOString() });
  }

  /** Al reanudar no se generan las fechas del periodo pausado (HU09 regla 7). */
  async resume(rule: RecurringRule): Promise<void> {
    const today = this.clock.today();
    await this.store.upsert('recurring_rule', {
      ...rule,
      pausedAt: null,
      generateFrom: rule.generateFrom > today ? rule.generateFrom : today,
    });
  }

  /** Elimina la regla y los pendientes sin confirmar; los movimientos registrados se conservan. */
  async remove(rule: RecurringRule): Promise<void> {
    const pending = await this.db.transactions
      .where('recurringRuleId')
      .equals(rule.id)
      .filter((t) => t.status === 'pending' && !t.deletedAt)
      .toArray();
    const ops: WriteOp[] = pending.map((t) => ({
      kind: 'delete',
      entity: 'transaction',
      record: t,
    }));
    ops.push({ kind: 'delete', entity: 'recurring_rule', record: rule });
    await this.store.write(ops);
  }

  /**
   * Genera las ocurrencias que quedaron atrás (HU09 regla 4). El ID es determinista,
   * así que correr dos veces o en dos dispositivos no duplica nada.
   */
  async generateDue(): Promise<number> {
    const today = this.clock.today();
    const rules = await this.db.recurringRules.filter((r) => !r.deletedAt && !r.pausedAt).toArray();
    const ops: WriteOp[] = [];
    for (const rule of rules) {
      const dates = occurrencesBetween(rule, rule.generateFrom, today);
      for (const date of dates) {
        const id = occurrenceId(rule.id, date);
        // Incluye las eliminadas u omitidas: no se vuelven a generar
        if (await this.db.transactions.get(id)) continue;
        const tx: Transaction = {
          id,
          type: rule.type,
          amountMinor: rule.amountMinor,
          categoryId: rule.categoryId,
          occurredOn: date,
          description: rule.description,
          note: null,
          tags: [],
          status: rule.mode === 'auto' ? 'confirmed' : 'pending',
          recurringRuleId: rule.id,
          createdAt: this.clock.now().toISOString(),
          deletedAt: null,
          syncState: 'pending',
        };
        ops.push({ kind: 'upsert', entity: 'transaction', record: tx });
      }
    }
    await this.store.write(ops);
    await this.db.setMeta('lastRecurringRunOn', today);
    return ops.length;
  }
}
