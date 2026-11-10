import { describe, expect, it } from 'vitest';
import { Category } from '../../../core/models';
import { CommandContext, Intent, parseCommand, parseConfirmation } from './intents';

const cat = (id: string, name: string, type: 'expense' | 'income'): Category => ({
  id,
  name,
  nameKey: name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(),
  type,
  icon: 'x',
  color: '#000000',
  isDefault: true,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  syncState: 'synced',
});

const CTX: CommandContext = {
  today: '2026-10-12',
  categories: [
    cat('ali', 'Alimentación', 'expense'),
    cat('tra', 'Transporte', 'expense'),
    cat('viv', 'Vivienda', 'expense'),
    cat('ser', 'Servicios', 'expense'),
    cat('ocio', 'Ocio', 'expense'),
    cat('com', 'Compras', 'expense'),
    cat('otg', 'Otros gastos', 'expense'),
    cat('sal', 'Salario', 'income'),
    cat('oti', 'Otros ingresos', 'income'),
  ],
};

const parse = (t: string): Intent => parseCommand(t, CTX);

/** Cada fila es una forma real de pedirlo, incluidas las que Azure transcribe «torcidas». */
describe('leer movimientos', () => {
  it.each([
    // el último
    ['Léeme el último gasto', 'expense', 1],
    ['léeme el último gasto.', 'expense', 1],
    ['Léeme el último ingreso', 'income', 1],
    ['léeme el último movimiento', 'all', 1],
    ['léeme el último', 'all', 1],
    ['dime el último gasto', 'expense', 1],
    ['dime cuál fue mi último gasto', 'expense', 1],
    ['cuál fue mi último gasto', 'expense', 1],
    ['cuál es mi último ingreso', 'income', 1],
    ['cuánto fue mi último gasto', 'expense', 1],
    ['quiero que me leas el último gasto', 'expense', 1],
    ['me puedes leer el último gasto por favor', 'expense', 1],
    ['por favor léeme mi último ingreso', 'income', 1],
    ['oye léeme el último gasto', 'expense', 1],
    ['muéstrame el último gasto', 'expense', 1],
    ['quiero ver mi último ingreso', 'income', 1],
    ['léeme la última compra', 'expense', 1],
    // varios
    ['Léeme los últimos 5 gastos', 'expense', 5],
    ['léeme los últimos cinco gastos', 'expense', 5],
    ['léeme los últimos 3 ingresos', 'income', 3],
    ['léeme mis últimos tres ingresos', 'income', 3],
    ['dime los últimos 2 gastos', 'expense', 2],
    ['dime los dos últimos gastos', 'expense', 2],
    ['léeme los 10 últimos movimientos', 'all', 10],
    ['muéstrame mis últimos 4 movimientos', 'all', 4],
    ['me lees los últimos 4 ingresos', 'income', 4],
    ['lee me los últimos 5 gastos', 'expense', 5],
    ['léeme mis últimos gastos', 'expense', 5],
    ['léeme los gastos recientes', 'expense', 5],
    ['los últimos gastos', 'expense', 5],
    ['últimos ingresos', 'income', 5],
    ['léeme todos mis gastos', 'expense', 20],
    ['léeme los últimos 50 gastos', 'expense', 20], // tope
    // la transcripción tuerce las palabras
    ['leeme el ultimo gasto', 'expense', 1],
    ['léame el último gasto', 'expense', 1],
    ['leme el ultimo gasto', 'expense', 1],
    ['léeme los últimos 5 gastoz', 'expense', 5],
    ['léeme los ultimos 5 ingresoss', 'income', 5],
    ['léeme los últimos 5 gasto', 'expense', 5],
    ['léeme los últimos cinco ingreso', 'income', 5],
    ['leeme los ultimos 3 gastos', 'expense', 3],
    ['Léeme los últimos 5 gastos.', 'expense', 5],
    // sinónimos de gasto / ingreso
    ['léeme mis últimas compras', 'expense', 5],
    ['léeme mis últimas ganancias', 'income', 5],
    ['léeme las últimas transacciones', 'all', 5],
  ])('«%s»', (frase, type, count) => {
    expect(parse(frase)).toMatchObject({ kind: 'read_recent', type, count });
  });

  it.each([
    ['léeme los gastos de hoy', 'expense', 'today'],
    ['léeme los gastos de ayer', 'expense', 'yesterday'],
    ['mis gastos de ayer', 'expense', 'yesterday'],
    ['ingresos de hoy', 'income', 'today'],
    ['léeme los ingresos de esta semana', 'income', 'week'],
    ['léeme los gastos de la semana pasada', 'expense', 'last_week'],
    ['léeme los gastos del mes pasado', 'expense', 'last_month'],
    ['léeme los movimientos de este mes', 'all', 'month'],
    ['qué gasté ayer', 'expense', 'yesterday'],
    ['qué gasté hoy', 'expense', 'today'],
    ['en qué gasté ayer', 'expense', 'yesterday'],
    ['cuáles fueron mis ingresos de este mes', 'income', 'month'],
    ['qué gané esta semana', 'income', 'week'],
    ['léeme los gastos de los últimos 7 días', 'expense', 'last_7'],
    ['léeme los gastos del último mes', 'expense', 'last_30'],
  ])('con periodo «%s»', (frase, type, period) => {
    expect(parse(frase)).toMatchObject({ kind: 'read_recent', type, period });
  });

  it('un periodo sin cantidad pide hasta el tope; con cantidad, esa', () => {
    expect(parse('léeme los gastos de hoy')).toMatchObject({ count: 20 });
    expect(parse('léeme los últimos 3 gastos de hoy')).toMatchObject({ count: 3, period: 'today' });
  });

  it.each([
    ['gastos', 'expense'],
    ['mis gastos', 'expense'],
    ['ingresos', 'income'],
    ['mis movimientos', 'all'],
    ['léeme mis movimientos', 'all'],
  ])('solo el sustantivo «%s»', (frase, type) => {
    expect(parse(frase)).toMatchObject({ kind: 'read_recent', type, count: 5 });
  });

  it.each([
    ['léeme los últimos gastos de alimentación', 'ali'],
    ['léeme mis gastos de transporte', 'tra'],
    ['léeme los últimos 3 gastos en comida', 'ali'],
    ['gastos de taxi', 'tra'],
    ['léeme mis gastos de arriendo', null], // «arriendo» no es una de las categorías de este usuario
    ['léeme los ingresos por salario', 'sal'],
  ])('filtrados por categoría «%s»', (frase, categoryId) => {
    const intent = parse(frase);
    expect(intent.kind).toBe('read_recent');
    if (intent.kind === 'read_recent' && categoryId) expect(intent.categoryId).toBe(categoryId);
  });
});

