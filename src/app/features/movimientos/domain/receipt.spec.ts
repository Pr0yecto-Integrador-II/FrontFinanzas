import { describe, expect, it } from 'vitest';
import { Category } from '../../../core/models';
import { ImageAnalysis } from '../../../core/vision/image-analysis';
import {
  TAG_TO_CATEGORY,
  buildReceiptDraft,
  describeReceipt,
  findDate,
  findMerchant,
  findTotal,
  parseReceiptText,
  suggestCategory,
} from './receipt';

const TODAY = '2026-10-12';

const cat = (
  id: string,
  name: string,
  nameKey: string,
  type: 'expense' | 'income' = 'expense',
): Category => ({
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
  cat('ali', 'Alimentación', 'alimentacion'),
  cat('tra', 'Transporte', 'transporte'),
  cat('sal', 'Salud', 'salud'),
  cat('sue', 'Salario', 'salario', 'income'),
];

const analysis = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
  ocrLines: [],
  tags: [],
  caption: null,
  ...over,
});

describe('HU21 · categoría sugerida por la foto', () => {
  it('food, pizza → Alimentación', () => {
    const s = suggestCategory(
      analysis({
        tags: [
          { name: 'food', confidence: 0.93 },
          { name: 'pizza', confidence: 0.81 },
        ],
      }),
      CATEGORIES,
    );
    expect(s).toEqual({ categoryId: 'ali', matchedTag: 'food' });
  });

  it('fuel pump → Transporte', () => {
    expect(
      suggestCategory(analysis({ tags: [{ name: 'fuel pump', confidence: 0.7 }] }), CATEGORIES),
    ).toEqual({ categoryId: 'tra', matchedTag: 'fuel pump' });
  });

  it('medicine → Salud', () => {
    expect(
      suggestCategory(analysis({ tags: [{ name: 'medicine', confidence: 0.9 }] }), CATEGORIES)
        ?.categoryId,
    ).toBe('sal');
  });

  it('gana la categoría con más evidencia acumulada', () => {
    const s = suggestCategory(
      analysis({
        tags: [
          { name: 'car', confidence: 0.6 },
          { name: 'food', confidence: 0.55 },
          { name: 'pizza', confidence: 0.55 },
        ],
      }),
      CATEGORIES,
    );
    expect(s?.categoryId).toBe('ali');
  });

  it('usa la descripción cuando las etiquetas no bastan', () => {
    expect(
      suggestCategory(analysis({ caption: 'a plate of pizza on a table' }), CATEGORIES)?.categoryId,
    ).toBe('ali');
  });

  it('ignora etiquetas con poca confianza', () => {
    expect(
      suggestCategory(analysis({ tags: [{ name: 'food', confidence: 0.3 }] }), CATEGORIES),
    ).toBeNull();
  });

  it('sin etiqueta conocida no sugiere nada', () => {
    expect(
      suggestCategory(analysis({ tags: [{ name: 'cloud', confidence: 0.99 }] }), CATEGORIES),
    ).toBeNull();
  });

  it('si el usuario no tiene esa categoría no la crea ni sugiere otra', () => {
    const sinAlimentacion = CATEGORIES.filter((c) => c.id !== 'ali');
    expect(
      suggestCategory(analysis({ tags: [{ name: 'food', confidence: 0.9 }] }), sinAlimentacion),
    ).toBeNull();
  });

  it('no sugiere una categoría eliminada ni una de ingreso con el mismo nombre', () => {
    const borrada = {
      ...cat('ali', 'Alimentación', 'alimentacion'),
      deletedAt: '2026-10-02T00:00:00Z',
    };
    const ingreso = cat('ali2', 'Alimentación', 'alimentacion', 'income');
    expect(
      suggestCategory(analysis({ tags: [{ name: 'food', confidence: 0.9 }] }), [borrada, ingreso]),
    ).toBeNull();
  });

  it('respeta categorías renombradas por tildes o mayúsculas (name_key)', () => {
    const c = cat('x', 'ALIMENTACIÓN', 'alimentacion');
    expect(
      suggestCategory(analysis({ tags: [{ name: 'food', confidence: 0.9 }] }), [c])?.categoryId,
    ).toBe('x');
  });

  it('la tabla solo apunta a categorías predeterminadas de gasto', () => {
    const allowed = new Set([
      'Alimentación',
      'Transporte',
      'Salud',
      'Compras',
      'Ocio',
      'Vivienda',
      'Servicios',
      'Educación',
    ]);
    for (const name of Object.values(TAG_TO_CATEGORY)) expect(allowed.has(name)).toBe(true);
  });
});

