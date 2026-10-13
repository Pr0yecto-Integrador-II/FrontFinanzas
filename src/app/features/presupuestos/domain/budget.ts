import { monthOf, monthStart } from '../../../core/dates';
import { Budget, Transaction } from '../../../core/models';
import { counts } from '../../resumen/domain/summary';

/** Presupuesto vigente de un mes: el de mayor `effectiveFrom` que sea ≤ ese mes (6.3.5). */
export function effectiveBudget(
  budgets: readonly Budget[],
  categoryId: string,
  month: string,
): Budget | null {
  const limit = monthStart(month);
  let best: Budget | null = null;
  for (const b of budgets) {
    if (b.deletedAt || b.categoryId !== categoryId || b.effectiveFrom > limit) continue;
    if (!best || b.effectiveFrom > best.effectiveFrom) best = b;
  }
  return best;
}

export function spentInMonth(
  txs: readonly Transaction[],
  categoryId: string,
  month: string,
): number {
  let total = 0;
  for (const t of txs) {
    if (counts(t) && t.type === 'expense' && t.categoryId === categoryId && monthOf(t.occurredOn) === month) {
      total += t.amountMinor;
    }
  }
  return total;
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface BudgetStatus {
  limit: number;
  spent: number;
  percent: number;
  remaining: number;
  level: BudgetLevel;
}

/** Verde < 80 %, amarillo 80–99 %, rojo ≥ 100 % (HU14 regla 3). */
export function budgetStatus(limit: number, spent: number): BudgetStatus {
  const percent = limit > 0 ? (spent / limit) * 100 : 0;
  const level: BudgetLevel = percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok';
  return { limit, spent, percent, remaining: limit - spent, level };
}

/** Umbrales que cruza un gasto al pasar de `before` a `after` (HU14 regla 4). */
export function crossedThresholds(limit: number, before: number, after: number): (80 | 100)[] {
  const out: (80 | 100)[] = [];
  for (const t of [80, 100] as const) {
    const edge = (limit * t) / 100;
    if (before < edge && after >= edge) out.push(t);
  }
  return out;
}

export function firstOfMonth(month: string): string {
  return monthStart(month);
}