describe('agregar un movimiento', () => {
  it('la frase del usuario: gasto de 50000 porque comí en Crepes and Waffles hoy', () => {
    expect(
      parse('Agrega un nuevo gasto de 50000 porque comí en Crepes and Waffles hoy'),
    ).toMatchObject({
      kind: 'add_transaction',
      draft: {
        type: 'expense',
        amountMinor: 5_000_000,
        categoryId: 'ali',
        occurredOn: '2026-10-12',
        description: 'Crepes and Waffles',
        futureDate: false,
      },
    });
  });

  it.each([
    ['agrega un gasto de 50 mil en taxi', 5_000_000, 'tra'],
    ['agrega un gasto de 50mil en taxi', 5_000_000, 'tra'],
    ['agrega un gasto de 50 000 en almuerzo', 5_000_000, 'ali'],
    ['agrega un gasto de $50.000 en almuerzo', 5_000_000, 'ali'],
    ['registra un gasto de cincuenta mil pesos en almuerzo', 5_000_000, 'ali'],
    ['anota un gasto de 20.000 en el cine', 2_000_000, 'ocio'],
    ['agrega un gasto de 2 millones', 200_000_000, 'otg'],
    ['agrégame un gasto de 12 mil en el supermercado', 1_200_000, 'ali'],
    ['apunta un gasto de 5 mil en café', 500_000, 'ali'],
    ['pon un gasto de 30 mil en uber', 3_000_000, 'tra'],
    ['gasté 20 mil en el almuerzo', 2_000_000, 'ali'],
    ['gasté veinte mil pesos en taxi', 2_000_000, 'tra'],
    ['pagué 80 mil de luz', 8_000_000, 'ser'],
    ['compré ropa por 150000', 15_000_000, 'com'],
    ['gasto de 50000 en mercado', 5_000_000, 'ali'],
    ['hoy gasté 35 mil en el bus', 3_500_000, 'tra'],
    ['quiero agregar un gasto de 25 mil en pizza', 2_500_000, 'ali'],
    ['por favor agrega un gasto de 10 mil en transporte', 1_000_000, 'tra'],
    ['20 mil en taxi', 2_000_000, 'tra'],
  ])('gasto «%s»', (frase, amountMinor, categoryId) => {
    expect(parse(frase)).toMatchObject({
      kind: 'add_transaction',
      draft: { type: 'expense', amountMinor, categoryId },
    });
  });

  it.each([
    ['agrega un ingreso de 2 millones por salario', 200_000_000, 'sal'],
    ['registra un ingreso de un millón por salario', 100_000_000, 'sal'],
    ['recibí un millón de salario', 100_000_000, 'sal'],
    ['me pagaron 500 mil', 50_000_000, 'oti'],
    ['me depositaron 300 mil', 30_000_000, 'oti'],
    ['ingreso de 300 mil', 30_000_000, 'oti'],
    ['gané 80 mil', 8_000_000, 'oti'],
  ])('ingreso «%s»', (frase, amountMinor, categoryId) => {
    expect(parse(frase)).toMatchObject({
      kind: 'add_transaction',
      draft: { type: 'income', amountMinor, categoryId },
    });
  });

  it('fechas habladas', () => {
    expect(parse('ayer gasté 40 mil en mercado')).toMatchObject({
      draft: { occurredOn: '2026-10-11', futureDate: false },
    });
    expect(parse('agrega un gasto de 10000 mañana')).toMatchObject({
      draft: { occurredOn: '2026-10-13', futureDate: true },
    });
  });

  it('sin monto lo deja nulo para que el asistente lo pregunte', () => {
    expect(parse('agrega un gasto')).toMatchObject({
      kind: 'add_transaction',
      draft: { amountMinor: null },
    });
    expect(parse('nuevo ingreso')).toMatchObject({
      kind: 'add_transaction',
      draft: { type: 'income', amountMinor: null },
    });
  });
});

