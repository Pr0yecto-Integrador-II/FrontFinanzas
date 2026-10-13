import { addDays, monthEnd, monthOf, monthStart, addMonths } from '../../../core/dates';
import { Transaction, TxType } from '../../../core/models';
import { nameKey } from '../../categorias/domain/rules';

export type PeriodKey = 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'custom' | 'all';

export interface TxFilters {
  period: PeriodKey;
  from: string | null;
  to: string | null;
  type: TxType | 'all';
  categoryIds: string[];
  minMinor: number | null;
  maxMinor: number | null;
  tag: string | null;
  text: string;
}

export const EMPTY_FILTERS: TxFilters = {
  period: 'all',
  from: null,
  to: null,
  type: 'all',
  categoryIds: [],
  minMinor: null,
  maxMinor: null,
  tag: null,
  text: '',
};

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  this_month: 'Este mes',
  last_month: 'Mes pasado',
  last_30: 'Últimos 30 días',
  this_year: 'Este año',
  custom: 'Personalizado',
  all: 'Todo',
};

export function periodRange(
  f: Pick<TxFilters, 'period' | 'from' | 'to'>,
  today: string,
): { from: string | null; to: string | null } {
  const month = monthOf(today);
  switch (f.period) {
    case 'this_month':
      return { from: monthStart(month), to: monthEnd(month) };
    case 'last_month': {
      const prev = addMonths(month, -1);
      return { from: monthStart(prev), to: monthEnd(prev) };
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'custom':
      return { from: f.from, to: f.to };
    default:
      return { from: null, to: null };
  }
}

export function activeFilterCount(f: TxFilters): number {
  return (
    (f.period !== 'all' ? 1 : 0) +
    (f.type !== 'all' ? 1 : 0) +
    (f.categoryIds.length ? 1 : 0) +
    (f.minMinor !== null || f.maxMinor !== null ? 1 : 0) +
    (f.tag ? 1 : 0) +
    (f.text.trim() ? 1 : 0)
  );
}

/** Aplica los filtros con "y". Dentro de categorías, con "o" (HU12 regla 2). */
export function applyFilters(
  txs: readonly Transaction[],
  f: TxFilters,
  today: string,
): Transaction[] {
  const { from, to } = periodRange(f, today);
  const q = nameKey(f.text);
  return txs.filter((t) => {
    if (t.deletedAt || t.status !== 'confirmed') return false;
    if (from && t.occurredOn < from) return false;
    if (to && t.occurredOn > to) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryIds.length && !f.categoryIds.includes(t.categoryId)) return false;
    if (f.minMinor !== null && t.amountMinor < f.minMinor) return false;
    if (f.maxMinor !== null && t.amountMinor > f.maxMinor) return false;
    if (f.tag && !t.tags.includes(f.tag)) return false;
    if (q) {
      const hay = nameKey(`${t.description ?? ''} ${t.note ?? ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface FilteredTotals {
  count: number;
  expense: number;
  income: number;
}

export function filteredTotals(txs: readonly Transaction[]): FilteredTotals {
  let expense = 0;
  let income = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amountMinor;
    else expense += t.amountMinor;
  }
  return { count: txs.length, expense, income };
}

/** Orden de HU11: fecha descendente y, en el mismo día, el último registrado primero. */
export function compareTx(a: Transaction, b: Transaction): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return 0;
}

export interface DayGroup {
  date: string;
  net: number;
  items: Transaction[];
}

export function groupByDay(txs: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of txs) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.occurredOn) {
      g = { date: t.occurredOn, net: 0, items: [] };
      groups.push(g);
    }
    g.items.push(t);
    g.net += t.type === 'income' ? t.amountMinor : -t.amountMinor;
  }
  return groups;
}
