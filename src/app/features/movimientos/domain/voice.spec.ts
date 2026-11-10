import { describe, expect, it } from 'vitest';
import { Category, Transaction } from '../../../core/models';
import {
  buildHistorySpeechQueue,
  formatTransactionForSpeech,
  parseVoiceTransactionDraft,
  spokenMoney,
  wordsToNumber,
} from './voice';

const TODAY = '2026-10-12';

const cat = (id: string, name: string, nameKey: string, type: 'expense' | 'income'): Category => ({
  id,
  name,
  nameKey,
  type,
  icon: 'x',
  color: '#000000',
  isDefault: true,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  syncState: 'synced',
});

const CATEGORIES = [
  cat('ali', 'Alimentación', 'alimentacion', 'expense'),
  cat('tra', 'Transporte', 'transporte', 'expense'),
  cat('oci', 'Ocio', 'ocio', 'expense'),
  cat('otg', 'Otros gastos', 'otros gastos', 'expense'),
  cat('sal', 'Salario', 'salario', 'income'),
  cat('oti', 'Otros ingresos', 'otros ingresos', 'income'),
];

const parse = (text: string, last: Record<string, string | null> = {}) =>
  parseVoiceTransactionDraft(text, CATEGORIES, TODAY, last);

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  type: 'expense',
  amountMinor: 2_500_000,
  categoryId: 'ali',
  occurredOn: TODAY,
  description: 'Almuerzo',
  note: null,
  tags: [],
  status: 'confirmed',
  recurringRuleId: null,
  createdAt: '2026-10-12T12:00:00Z',
  deletedAt: null,
  syncState: 'synced',
  ...over,
});

describe('wordsToNumber (montos hablados en español)', () => {
  it.each([
    ['veinticinco mil', 25_000],
    ['tres millones quinientos mil', 3_500_000],
    ['un millon', 1_000_000],
    ['dos mil quinientos', 2_500],
    ['ciento veinte mil', 120_000],
    ['treinta y cinco mil', 35_000],
  ])('"%s" → %d', (text, value) => {
    expect(wordsToNumber(text.split(' '))).toBe(value);
  });

  it('una palabra que no es número invalida la secuencia', () => {
    expect(wordsToNumber(['veinte', 'cafe'])).toBeNull();
  });
});

describe('parseVoiceTransactionDraft (HU17)', () => {
  it('gasto completo: tipo, monto en centavos, categoría, fecha de hoy y descripción', () => {
    expect(parse('Gasté veinticinco mil pesos en almuerzo en Alimentación')).toEqual({
      type: 'expense',
      amountMinor: 2_500_000,
      categoryId: 'ali',
      occurredOn: TODAY,
      description: 'Almuerzo',
      futureDate: false,
    });
  });

  it('ingreso: "Recibí tres millones quinientos mil pesos de Salario"', () => {
    const d = parse('Recibí tres millones quinientos mil pesos de Salario');
    expect(d.type).toBe('income');
    expect(d.amountMinor).toBe(350_000_000);
    expect(d.categoryId).toBe('sal');
    expect(d.description).toBe('');
  });

  it('sin monto reconocible: "un café" no es un monto y se conservan las tildes', () => {
    const d = parse('Pagué un café en Ocio');
    expect(d.amountMinor).toBeNull();
    expect(d.categoryId).toBe('oci');
    expect(d.description).toBe('Café');
  });

  it.each([
    ['Gasté 25000 en transporte', 2_500_000],
    ['Gasté 25.000 en transporte', 2_500_000],
    ['Pagué $18.000 de taxi', 1_800_000],
    ['Compré algo por 1250000,50', 125_000_050],
  ])('cifras: "%s" → %d centavos', (text, minor) => {
    expect(parse(text).amountMinor).toBe(minor);
  });

  it('el monto en cifras no queda en la descripción', () => {
    expect(parse('Pagué $18.000 de taxi').description).toBe('Taxi');
  });

  it('monto cero o de más de 13 dígitos queda vacío (HU04)', () => {
    expect(parse('Gasté cero pesos en Ocio').amountMinor).toBeNull();
    expect(parse('Gasté 99999999999999 en Ocio').amountMinor).toBeNull();
  });

  it('sin palabra clave el tipo es gasto (predeterminado de HU05)', () => {
    expect(parse('Veinte mil en Transporte').type).toBe('expense');
  });

  it('sin categoría reconocida usa la última usada del tipo o "Otros gastos" / "Otros ingresos"', () => {
    expect(parse('Gasté diez mil en algo raro').categoryId).toBe('otg');
    expect(parse('Gasté diez mil en algo raro', { expense: 'tra' }).categoryId).toBe('tra');
    expect(parse('Me pagaron cien mil').categoryId).toBe('oti');
  });

  it('fechas relativas con el Clock: hoy, ayer y futura', () => {
    expect(parse('Ayer gasté diez mil en Ocio').occurredOn).toBe('2026-10-11');
    expect(parse('Hoy gasté diez mil en Ocio').occurredOn).toBe(TODAY);
    const future = parse('Mañana pagaré veinte mil en Transporte');
    expect(future.futureDate).toBe(true);
    expect(future.occurredOn > TODAY).toBe(true);
  });

  it('la descripción se limita a 100 caracteres', () => {
    const d = parse(`Gasté diez mil en ${'palabra '.repeat(30)}`);
    expect(d.description.length).toBeLessThanOrEqual(100);
  });

  it('una categoría de varias palabras se reconoce y se quita de la descripción', () => {
    const d = parse('Diez mil en otros gastos varios');
    expect(d.categoryId).toBe('otg');
    expect(d.description).toBe('Varios');
  });
});

