import { addMonths, monthEnd, monthOf, monthStart } from '../../../core/dates';
import { Category, Transaction } from '../../../core/models';

/** Un movimiento cuenta en el balance si está confirmado y no fue eliminado (6.3.5). */
export function counts(t: Transaction): boolean {
  return t.status === 'confirmed' && !t.deletedAt;
}

export interface MonthTotals {
  income: number;
  expense: number;
  balance: number;
}

export function monthTotals(txs: readonly Transaction[], month: string): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!counts(t) || monthOf(t.occurredOn) !== month) continue;
    if (t.type === 'income') income += t.amountMinor;
    else expense += t.amountMinor;
  }
  return { income, expense, balance: income - expense };
}

/** Variación porcentual redondeada; `null` si el mes anterior fue 0 (se muestra "—"). */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface CategoryShare {
  categoryId: string;
  amountMinor: number;
  percent: number;
}

/** Gasto del mes por categoría, de mayor a menor. */
export function expenseByCategory(txs: readonly Transaction[], month: string): CategoryShare[] {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (!counts(t) || t.type !== 'expense' || monthOf(t.occurredOn) !== month) continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
    total += t.amountMinor;
  }
  return [...byCat.entries()]
    .map(([categoryId, amountMinor]) => ({
      categoryId,
      amountMinor,
      percent: total ? (amountMinor / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export function topCategories(txs: readonly Transaction[], month: string, n = 5): CategoryShare[] {
  return expenseByCategory(txs, month).slice(0, n);
}

export interface PendingTotals {
  count: number;
  expense: number;
  income: number;
}

export function pendingTotals(txs: readonly Transaction[]): PendingTotals {
  const out = { count: 0, expense: 0, income: 0 };
  for (const t of txs) {
    if (t.status !== 'pending' || t.deletedAt) continue;
    out.count += 1;
    if (t.type === 'income') out.income += t.amountMinor;
    else out.expense += t.amountMinor;
  }
  return out;
}

export interface DonutSlice {
  key: string;
  name: string;
  color: string;
  amountMinor: number;
  percent: number;
  categoryId: string | null;
}

export const OTHERS_COLOR = '#94A3B8';

/** HU15: las 6 categorías con más gasto; el resto se agrupa en "Otras". */
export function donutSlices(
  shares: readonly CategoryShare[],
  categories: ReadonlyMap<string, Category>,
  max = 6,
): DonutSlice[] {
  const head: DonutSlice[] = shares.slice(0, max).map((s) => {
    const c = categories.get(s.categoryId);
    return {
      key: s.categoryId,
      name: c?.name ?? 'Sin categoría',
      color: c?.color ?? OTHERS_COLOR,
      amountMinor: s.amountMinor,
      percent: s.percent,
      categoryId: s.categoryId,
    };
  });
  const rest = shares.slice(max);
  if (rest.length) {
    head.push({
      key: 'others',
      name: 'Otras',
      color: OTHERS_COLOR,
      amountMinor: rest.reduce((a, s) => a + s.amountMinor, 0),
      percent: rest.reduce((a, s) => a + s.percent, 0),
      categoryId: null,
    });
  }
  return head;
}

export interface MonthBar {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

/** HU15: ingresos y gastos de los últimos `n` meses terminando en `month`; vacíos en cero. */
export function lastMonths(txs: readonly Transaction[], month: string, n = 6): MonthBar[] {
  const out: MonthBar[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = addMonths(month, -i);
    out.push({ month: m, ...monthTotals(txs, m) });
  }
  return out;
}

export function monthRange(month: string): { from: string; to: string } {
  return { from: monthStart(month), to: monthEnd(month) };
}