describe('consultas de totales', () => {
  it.each([
    ['¿Cuánto he gastado este mes?', 'expense', 'month'],
    ['cuánto gasté hoy', 'expense', 'today'],
    ['cuánto he gastado esta semana', 'expense', 'week'],
    ['cuánto gasté la semana pasada', 'expense', 'last_week'],
    ['cuánto gasté el mes pasado', 'expense', 'last_month'],
    ['cuánto gasté este año', 'expense', 'year'],
    ['cuánto he gastado en total', 'expense', 'all'],
    ['cuánto gasté en los últimos 7 días', 'expense', 'last_7'],
    ['cuánto gasté el último mes', 'expense', 'last_30'],
    ['dime cuánto gasté este mes', 'expense', 'month'],
    ['léeme el total de gastos de este mes', 'expense', 'month'],
    ['cuánta plata he gastado', 'expense', 'month'],
    ['¿cuánto gané este mes?', 'income', 'month'],
    ['cuánto he recibido el mes pasado', 'income', 'last_month'],
    ['cuánto me pagaron este mes', 'income', 'month'],
    ['cuánto he ganado', 'income', 'month'],
    ['¿cuál es mi balance?', 'balance', 'month'],
    ['dime mi balance de esta semana', 'balance', 'week'],
    ['cuánto tengo', 'balance', 'month'],
    ['cómo voy este mes', 'balance', 'month'],
    ['dame un resumen del mes', 'balance', 'month'],
    ['resumen', 'balance', 'month'],
    ['cuánto he ahorrado', 'balance', 'month'],
    ['mi saldo', 'balance', 'month'],
  ])('«%s»', (frase, metric, period) => {
    expect(parse(frase)).toMatchObject({ kind: 'query_totals', metric, period });
  });

  it.each([
    ['cuánto he gastado en alimentación', 'ali'],
    ['cuánto gasté en comida este mes', 'ali'],
    ['cuánto gasté en transporte la semana pasada', 'tra'],
    ['cuánto he gastado en el cine', 'ocio'],
  ])('por categoría «%s»', (frase, categoryId) => {
    expect(parse(frase)).toMatchObject({ kind: 'query_totals', metric: 'expense', categoryId });
  });

  it.each([
    ['¿en qué gasté más este mes?', 'month'],
    ['dónde gasté más', 'month'],
    ['en qué categoría gasto más', 'month'],
    ['cuáles son mis mayores gastos', 'month'],
    ['en qué gasté más la semana pasada', 'last_week'],
  ])('dónde se gastó más «%s»', (frase, period) => {
    expect(parse(frase)).toEqual({ kind: 'query_top', period });
  });

  it.each([
    ['cuál es mi mayor gasto', 'expense', 'month'],
    ['mi gasto más alto de la semana', 'expense', 'week'],
    ['el ingreso más grande este mes', 'income', 'month'],
    ['cuál fue el gasto más caro', 'expense', 'month'],
  ])('el más grande «%s»', (frase, type, period) => {
    expect(parse(frase)).toEqual({ kind: 'query_extreme', type, period });
  });

  it.each([
    ['¿cuántos gastos tengo este mes?', 'expense', 'month'],
    ['cuántos movimientos he hecho hoy', 'all', 'today'],
    ['cuántos ingresos tuve esta semana', 'income', 'week'],
  ])('cuántos «%s»', (frase, type, period) => {
    expect(parse(frase)).toEqual({ kind: 'query_count', type, period });
  });

  it.each([
    ['compara este mes con el mes pasado', 'balance', 'month'],
    ['¿gasté más que el mes pasado?', 'expense', 'month'],
    ['gasté menos que la semana pasada', 'expense', 'week'],
    ['¿gané más que el mes pasado?', 'income', 'month'],
    ['cómo voy comparado con el mes pasado', 'balance', 'month'],
  ])('comparaciones «%s»', (frase, metric, period) => {
    expect(parse(frase)).toEqual({ kind: 'compare', metric, period });
  });

  it.each([
    ['¿cómo voy con el presupuesto de Alimentación?', 'ali'],
    ['cuánto he gastado de mi presupuesto de transporte', 'tra'],
    ['cuánto me queda de presupuesto', null],
    ['cómo van mis presupuestos', null],
    ['presupuestos', null],
  ])('presupuesto «%s»', (frase, categoryId) => {
    expect(parse(frase)).toMatchObject({ kind: 'query_budget', categoryId });
  });
});

