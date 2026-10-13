import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  Account,
  Budget,
  BudgetAlert,
  Category,
  OutboxItem,
  RecurringRule,
  Transaction,
} from './models';

export type MetaKey = 'lastPulledVersion' | 'lastRecurringRunOn' | 'lastUsedCategoryId' | 'account';

export interface MetaRow {
  key: MetaKey;
  value: unknown;
}

/** Copia local de un solo usuario (Blueprint 6.3.4). Cambios de esquema: solo con una nueva `version(n)`. */
export class FinanzasDb extends Dexie {
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  recurringRules!: Table<RecurringRule, string>;
  budgets!: Table<Budget, string>;
  outbox!: Table<OutboxItem, number>;
  budgetAlerts!: Table<BudgetAlert, [string, string, number]>;
  meta!: Table<MetaRow, MetaKey>;

  constructor(name = 'finanzas') {
    super(name);
    this.version(1).stores({
      categories: 'id, type, [type+nameKey], syncState',
      transactions:
        'id, [occurredOn+createdAt], categoryId, type, status, *tags, recurringRuleId, syncState',
      recurringRules: 'id, categoryId, syncState',
      budgets: 'id, [categoryId+effectiveFrom], syncState',
      outbox: '++seq, entity, entityId',
      budgetAlerts: '[categoryId+month+threshold]',
      meta: 'key',
    });
  }

  async getMeta<T>(key: MetaKey): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: MetaKey, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }

  /** Vacía todo el contenido del usuario (cerrar sesión, HU02). */
  async wipe(): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      await Promise.all(this.tables.map((t) => t.clear()));
    });
  }
}

@Injectable({ providedIn: 'root' })
export class Db extends FinanzasDb {
  constructor() {
    super();
  }

  async getAccount(): Promise<Account | undefined> {
    return this.getMeta<Account>('account');
  }
}
