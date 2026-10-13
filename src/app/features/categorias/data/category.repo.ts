import { Injectable, computed, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { Clock } from '../../../core/clock';
import { Db } from '../../../core/db';
import { LocalStore } from '../../../core/local-store';
import { liveSignal } from '../../../core/live';
import { Category, TxType } from '../../../core/models';
import { nameKey } from '../domain/rules';

export interface CategoryInput {
  name: string;
  type: TxType;
  icon: string;
  color: string;
}

export interface CategoryUsage {
  transactions: number;
  rules: number;
  budgets: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class CategoryRepo {
  private readonly db = inject(Db);
  private readonly store = inject(LocalStore);
  private readonly clock = inject(Clock);

  /** Todas, incluidas las eliminadas: los movimientos viejos aún las muestran. */
  private readonly everything = liveSignal(() => this.db.categories.toArray(), [] as Category[]);

  readonly byId = computed(() => new Map(this.everything().map((c) => [c.id, c])));
  readonly active = computed(() =>
    this.everything()
      .filter((c) => !c.deletedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'es')),
  );
  readonly expense = computed(() => this.active().filter((c) => c.type === 'expense'));
  readonly income = computed(() => this.active().filter((c) => c.type === 'income'));

  ofType(type: TxType): Category[] {
    return type === 'expense' ? this.expense() : this.income();
  }

  async create(input: CategoryInput): Promise<Category> {
    const name = input.name.trim();
    const record: Category = {
      id: uuid(),
      name,
      nameKey: nameKey(name),
      type: input.type,
      icon: input.icon,
      color: input.color,
      isDefault: false,
      createdAt: this.clock.now().toISOString(),
      deletedAt: null,
      syncState: 'pending',
    };
    await this.store.upsert('category', record);
    return record;
  }

  async update(id: string, changes: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'type'>>) {
    const current = await this.db.categories.get(id);
    if (!current) return;
    const name = (changes.name ?? current.name).trim();
    await this.store.upsert('category', {
      ...current,
      ...changes,
      name,
      nameKey: nameKey(name),
    });
  }

  async usage(id: string): Promise<CategoryUsage> {
    const [transactions, rules, budgets] = await Promise.all([
      this.db.transactions
        .where('categoryId')
        .equals(id)
        .filter((t) => !t.deletedAt)
        .count(),
      this.db.recurringRules
        .where('categoryId')
        .equals(id)
        .filter((r) => !r.deletedAt)
        .count(),
      this.db.budgets
        .where('categoryId')
        .equals(id)
        .filter((b) => !b.deletedAt)
        .count(),
    ]);
    return { transactions, rules, budgets, total: transactions + rules + budgets };
  }

  /** Elimina con reasignación atómica; `reassignTo` es obligatorio si la categoría tiene usos. */
  remove(id: string, reassignTo: string | null): Promise<void> {
    return this.store.deleteCategory(id, reassignTo);
  }
}