describe('navegar, eliminar y control', () => {
  it.each([
    ['ve a presupuestos', '/presupuestos'],
    ['abre gráficos', '/graficos'],
    ['abre los gráficos', '/graficos'],
    ['muéstrame las gráficas', '/graficos'],
    ['quiero ver los gráficos', '/graficos'],
    ['gráficos', '/graficos'],
    ['llévame a movimientos', '/movimientos'],
    ['abre el historial', '/movimientos'],
    ['ir a ajustes', '/ajustes'],
    ['ve a configuración', '/ajustes'],
    ['abre recurrentes', '/recurrentes'],
    ['ve a categorías', '/categorias'],
    ['ve al inicio', '/'],
    ['léeme los próximos pagos', '/recurrentes/proximos'],
    ['abre los próximos pagos', '/recurrentes/proximos'],
    ['nuevo movimiento', '/movimientos/nuevo'],
    ['abre nuevo movimiento', '/movimientos/nuevo'],
  ])('«%s»', (frase, route) => {
    expect(parse(frase)).toMatchObject({ kind: 'navigate', route });
  });

  it.each([
    ['elimina el último gasto', 'expense'],
    ['elimina mi último gasto por favor', 'expense'],
    ['borra el último ingreso', 'income'],
    ['borra el último movimiento', 'all'],
    ['quita el último gasto', 'expense'],
    ['borra el último', 'all'],
    ['elimínalo el último gasto', 'expense'],
  ])('eliminar «%s»', (frase, type) => {
    expect(parse(frase)).toEqual({ kind: 'delete_last', type });
  });

  it('eliminar algo que no es «el último» lo explica en vez de leer o ignorar', () => {
    expect(parse('elimina el gasto de rappi')).toEqual({ kind: 'delete_help' });
  });

  it.each([
    ['repite', 'repeat'],
    ['repítelo', 'repeat'],
    ['otra vez', 'repeat'],
    ['de nuevo', 'repeat'],
    ['qué dijiste', 'repeat'],
    ['para', 'stop'],
    ['cancela', 'stop'],
    ['detente', 'stop'],
    ['olvídalo', 'stop'],
    ['no importa', 'stop'],
    ['basta', 'stop'],
    ['qué puedo decir', 'help'],
    ['ayuda', 'help'],
    ['qué puedes hacer', 'help'],
    ['cómo funciona', 'help'],
    ['no sé qué decir', 'help'],
    ['ejemplos', 'help'],
    ['hola', 'greeting'],
    ['buenos días', 'greeting'],
    ['gracias', 'thanks'],
    ['muchas gracias', 'thanks'],
    ['adiós', 'thanks'],
  ])('«%s»', (frase, kind) => {
    expect(parse(frase).kind).toBe(kind);
  });

  it('«para» dentro de una frase no es detener', () => {
    expect(parse('léeme los gastos para hoy').kind).toBe('read_recent');
  });
});

describe('lo que no entiende', () => {
  it.each(['', '   ', 'qué buen día', '50000', 'el perro corre rápido', 'asdfgh', 'um'])(
    '«%s»',
    (frase) => {
      expect(parse(frase)).toEqual({ kind: 'unknown' });
    },
  );
});

describe('parseConfirmation', () => {
  it.each([
    'sí',
    'Sí.',
    'sí, correcto',
    'sí por favor',
    'correcto',
    'dale',
    'claro',
    'claro que sí',
    'está bien',
    'listo',
    'confirmo',
    'de una',
    'perfecto',
    'adelante',
  ])('«%s» es sí', (frase) => expect(parseConfirmation(frase)).toBe('yes'));

  it.each([
    'no',
    'No.',
    'no, cancela',
    'no gracias',
    'cancela',
    'cancélalo',
    'incorrecto',
    'no está bien',
    'no es correcto',
    'negativo',
  ])('«%s» es no', (frase) => expect(parseConfirmation(frase)).toBe('no'));

  it.each(['', 'quizás', 'eh', 'léeme los últimos 5 gastos de la semana pasada por favor'])(
    '«%s» no es ni sí ni no',
    (frase) => expect(parseConfirmation(frase)).toBeNull(),
  );
});
