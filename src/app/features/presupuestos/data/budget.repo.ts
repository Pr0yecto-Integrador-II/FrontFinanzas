import { Injectable, computed, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { monthOf, monthStart } from '../../../core/dates';
import { Clock } from '../../../core/clock';
import { Db } from '../../../core/db';
import { LocalStore } from '../../../core/local-store';
import { liveSignal } from '../../../core/live';
import { formatMoney } from '../../../core/money';
import { Budget, Transaction } from '../../../core/models';
import { crossedThresholds, effectiveBudget, spentInMonth } from '../domain/budget';

@Injectable({ providedIn: 'root' })
export class BudgetRepo {
  private readonly db = inject(Db);
  private readonly store = inject(LocalStore);
  private readonly clock = inject(Clock);

  private readonly everything = liveSignal(() => this.db.budgets.toArray(), [] as Budget[]);
  readonly active = computed(() => this.everything().filter((b) => !b.deletedAt));

  /**
   * Define el límite de una categoría desde `month` en adelante (HU14 regla 2):
   * si ya hay un registro para ese mes se corrige; si no, se crea uno nuevo
   * y los meses anteriores conservan el suyo.
   */
  async setFrom(categoryId: string, amountMinor: number, month: string): Promise<void> {
    const from = monthStart(month);
    const same = (await this.db.budgets.where('categoryId').equals(categoryId).toArray()).find(
      (b) => !b.deletedAt && b.effectiveFrom === from,
    );
    const record: Budget = same
      ? { ...same, amountMinor }
      : {
          id: uuid(),
          categoryId,
          amountMinor,
          effectiveFrom: from,
          createdAt: this.clock.now().toISOString(),
          deletedAt: null,
          syncState: 'pending',
        };
    await this.store.upsert('budget', record);
  }

  /** Elimina un registro de presupuesto: los meses que regía vuelven al anterior, si existe (D-45). */
  async remove(budget: Budget): Promise<void> {
    await this.store.remove('budget', budget);
  }

  async restore(budget: Budget): Promise<void> {
    await this.store.restore('budget', budget);
  }

  /**
   * Avisos de umbral tras guardar un gasto (HU14 regla 4). Cada umbral avisa una sola
   * vez por mes y categoría. `previousAmount` es el monto antes de editar (0 si es nuevo).
   */
  async alertsAfterSave(tx: Transaction, previousAmount: number, currency: string, categoryName: string) {
    if (tx.type !== 'expense' || tx.status !== 'confirmed') return [];
    const month = monthOf(tx.occurredOn);
    const budgets = await this.db.budgets.toArray();
    const budget = effectiveBudget(budgets, tx.categoryId, month);
    if (!budget) return [];
    const all = await this.db.transactions.where('categoryId').equals(tx.categoryId).toArray();
    const after = spentInMonth(all, tx.categoryId, month);
    const before = after - (tx.amountMinor - previousAmount);
    const messages: string[] = [];
    for (const threshold of crossedThresholds(budget.amountMinor, before, after)) {
      const key: [string, string, number] = [tx.categoryId, month, threshold];
      if (await this.db.budgetAlerts.get(key)) continue;
      await this.db.budgetAlerts.put({ categoryId: tx.categoryId, month, threshold });
      const pct = Math.round((after / budget.amountMinor) * 100);
      messages.push(
        threshold === 80
          ? `Llevas el ${pct} % de tu presupuesto de ${categoryName} (${formatMoney(after, currency)} de ${formatMoney(budget.amountMinor, currency)})`
          : `Superaste tu presupuesto de ${categoryName} por ${formatMoney(after - budget.amountMinor, currency)}`,
      );
    }
    return messages;
  }
}
