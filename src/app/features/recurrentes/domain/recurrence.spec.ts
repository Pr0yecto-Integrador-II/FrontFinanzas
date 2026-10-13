import { describe, expect, it } from 'vitest';
import { Frequency } from '../../../core/models';
import { RuleSchedule, nextOccurrence, occurrenceId, occurrencesBetween } from './recurrence';

const rule = (frequency: Frequency, startOn: string, extra: Partial<RuleSchedule> = {}): RuleSchedule => ({
  frequency,
  startOn,
  endOn: null,
  maxOccurrences: null,
  generateFrom: startOn,
  pausedAt: null,
  ...extra,
});

describe('recurrence (HU09)', () => {
  it('mensual desde el 31 de enero: 31 ene, 28 feb, 31 mar y 30 abr', () => {
    expect(occurrencesBetween(rule('monthly', '2027-01-31'), '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('mensual en año bisiesto usa el 29 de febrero', () => {
    expect(occurrencesBetween(rule('monthly', '2028-01-31'), '2028-02-01', '2028-02-29')).toEqual([
      '2028-02-29',
    ]);
  });

  it('quincenal desde el 1 de octubre: 15 y 31 de octubre, 15 y 30 de noviembre', () => {
    expect(occurrencesBetween(rule('biweekly', '2026-10-01'), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-15',
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
    ]);
  });

  it('quincenal que empieza el 20 no genera el 15 de ese mes', () => {
    expect(occurrencesBetween(rule('biweekly', '2026-10-20'), '2026-10-01', '2026-11-15')).toEqual([
      '2026-10-31',
      '2026-11-15',
    ]);
  });

  it('semanal mantiene el día de la semana (3 semanas sin abrir = 3 ocurrencias)', () => {
    const r = rule('weekly', '2026-09-21'); // lunes
    expect(occurrencesBetween(r, '2026-09-21', '2026-10-12')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
  });

  it('anual: el 29 de febrero pasa al 28 en años no bisiestos', () => {
    expect(occurrencesBetween(rule('yearly', '2028-02-29'), '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ]);
  });

  it('diaria', () => {
    expect(occurrencesBetween(rule('daily', '2026-10-10'), '2026-10-10', '2026-10-12')).toHaveLength(3);
  });

  it('fin por fecha: no pasa de endOn', () => {
    const r = rule('monthly', '2026-01-05', { endOn: '2026-03-05' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ]);
  });

  it('fin por repeticiones cuenta desde el inicio, no desde generateFrom', () => {
    const r = rule('monthly', '2026-01-05', { maxOccurrences: 3, generateFrom: '2026-02-01' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual(['2026-02-05', '2026-03-05']);
  });

  it('una regla pausada no genera nada', () => {
    const r = rule('daily', '2026-10-01', { pausedAt: '2026-10-05T00:00:00Z' });
    expect(occurrencesBetween(r, '2026-10-01', '2026-10-12')).toEqual([]);
  });

  it('al reanudar no se generan las fechas del periodo pausado (generateFrom)', () => {
    const r = rule('weekly', '2026-09-01', { generateFrom: '2026-10-06' });
    expect(occurrencesBetween(r, '2026-09-01', '2026-10-12')).toEqual(['2026-10-06']);
  });

  it('respeta el tope por ejecución (366)', () => {
    const r = rule('daily', '2020-01-01');
    expect(occurrencesBetween(r, '2020-01-01', '2026-12-31')).toHaveLength(366);
  });

  it('el ID de la ocurrencia es determinista por regla y fecha', () => {
    const ruleId = '6f8a9d8e-6d2a-4f6c-9a53-1d2e3f4a5b6c';
    expect(occurrenceId(ruleId, '2026-10-05')).toBe(occurrenceId(ruleId, '2026-10-05'));
    expect(occurrenceId(ruleId, '2026-10-05')).not.toBe(occurrenceId(ruleId, '2026-10-06'));
  });

  it('próxima fecha posterior a hoy', () => {
    expect(nextOccurrence(rule('monthly', '2026-01-05'), '2026-10-12')).toBe('2026-11-05');
    expect(
      nextOccurrence(rule('monthly', '2026-01-05', { endOn: '2026-03-05' }), '2026-10-12'),
    ).toBeNull();
  });
});
