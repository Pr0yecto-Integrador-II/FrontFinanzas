import { Injectable, computed, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { Clock } from '../../../core/clock';
import { Db } from '../../../core/db';
import { LocalStore } from '../../../core/local-store';
import { liveSignal } from '../../../core/live';
import { Transaction, TxType } from '../../../core/models';
import { compareTx } from '../domain/filters';

export interface TransactionInput {
  id?: string;
  type: TxType;
  amountMinor: number;
  categoryId: string;
  occurredOn: string;
  description: string;
  note: string;
  tags: string[];
}

type LastUsed = Partial<Record<TxType, string>>;

@Injectable({ providedIn: 'root' })
export class TransactionRepo {
  private readonly db = inject(Db);
  private readonly store = inject(LocalStore);
  private readonly clock = inject(Clock);

  private readonly everything = liveSignal(() => this.db.transactions.toArray(), [] as Transaction[]);
  private readonly last = liveSignal(
    async () => (await this.db.getMeta<LastUsed>('lastUsedCategoryId')) ?? {},
    {} as LastUsed,
  );

  /** Movimientos visibles (sin eliminados), del más reciente al más antiguo. */
  readonly visible = computed(() => this.everything().filter((t) => !t.deletedAt).sort(compareTx));
  /** Confirmados y no eliminados. */
  readonly confirmed = computed(() => this.visible().filter((t) => t.status === 'confirmed'));
  readonly pending = computed(() => this.visible().filter((t) => t.status === 'pending'));
  readonly rejected = computed(() => this.everything().filter((t) => t.syncState === 'rejected'));

  /** Etiquetas ya usadas, de la más frecuente a la menos (sugerencias de HU10). */
  readonly knownTags = computed(() => {
    const counts = new Map<string, number>();
    for (const t of this.visible()) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  });

  /** Categoría a preseleccionar al registrar (HU04): la última usada de ese tipo. */
  lastUsedCategory(type: TxType): string | null {
    return this.last()[type] ?? null;
  }

  async get(id: string): Promise<Transaction | undefined> {
    return this.db.transactions.get(id);
  }

  async save(input: TransactionInput): Promise<Transaction> {
    const existing = input.id ? await this.db.transactions.get(input.id) : undefined;
    const record: Transaction = {
      id: existing?.id ?? input.id ?? uuid(),
      // El tipo, la fecha de creación y la regla de origen no cambian al editar (HU06)
      type: existing?.type ?? input.type,
      amountMinor: input.amountMinor,
      categoryId: input.categoryId,
      occurredOn: input.occurredOn,
      description: input.description.trim() || null,
      note: input.note.trim() || null,
      tags: input.tags,
      status: existing?.status ?? 'confirmed',
      recurringRuleId: existing?.recurringRuleId ?? null,
      createdAt: existing?.createdAt ?? this.clock.now().toISOString(),
      deletedAt: null,
      syncState: 'pending',
    };
    await this.store.upsert('transaction', record);
    const last: LastUsed = { ...(await this.db.getMeta<LastUsed>('lastUsedCategoryId')), [record.type]: record.categoryId };
    await this.db.setMeta('lastUsedCategoryId', last);
    return record;
  }

  /** Confirma un pendiente de una regla, con el monto ajustado (HU09 regla 3). */
  async confirm(id: string, amountMinor: number): Promise<void> {
    const t = await this.db.transactions.get(id);
    if (!t) return;
    await this.store.upsert('transaction', { ...t, amountMinor, status: 'confirmed' });
  }

  /** Omitir una ocurrencia: baja lógica; su ID determinista evita que se regenere. */
  async skip(id: string): Promise<void> {
    const t = await this.db.transactions.get(id);
    if (t) await this.store.remove('transaction', t);
  }

  async remove(t: Transaction): Promise<void> {
    await this.store.remove('transaction', t);
  }

  async restore(t: Transaction): Promise<void> {
    await this.store.restore('transaction', t);
  }
}
