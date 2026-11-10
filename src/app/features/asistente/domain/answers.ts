/**
 * Respuestas habladas del asistente (HU20). Funciones puras: reciben los datos locales y la
 * fecha de hoy (del `Clock`) y devuelven el texto que se lee en voz alta. Nunca escriben.
 */
import {
  addDays,
  addMonths,
  monthEnd,
  monthOf,
  monthStart,
  parseIso,
  weekday,
} from '../../../core/dates';
import { Budget, Category, Transaction, TxType } from '../../../core/models';
import { budgetStatus, effectiveBudget, spentInMonth } from '../../presupuestos/domain/budget';
import { counts } from '../../resumen/domain/summary';
import { compareTx } from '../../movimientos/domain/filters';
import { formatTransactionForSpeech, spokenMoney } from '../../movimientos/domain/voice';
import { Period, TotalsMetric, TypeFilter } from './intents';

export interface Bounds {
  from: string;
  to: string;
  /** Cómo se dice dentro de una frase: "este mes", "la semana pasada"… */
  label: string;
}

/** Rango de fechas de un periodo hablado. La semana empieza el lunes. */
export function periodBounds(period: Period, today: string): Bounds {
  const sinceMonday = (weekday(today) + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  switch (period) {
    case 'today':
      return { from: today, to: today, label: 'hoy' };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y, label: 'ayer' };
    }
    case 'week':
      return { from: monday, to: today, label: 'esta semana' };
    case 'last_week':
      return { from: addDays(monday, -7), to: addDays(monday, -1), label: 'la semana pasada' };
    case 'month': {
      const m = monthOf(today);
      return { from: monthStart(m), to: monthEnd(m), label: 'este mes' };
    }
    case 'last_month': {
      const m = addMonths(monthOf(today), -1);
      return { from: monthStart(m), to: monthEnd(m), label: 'el mes pasado' };
    }
    case 'last_7':
      return { from: addDays(today, -6), to: today, label: 'en los últimos 7 días' };
    case 'last_30':
      return { from: addDays(today, -29), to: today, label: 'en los últimos 30 días' };
    case 'year': {
      const { y } = parseIso(today);
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: 'este año' };
    }
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31', label: 'en total' };
  }
}

const inBounds = (t: Transaction, b: Bounds) => t.occurredOn >= b.from && t.occurredOn <= b.to;
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);
const plural = (type: TypeFilter, n: number): string => {
  if (type === 'expense') return n === 1 ? 'gasto' : 'gastos';
  if (type === 'income') return n === 1 ? 'ingreso' : 'ingresos';
  return n === 1 ? 'movimiento' : 'movimientos';
};
const inCategory = (categoryName: string | null) => (categoryName ? ` en ${categoryName}` : '');

export interface Selection {
  type: TypeFilter;
  period: Period | null;
  categoryId?: string | null;
}

/** Movimientos confirmados y vigentes que cumplen el filtro, del más reciente al más antiguo. */
export function selectTransactions(
  txs: readonly Transaction[],
  sel: Selection,
  today: string,
): Transaction[] {
  const bounds = sel.period ? periodBounds(sel.period, today) : null;
  return txs
    .filter(
      (t) =>
        counts(t) &&
        (sel.type === 'all' || t.type === sel.type) &&
        (!sel.categoryId || t.categoryId === sel.categoryId) &&
        (!bounds || inBounds(t, bounds)),
    )
    .sort(compareTx);
}

export interface RecentInfo {
  type: TypeFilter;
  period: Period | null;
  categoryName: string | null;
  /** Cuántos cumplen el filtro en total (puede ser más de los que se leen). */
  total: number;
}

