import { describe, expect, it } from 'vitest';
import { formatMoney, formatPlain, parseMoney } from './money';

describe('parseMoney (HU04: formato local)', () => {
  it.each([
    ['25000', 2_500_000],
    ['25.000', 2_500_000],
    ['1.250.000', 125_000_000],
    ['1250000,50', 125_000_050],
    ['1.250.000,50', 125_000_050],
    ['1,250,000.50', 125_000_050],
    ['12,5', 1_250],
    ['0,99', 99],
    ['$ 3.500.000', 350_000_000],
  ])('interpreta %s como %i centavos', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it('devuelve null si no hay dígitos', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formatea COP sin decimales cuando no hay centavos', () => {
    expect(formatMoney(125_000_000, 'COP').replace(/\s/g, ' ')).toContain('1.250.000');
  });

  it('antepone el signo menos y el más', () => {
    expect(formatMoney(-500_000, 'COP')).toMatch(/^−/);
    expect(formatMoney(500_000, 'COP', { sign: true })).toMatch(/^\+/);
  });

  it('formatPlain muestra centavos solo si existen', () => {
    expect(formatPlain(125_000_000)).toBe('1.250.000');
    expect(formatPlain(125_000_050)).toBe('1.250.000,50');
  });
});