describe('formatTransactionForSpeech (HU18)', () => {
  it('lee tipo, monto, categoría, fecha relativa y concepto', () => {
    expect(formatTransactionForSpeech(tx(), 'Alimentación', 'COP', TODAY)).toBe(
      'Gasto de $25.000 en la categoría Alimentación, registrado hoy, concepto: Almuerzo',
    );
  });

  it('el monto se lee sin espacio duro: "$25.000"', () => {
    expect(spokenMoney(2_500_000, 'COP')).toBe('$25.000');
  });

  it('ingreso usa "fuente" y fecha de ayer', () => {
    const text = formatTransactionForSpeech(
      tx({ type: 'income', amountMinor: 350_000_000, occurredOn: '2026-10-11', description: null }),
      'Salario',
      'COP',
      TODAY,
    );
    expect(text).toBe('Ingreso de $3.500.000 en la fuente Salario, registrado ayer');
  });

  it('sin descripción omite "concepto:"; fecha del mismo año sin año, de otro año con año', () => {
    expect(
      formatTransactionForSpeech(
        tx({ description: '  ', occurredOn: '2026-10-01' }),
        'Ocio',
        'COP',
        TODAY,
      ),
    ).toBe('Gasto de $25.000 en la categoría Ocio, registrado el 1 de octubre');
    expect(
      formatTransactionForSpeech(
        tx({ description: null, occurredOn: '2025-12-24' }),
        'Ocio',
        'COP',
        TODAY,
      ),
    ).toContain('registrado el 24 de diciembre de 2025');
  });

  it('nunca menciona el estado de sincronización', () => {
    const text = formatTransactionForSpeech(
      tx({ syncState: 'pending' }),
      'Alimentación',
      'COP',
      TODAY,
    );
    expect(text).not.toMatch(/sincroniz|pendiente/i);
  });
});

describe('buildHistorySpeechQueue (HU19)', () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => tx({ id: `t${i + 1}` }));
  const name = () => 'Alimentación';

  it('anuncia la cantidad y lee en orden', () => {
    const q = buildHistorySpeechQueue(list(3), name, 'COP', TODAY);
    expect(q.items.map((i) => i.id)).toEqual([null, 't1', 't2', 't3', null]);
    expect(q.items[0].text).toBe('Leyendo 3 movimientos');
    expect(q.items[4].text).toBe('Fin del historial');
    expect(q.remaining).toBe(0);
  });

  it('bloques de máximo 10 y aviso de fin de bloque', () => {
    const q = buildHistorySpeechQueue(list(25), name, 'COP', TODAY);
    expect(q.items.filter((i) => i.id)).toHaveLength(10);
    expect(q.items.at(-1)?.text).toBe('Fin de los primeros 10 movimientos');
    expect(q.remaining).toBe(15);
    const next = buildHistorySpeechQueue(list(25), name, 'COP', TODAY, q.nextOffset);
    expect(next.items[1].id).toBe('t11');
    expect(next.items.at(-1)?.text).toBe('Fin de los primeros 20 movimientos');
  });

  it('lista vacía no produce lectura', () => {
    expect(buildHistorySpeechQueue([], name, 'COP', TODAY).items).toEqual([]);
  });

  it('omite los movimientos con borrado lógico', () => {
    const items = [
      tx({ id: 'a' }),
      tx({ id: 'b', deletedAt: '2026-10-12T13:00:00Z' }),
      tx({ id: 'c' }),
    ];
    const q = buildHistorySpeechQueue(items, name, 'COP', TODAY);
    expect(q.items.map((i) => i.id)).toEqual([null, 'a', 'c', null]);
    expect(q.items[0].text).toBe('Leyendo 2 movimientos');
  });

  it('singular para un solo movimiento', () => {
    expect(buildHistorySpeechQueue(list(1), name, 'COP', TODAY).items[0].text).toBe(
      'Leyendo 1 movimiento',
    );
  });
});
