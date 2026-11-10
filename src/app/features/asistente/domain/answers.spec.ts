import { describe, expect, it } from 'vitest';
import { Budget, Category, Transaction } from '../../../core/models';
import {
  budgetAnswer,
  compareAnswer,
  countAnswer,
  extremeAnswer,
  periodBounds,
  recentAnswer,
  selectTransactions,
  topAnswer,
  totalsAnswer,
} from './answers';

const TODAY = '2026-10-12'; // lunes
const NO_CATEGORY = { id: null, name: null };

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't',
  type: 'expense',
  amountMinor: 2_500_000,
  categoryId: 'ali',
  occurredOn: TODAY,
  description: null,
  note: null,
  tags: [],
  status: 'confirmed',
  recurringRuleId: null,
  createdAt: '2026-10-12T12:00:00Z',
  deletedAt: null,
  syncState: 'synced',
  ...over,
});

const cat = (id: string, name: string): Category => ({
  id,
  name,
  nameKey: name.toLowerCase(),
  type: 'expense',
  icon: 'x',
  color: '#000000',
  isDefault: true,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  syncState: 'synced',
});

const CATS = [cat('ali', 'Alimentación'), cat('tra', 'Transporte')];
const name = (id: string) => CATS.find((c) => c.id === id)?.name;

const TXS: Transaction[] = [
  tx({ id: 'a', amountMinor: 2_500_000, description: 'Almuerzo' }),
  tx({
    id: 'b',
    amountMinor: 1_000_000,
    categoryId: 'tra',
    occurredOn: '2026-10-11',
    createdAt: '2026-10-11T10:00:00Z',
  }),
  tx({
    id: 'c',
    amountMinor: 50_000_000,
    type: 'income',
    categoryId: 'sal',
    occurredOn: '2026-10-01',
  }),
  tx({ id: 'd', amountMinor: 9_900_000, occurredOn: '2026-09-20' }),
  tx({ id: 'e', amountMinor: 700_000, status: 'pending' }),
  tx({ id: 'f', amountMinor: 800_000, deletedAt: '2026-10-12T00:00:00Z' }),
];

const ids = (list: readonly Transaction[]) => list.map((t) => t.id);

