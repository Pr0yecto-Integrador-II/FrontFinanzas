import { v5 as uuidv5 } from 'uuid';
import { addDays, daysInMonth, fmtIso, parseIso, weekday } from '../../../core/dates';
import { Frequency } from '../../../core/models';

/** Tope de ocurrencias que se generan por regla en cada ejecución (HU09 regla 4). */
export const MAX_PER_RUN = 366;

export interface RuleSchedule {
  frequency: Frequency;
  startOn: string;
  endOn: string | null;
  maxOccurrences: number | null;
  generateFrom: string;
  pausedAt: string | null;
}

/** Todas las fechas de la regla en orden, desde `startOn`, sin pasar de `limit` (inclusive). */
function* scheduleDates(frequency: Frequency, startOn: string, limit: string): Generator<string> {
  const start = parseIso(startOn);
  switch (frequency) {
    case 'daily': {
      for (let d = startOn; d <= limit; d = addDays(d, 1)) yield d;
      return;
    }
    case 'weekly': {
      // Mismo día de la semana que la fecha de inicio
      for (let d = startOn; d <= limit; d = addDays(d, 7)) yield d;
      return;
    }
    case 'biweekly': {
      // Días 15 y último de cada mes (como se paga el salario quincenal)
      let y = start.y;
      let m = start.m;
      while (fmtIso(y, m, 1) <= limit) {
        const mid = fmtIso(y, m, 15);
        const last = fmtIso(y, m, daysInMonth(y, m));
        if (mid >= startOn && mid <= limit) yield mid;
        if (last >= startOn && last <= limit) yield last;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      return;
    }
    case 'monthly': {
      // Mismo día del mes; si no existe en el mes, el último día
      let y = start.y;
      let m = start.m;
      for (;;) {
        const iso = fmtIso(y, m, Math.min(start.d, daysInMonth(y, m)));
        if (iso > limit) return;
        yield iso;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
    case 'yearly': {
      // Misma fecha cada año; el 29 de febrero pasa al 28 en años no bisiestos
      for (let y = start.y; ; y += 1) {
        const iso = fmtIso(y, start.m, Math.min(start.d, daysInMonth(y, start.m)));
        if (iso > limit) return;
        yield iso;
      }
    }
  }
}

/**
 * Fechas de la regla dentro de `[from, to]` que se pueden generar.
 * Respeta fin por fecha o por número de repeticiones, `generateFrom` y la pausa.
 * `to` se recorta a `endOn`. Las repeticiones se cuentan desde `startOn`.
 */
export function occurrencesBetween(
  rule: RuleSchedule,
  from: string,
  to: string,
  limit = MAX_PER_RUN,
): string[] {
  if (rule.pausedAt) return [];
  const upper = rule.endOn && rule.endOn < to ? rule.endOn : to;
  const lower = from > rule.generateFrom ? from : rule.generateFrom;
  const out: string[] = [];
  let count = 0;
  for (const date of scheduleDates(rule.frequency, rule.startOn, upper)) {
    count += 1;
    if (rule.maxOccurrences !== null && count > rule.maxOccurrences) break;
    if (date < lower) continue;
    out.push(date);
    if (out.length >= limit) break;
  }
  return out;
}

/** ID determinista: si dos dispositivos generan la misma ocurrencia, el servidor guarda una sola. */
export function occurrenceId(ruleId: string, dateIso: string): string {
  return uuidv5(dateIso, ruleId);
}

/** Próxima fecha de la regla estrictamente posterior a `today`, o `null` si ya terminó. */
export function nextOccurrence(rule: RuleSchedule, today: string): string | null {
  const horizon = addDays(today, 366 * 2);
  return occurrencesBetween(rule, addDays(today, 1), horizon, 1)[0] ?? null;
}

export function weekdayName(iso: string): string {
  return ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'][weekday(iso)];
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  biweekly: 'Quincenal',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};