describe('HU21 · total del recibo', () => {
  it('"TOTAL 45.900" → 4.590.000 centavos', () => {
    expect(findTotal(['ÉXITO', 'TOTAL 45.900'])).toBe(4_590_000);
  });

  it('acepta "$", decimales y "TOTAL A PAGAR"', () => {
    expect(findTotal(['TOTAL A PAGAR $ 45.900,00'])).toBe(4_590_000);
  });

  it('toma el monto de la línea siguiente si la palabra está sola', () => {
    expect(findTotal(['TOTAL', '$ 1.250.000'])).toBe(125_000_000);
  });

  it('ignora subtotal, IVA y número de artículos', () => {
    expect(findTotal(['SUBTOTAL 38.571', 'IVA 7.329', 'TOTAL ITEMS 3', 'TOTAL 45.900'])).toBe(
      4_590_000,
    );
  });

  it('prefiere "total a pagar" sobre otros totales', () => {
    expect(findTotal(['TOTAL 50.000', 'TOTAL A PAGAR 45.900'])).toBe(4_590_000);
  });

  it('sin palabra "total" no adivina el monto', () => {
    expect(findTotal(['ÉXITO', 'Leche 4.500', 'Pan 3.200'])).toBeNull();
  });

  it('rechaza montos fuera de rango', () => {
    expect(findTotal(['TOTAL 0'])).toBeNull();
    expect(findTotal(['TOTAL 99999999999999999999'])).toBeNull();
  });
});

describe('HU21 · fecha y comercio', () => {
  it('dd/mm/aaaa es día primero', () => {
    expect(findDate(['Fecha 05/10/2026 14:32'])).toBe('2026-10-05');
  });

  it('acepta aaaa-mm-dd', () => {
    expect(findDate(['2026-10-05'])).toBe('2026-10-05');
  });

  it('descarta fechas imposibles', () => {
    expect(findDate(['31/02/2026', '45/13/2026'])).toBeNull();
  });

  it('comercio: primera línea con aspecto de nombre, en formato legible', () => {
    expect(findMerchant(['NIT 890.900.608-9', 'ÉXITO', 'TOTAL 45.900'])).toBe('Éxito');
    expect(findMerchant(['Panadería Nitro', 'TOTAL 5.000'])).toBe('Panadería Nitro');
  });

  it('comercio: no confunde teléfonos ni NIT', () => {
    expect(findMerchant(['NIT 890.900.608-9', 'Tel 604 555 1234'])).toBeNull();
  });
});

describe('HU21 · borrador completo', () => {
  const ocr = ['ÉXITO', 'Fecha 05/10/2026', 'TOTAL 45.900'];

  it('arma un gasto con monto, fecha, comercio y categoría', () => {
    const d = buildReceiptDraft(
      analysis({ ocrLines: ocr, tags: [{ name: 'food', confidence: 0.9 }] }),
      CATEGORIES,
      TODAY,
    );
    expect(d).toMatchObject({
      type: 'expense',
      amountMinor: 4_590_000,
      categoryId: 'ali',
      occurredOn: '2026-10-05',
      description: 'Éxito',
      futureDate: false,
      suggestedTag: 'food',
      empty: false,
    });
  });

  it('foto de compra sin recibo: categoría sugerida y sin monto', () => {
    const d = buildReceiptDraft(
      analysis({ tags: [{ name: 'pizza', confidence: 0.8 }] }),
      CATEGORIES,
      TODAY,
    );
    expect(d.amountMinor).toBeNull();
    expect(d.categoryId).toBe('ali');
    expect(d.occurredOn).toBe(TODAY);
    expect(d.empty).toBe(false);
  });

  it('una fecha futura se marca para que el formulario la rechace', () => {
    const d = buildReceiptDraft(
      analysis({ ocrLines: ['TOTAL 1.000', '01/01/2027'] }),
      CATEGORIES,
      TODAY,
    );
    expect(d.futureDate).toBe(true);
  });

  it('sin sugerencia usa la última categoría usada', () => {
    const d = buildReceiptDraft(analysis({ ocrLines: ['TOTAL 1.000'] }), CATEGORIES, TODAY, 'tra');
    expect(d.categoryId).toBe('tra');
    expect(d.suggestedTag).toBeNull();
  });

  it('una foto sin nada útil queda vacía', () => {
    expect(buildReceiptDraft(analysis(), CATEGORIES, TODAY).empty).toBe(true);
  });

  it('la descripción respeta el máximo de 100 caracteres', () => {
    const d = buildReceiptDraft(
      analysis({ ocrLines: [`A${'b'.repeat(39)}`, 'TOTAL 1.000'] }),
      CATEGORIES,
      TODAY,
    );
    expect(d.description.length).toBeLessThanOrEqual(100);
  });

  it('parseReceiptText nunca devuelve un monto decimal flotante', () => {
    expect(Number.isInteger(parseReceiptText(['TOTAL 45.900,50']).totalMinor)).toBe(true);
  });
});

describe('HU25 · lectura de lo detectado', () => {
  it('comercio, total y categoría', () => {
    expect(
      describeReceipt({ merchant: 'Éxito', amountMinor: 4_590_000 }, 'Alimentación', 'COP'),
    ).toBe('Recibo de Éxito, total $45.900, categoría sugerida Alimentación');
  });

  it('sin comercio ni monto lo dice claramente', () => {
    expect(describeReceipt({ merchant: null, amountMinor: null }, undefined, 'COP')).toBe(
      'Compra detectada en la foto, no se detectó el monto',
    );
  });
});