/** "Tus últimos 3 gastos en Alimentación. Gasto de $25.000 …". Texto único para una sola locución. */
export function recentAnswer(
  list: readonly Transaction[],
  info: RecentInfo,
  categoryName: (id: string) => string | undefined,
  currency: string,
  today: string,
): string {
  const { type, period } = info;
  const cat = inCategory(info.categoryName);
  const when = period ? ` ${periodBounds(period, today).label}` : '';
  if (!list.length) return `No tienes ${plural(type, 2)}${cat} registrados${when}`;
  const noun = plural(type, list.length);
  const intro = period
    ? `Tus ${noun}${cat}${when}`
    : list.length === 1
      ? `Tu último ${noun}${cat}`
      : `Tus últimos ${list.length} ${noun}${cat}`;
  const items = list.map((t) =>
    formatTransactionForSpeech(t, categoryName(t.categoryId), currency, today),
  );
  const more =
    info.total > list.length
      ? [`Tienes ${info.total - list.length} más. Los puedes ver en Movimientos`]
      : [];
  return [intro, ...items, ...more].join('. ');
}

function sumIn(
  txs: readonly Transaction[],
  type: 'expense' | 'income',
  b: Bounds,
  categoryId: string | null = null,
): number {
  let total = 0;
  for (const t of txs) {
    if (
      counts(t) &&
      t.type === type &&
      inBounds(t, b) &&
      (!categoryId || t.categoryId === categoryId)
    ) {
      total += t.amountMinor;
    }
  }
  return total;
}

export function totalsAnswer(
  txs: readonly Transaction[],
  metric: TotalsMetric,
  period: Period,
  category: { id: string | null; name: string | null },
  currency: string,
  today: string,
): string {
  const b = periodBounds(period, today);
  const label = cap(b.label);
  const cat = inCategory(category.name);
  if (metric === 'expense') {
    const expense = sumIn(txs, 'expense', b, category.id);
    return expense
      ? `${label} gastaste ${spokenMoney(expense, currency)}${cat}`
      : `No tienes gastos registrados${cat} ${b.label}`;
  }
  if (metric === 'income') {
    const income = sumIn(txs, 'income', b, category.id);
    return income
      ? `${label} recibiste ${spokenMoney(income, currency)}${cat}`
      : `No tienes ingresos registrados${cat} ${b.label}`;
  }
  const expense = sumIn(txs, 'expense', b);
  const income = sumIn(txs, 'income', b);
  if (!expense && !income) return `No tienes movimientos registrados ${b.label}`;
  const balance = income - expense;
  const verdict =
    balance === 0
      ? 'tu balance es cero'
      : balance > 0
        ? `tienes un balance a favor de ${spokenMoney(balance, currency)}`
        : `tienes un déficit de ${spokenMoney(-balance, currency)}`;
  return `${label} tus ingresos fueron ${spokenMoney(income, currency)}, tus gastos ${spokenMoney(expense, currency)} y ${verdict}`;
}

/** Las 3 categorías donde más se gastó en el periodo. */
export function topAnswer(
  txs: readonly Transaction[],
  period: Period,
  categoryName: (id: string) => string | undefined,
  currency: string,
  today: string,
): string {
  const b = periodBounds(period, today);
  const byCat = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (!counts(t) || t.type !== 'expense' || !inBounds(t, b)) continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor);
    total += t.amountMinor;
  }
  if (!total) return `No tienes gastos registrados ${b.label}`;
  const top = [...byCat.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3);
  const parts = top.map(([id, amount], i) => {
    const name = categoryName(id) ?? 'una categoría eliminada';
    const pct = Math.round((amount / total) * 100);
    return i === 0
      ? `${cap(b.label)} gastaste más en ${name}: ${spokenMoney(amount, currency)}, el ${pct} %`
      : `${name}: ${spokenMoney(amount, currency)}, el ${pct} %`;
  });
  return parts.join('. Luego ');
}

/** "Tu mayor gasto este mes fue: Gasto de $80.000 …". */
export function extremeAnswer(
  txs: readonly Transaction[],
  type: TxType,
  period: Period,
  categoryName: (id: string) => string | undefined,
  currency: string,
  today: string,
): string {
  const b = periodBounds(period, today);
  const list = selectTransactions(txs, { type, period }, today);
  if (!list.length) return `No tienes ${plural(type, 2)} registrados ${b.label}`;
  // el más reciente gana los empates: `list` ya viene del más nuevo al más viejo
  const biggest = list.reduce((a, t) => (t.amountMinor > a.amountMinor ? t : a));
  const what = type === 'income' ? 'ingreso' : 'gasto';
  return `Tu mayor ${what} ${b.label} fue: ${formatTransactionForSpeech(
    biggest,
    categoryName(biggest.categoryId),
    currency,
    today,
  )}`;
}