describe('periodBounds', () => {
  it('la semana empieza el lunes', () => {
    expect(periodBounds('week', TODAY)).toMatchObject({ from: '2026-10-12', to: '2026-10-12' });
    expect(periodBounds('week', '2026-10-15')).toMatchObject({ from: '2026-10-12' });
    expect(periodBounds('last_week', TODAY)).toMatchObject({
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('mes y mes pasado', () => {
    expect(periodBounds('month', TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodBounds('last_month', TODAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('últimos 7 y 30 días, año y total', () => {
    expect(periodBounds('last_7', TODAY)).toMatchObject({ from: '2026-10-06', to: TODAY });
    expect(periodBounds('last_30', TODAY)).toMatchObject({ from: '2026-09-13', to: TODAY });
    expect(periodBounds('year', TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodBounds('all', TODAY).label).toBe('en total');
  });
});

describe('selectTransactions', () => {
  it('toma los confirmados y vigentes, del más reciente al más antiguo', () => {
    expect(ids(selectTransactions(TXS, { type: 'expense', period: null }, TODAY))).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('filtra por tipo, día y categoría', () => {
    expect(ids(selectTransactions(TXS, { type: 'income', period: null }, TODAY))).toEqual(['c']);
    expect(ids(selectTransactions(TXS, { type: 'all', period: 'yesterday' }, TODAY))).toEqual([
      'b',
    ]);
    expect(
      ids(selectTransactions(TXS, { type: 'expense', period: null, categoryId: 'tra' }, TODAY)),
    ).toEqual(['b']);
  });
});

describe('lectura de los últimos movimientos', () => {
  const info = (over = {}) => ({
    type: 'expense' as const,
    period: null,
    categoryName: null,
    total: 3,
    ...over,
  });

  it('arma el texto con el formato de HU18', () => {
    const list = selectTransactions(TXS, { type: 'expense', period: null }, TODAY).slice(0, 2);
    expect(recentAnswer(list, info(), name, 'COP', TODAY)).toBe(
      'Tus últimos 2 gastos. ' +
        'Gasto de 25.000 pesos colombianos en la categoría Alimentación, registrado hoy, concepto: Almuerzo. ' +
        'Gasto de 10.000 pesos colombianos en la categoría Transporte, registrado ayer. ' +
        'Tienes 1 más. Los puedes ver en Movimientos',
    );
  });

  it('uno solo, con categoría y vacío', () => {
    const one = selectTransactions(TXS, { type: 'expense', period: null }, TODAY).slice(0, 1);
    expect(recentAnswer(one, info({ total: 1 }), name, 'COP', TODAY)).toMatch(
      /^Tu último gasto\. /,
    );
    expect(
      recentAnswer(one, info({ total: 1, categoryName: 'Alimentación' }), name, 'COP', TODAY),
    ).toMatch(/^Tu último gasto en Alimentación\. /);
    expect(
      recentAnswer([], info({ type: 'income', period: 'today', total: 0 }), name, 'COP', TODAY),
    ).toBe('No tienes ingresos registrados hoy');
    expect(recentAnswer([], info({ type: 'all', total: 0 }), name, 'COP', TODAY)).toBe(
      'No tienes movimientos registrados',
    );
  });
});

describe('totales', () => {
  it('gastos del mes (solo confirmados y vigentes)', () => {
    expect(totalsAnswer(TXS, 'expense', 'month', NO_CATEGORY, 'COP', TODAY)).toBe(
      'Este mes gastaste 35.000 pesos colombianos',
    );
  });

  it('por categoría', () => {
    expect(
      totalsAnswer(TXS, 'expense', 'month', { id: 'ali', name: 'Alimentación' }, 'COP', TODAY),
    ).toBe('Este mes gastaste 25.000 pesos colombianos en Alimentación');
    expect(
      totalsAnswer(TXS, 'expense', 'today', { id: 'tra', name: 'Transporte' }, 'COP', TODAY),
    ).toBe('No tienes gastos registrados en Transporte hoy');
  });

  it('ingresos y balance', () => {
    expect(totalsAnswer(TXS, 'income', 'month', NO_CATEGORY, 'COP', TODAY)).toBe(
      'Este mes recibiste 500.000 pesos colombianos',
    );
    expect(totalsAnswer(TXS, 'balance', 'month', NO_CATEGORY, 'COP', TODAY)).toBe(
      'Este mes tus ingresos fueron 500.000 pesos colombianos, tus gastos 35.000 pesos colombianos y tienes un balance a favor de 465.000 pesos colombianos',
    );
  });

  it('déficit, periodos sin movimientos y periodos largos', () => {
    const only = [tx({ amountMinor: 1_000_000 })];
    expect(totalsAnswer(only, 'balance', 'today', NO_CATEGORY, 'COP', TODAY)).toMatch(
      /déficit de 10.000 pesos colombianos/,
    );
    // el domingo 11 de octubre sí cae en «la semana pasada»
    expect(totalsAnswer(TXS, 'expense', 'last_week', NO_CATEGORY, 'COP', TODAY)).toBe(
      'La semana pasada gastaste 10.000 pesos colombianos',
    );
    expect(totalsAnswer([], 'expense', 'last_week', NO_CATEGORY, 'COP', TODAY)).toBe(
      'No tienes gastos registrados la semana pasada',
    );
    expect(totalsAnswer(TXS, 'expense', 'all', NO_CATEGORY, 'COP', TODAY)).toBe(
      'En total gastaste 134.000 pesos colombianos',
    );
    expect(totalsAnswer(TXS, 'expense', 'last_7', NO_CATEGORY, 'COP', TODAY)).toBe(
      'En los últimos 7 días gastaste 35.000 pesos colombianos',
    );
  });
});

describe('categoría con más gasto', () => {
  it('nombra las principales con su porcentaje', () => {
    expect(topAnswer(TXS, 'month', name, 'COP', TODAY)).toBe(
      'Este mes gastaste más en Alimentación: 25.000 pesos colombianos, el 71 %. Luego Transporte: 10.000 pesos colombianos, el 29 %',
    );
  });
});

describe('el movimiento más grande', () => {
  it('el mayor gasto del mes', () => {
    expect(extremeAnswer(TXS, 'expense', 'month', name, 'COP', TODAY)).toBe(
      'Tu mayor gasto este mes fue: Gasto de 25.000 pesos colombianos en la categoría Alimentación, registrado hoy, concepto: Almuerzo',
    );
  });

  it('sin movimientos', () => {
    expect(extremeAnswer([], 'income', 'week', name, 'COP', TODAY)).toBe(
      'No tienes ingresos registrados esta semana',
    );
  });
});

describe('cuántos movimientos', () => {
  it('cuenta los del periodo', () => {
    expect(countAnswer(TXS, 'expense', 'month', TODAY)).toBe(
      'Este mes tienes 2 gastos registrados',
    );
    expect(countAnswer(TXS, 'income', 'month', TODAY)).toBe(
      'Este mes tienes 1 ingreso registrados',
    );
    expect(countAnswer(TXS, 'expense', 'today', TODAY)).toBe('Hoy tienes 1 gasto registrados');
    expect(countAnswer([], 'all', 'today', TODAY)).toBe('No tienes movimientos registrados hoy');
  });
});

describe('comparar con el periodo anterior', () => {
  it('gastos: este mes contra el mes pasado', () => {
    // este mes 35.000 pesos colombianos, mes pasado 99.000 pesos colombianos → 65 % menos
    expect(compareAnswer(TXS, 'expense', 'month', 'COP', TODAY)).toBe(
      'Este mes llevas gastado 35.000 pesos colombianos y el mes pasado 99.000 pesos colombianos: es un 65 % menos',
    );
  });

  it('sin datos del periodo anterior', () => {
    expect(compareAnswer([tx({})], 'expense', 'month', 'COP', TODAY)).toBe(
      'Este mes llevas gastado 25.000 pesos colombianos y el mes pasado no registraste gastos',
    );
    expect(compareAnswer([], 'expense', 'month', 'COP', TODAY)).toMatch(/^No tienes gastos/);
  });

  it('balance compara gastos e ingresos', () => {
    const text = compareAnswer(TXS, 'balance', 'month', 'COP', TODAY);
    expect(text).toContain('gastado');
    expect(text).toContain('recibido');
  });
});

describe('presupuestos', () => {
  const budget = (categoryId: string, amountMinor: number): Budget => ({
    id: `b-${categoryId}`,
    categoryId,
    amountMinor,
    effectiveFrom: '2026-10-01',
    createdAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    syncState: 'synced',
  });

  it('una categoría: cuánto lleva y cuánto queda', () => {
    expect(budgetAnswer([budget('ali', 10_000_000)], TXS, CATS, 'ali', '2026-10', 'COP')).toBe(
      'Alimentación: llevas 25.000 pesos colombianos de 100.000 pesos colombianos, el 25 %, y te quedan 75.000 pesos colombianos',
    );
  });

  it('se pasó del límite', () => {
    expect(budgetAnswer([budget('ali', 2_000_000)], TXS, CATS, 'ali', '2026-10', 'COP')).toMatch(
      /^Alimentación: te pasaste por 5\.000 pesos colombianos/,
    );
  });

  it('sin presupuesto', () => {
    expect(budgetAnswer([], TXS, CATS, 'ali', '2026-10', 'COP')).toBe(
      'No tienes presupuesto para Alimentación este mes',
    );
    expect(budgetAnswer([], TXS, CATS, null, '2026-10', 'COP')).toBe(
      'No tienes presupuestos configurados este mes',
    );
  });

  it('todos, del más gastado al menos', () => {
    const text = budgetAnswer(
      [budget('ali', 10_000_000), budget('tra', 1_200_000)],
      TXS,
      CATS,
      null,
      '2026-10',
      'COP',
    );
    expect(text.startsWith('Tienes 2 presupuestos este mes. Transporte:')).toBe(true);
    expect(text).toContain('Alimentación:');
  });
});
