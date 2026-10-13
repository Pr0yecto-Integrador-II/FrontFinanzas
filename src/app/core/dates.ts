/** Funciones puras sobre fechas ISO `YYYY-MM-DD` (sin zonas horarias: se opera en UTC). */

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function fmtIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseIso(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmtIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Día de la semana: 0 = domingo. */
export function weekday(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return fmtIso(y, m, daysInMonth(y, m));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function diffDays(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000,
  );
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

export function monthLabel(month: string, withYear = true): string {
  const name = monthName(month);
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return withYear ? `${cap} ${month.slice(0, 4)}` : cap;
}

export function shortMonth(month: string): string {
  return monthName(month).slice(0, 3);
}

/** "Hoy", "Ayer" o "lunes 12 de octubre". */
export function dayHeading(iso: string, today: string): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const { m, d } = parseIso(iso);
  return `${WEEKDAYS[weekday(iso)]} ${d} de ${MONTHS[m - 1]}`;
}

export function longDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

export function shortDate(iso: string): string {
  const { m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