/** "Este mes tienes 12 gastos registrados". */
export function countAnswer(
  txs: readonly Transaction[],
  type: TypeFilter,
  period: Period,
  today: string,
): string {
  const b = periodBounds(period, today);
  const n = selectTransactions(txs, { type, period }, today).length;
  if (!n) return `No tienes ${plural(type, 2)} registrados ${b.label}`;
  return `${cap(b.label)} tienes ${n} ${plural(type, n)} registrados`;
}

function compareOne(
  txs: readonly Transaction[],
  type: 'expense' | 'income',
  period: 'month' | 'week',
  currency: string,
  today: string,
): string {
  const now = periodBounds(period, today);
  const before = periodBounds(period === 'month' ? 'last_month' : 'last_week', today);
  const cur = sumIn(txs, type, now);
  const prev = sumIn(txs, type, before);
  const noun = type === 'expense' ? 'gastos' : 'ingresos';
  const verb = type === 'expense' ? 'gastado' : 'recibido';
  if (!cur && !prev) return `No tienes ${noun} registrados ni ${now.label} ni ${before.label}`;
  if (!prev) {
    return `${cap(now.label)} llevas ${verb} ${spokenMoney(cur, currency)} y ${before.label} no registraste ${noun}`;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const trend =
    pct === 0 ? 'prácticamente lo mismo' : `un ${Math.abs(pct)} % ${pct > 0 ? 'más' : 'menos'}`;
  return `${cap(now.label)} llevas ${verb} ${spokenMoney(cur, currency)} y ${before.label} ${spokenMoney(prev, currency)}: es ${trend}`;
}

/** Compara el periodo en curso con el anterior. */
export function compareAnswer(
  txs: readonly Transaction[],
  metric: TotalsMetric,
  period: 'month' | 'week',
  currency: string,
  today: string,
): string {
  if (metric === 'balance') {
    return [
      compareOne(txs, 'expense', period, currency, today),
      compareOne(txs, 'income', period, currency, today),
    ].join('. ');
  }
  return compareOne(txs, metric, period, currency, today);
}

function oneBudget(name: string, limit: number, spent: number, currency: string): string {
  const s = budgetStatus(limit, spent);
  const pct = Math.round(s.percent);
  return s.remaining >= 0
    ? `${name}: llevas ${spokenMoney(spent, currency)} de ${spokenMoney(limit, currency)}, el ${pct} %, y te quedan ${spokenMoney(s.remaining, currency)}`
    : `${name}: te pasaste por ${spokenMoney(-s.remaining, currency)}; llevas ${spokenMoney(spent, currency)} de ${spokenMoney(limit, currency)}, el ${pct} %`;
}

export function budgetAnswer(
  budgets: readonly Budget[],
  txs: readonly Transaction[],
  categories: readonly Category[],
  categoryId: string | null,
  month: string,
  currency: string,
): string {
  if (categoryId) {
    const name = categories.find((c) => c.id === categoryId)?.name ?? 'esa categoría';
    const budget = effectiveBudget(budgets, categoryId, month);
    if (!budget) return `No tienes presupuesto para ${name} este mes`;
    return oneBudget(name, budget.amountMinor, spentInMonth(txs, categoryId, month), currency);
  }
  const rows = categories
    .filter((c) => c.type === 'expense' && !c.deletedAt)
    .flatMap((c) => {
      const b = effectiveBudget(budgets, c.id, month);
      if (!b) return [];
      const spent = spentInMonth(txs, c.id, month);
      return [
        {
          name: c.name,
          limit: b.amountMinor,
          spent,
          percent: budgetStatus(b.amountMinor, spent).percent,
        },
      ];
    })
    .sort((a, b) => b.percent - a.percent);
  if (!rows.length) return 'No tienes presupuestos configurados este mes';
  const shown = rows.slice(0, 5);
  const head = `Tienes ${rows.length} ${rows.length === 1 ? 'presupuesto' : 'presupuestos'} este mes`;
  return [head, ...shown.map((r) => oneBudget(r.name, r.limit, r.spent, currency))].join('. ');
}
