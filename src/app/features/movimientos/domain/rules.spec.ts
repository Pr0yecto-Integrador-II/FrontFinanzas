import { describe, expect, it } from 'vitest';
import { addTag, hasErrors, normalizeTag, validateTx } from './rules';

describe('etiquetas (HU10)', () => {
  it('normaliza: sin #, en minúsculas y sin espacios', () => {
    expect(normalizeTag('#Viaje Cartagena')).toBe('viaje-cartagena');
    expect(normalizeTag('  #Trabajo ')).toBe('trabajo');
  });

  it('deduplica tras normalizar', () => {
    let tags: string[] = [];
    tags = addTag(tags, '#Viaje').tags;
    tags = addTag(tags, '#viaje').tags;
    tags = addTag(tags, '#Cartagena').tags;
    expect(tags).toEqual(['viaje', 'cartagena']);
  });

  it('máximo 5 etiquetas por movimiento', () => {
    let tags: string[] = [];
    for (const t of ['a', 'b', 'c', 'd', 'e']) tags = addTag(tags, t).tags;
    expect(addTag(tags, 'f').error).toBe('max');
    expect(addTag(tags, 'f').tags).toHaveLength(5);
  });

  it('rechaza vacías y de más de 20 caracteres', () => {
    expect(addTag([], '#').error).toBe('empty');
    expect(addTag([], 'x'.repeat(21)).error).toBe('too_long');
  });
});

describe('validateTx (HU04)', () => {
  const ok = { amountMinor: 2_500_000, occurredOn: '2026-10-01', description: '', note: '' };
  const today = '2026-10-12';

  it('un gasto válido no tiene errores', () => {
    expect(hasErrors(validateTx(ok, 'cat', today))).toBe(false);
  });

  it('monto 0 o vacío: "Ingresa un monto mayor que 0"', () => {
    expect(validateTx({ ...ok, amountMinor: 0 }, 'cat', today).amount).toBe('Ingresa un monto mayor que 0');
    expect(validateTx({ ...ok, amountMinor: null }, 'cat', today).amount).toBe('Ingresa un monto mayor que 0');
  });

  it('fecha futura: "La fecha no puede ser futura"', () => {
    expect(validateTx({ ...ok, occurredOn: '2026-10-13' }, 'cat', today).date).toBe('La fecha no puede ser futura');
  });

  it('exige categoría y respeta los límites de texto', () => {
    expect(validateTx(ok, null, today).category).toBeTruthy();
    expect(validateTx({ ...ok, description: 'x'.repeat(101) }, 'cat', today).description).toBeTruthy();
    expect(validateTx({ ...ok, note: 'x'.repeat(501) }, 'cat', today).note).toBeTruthy();
  });
});
