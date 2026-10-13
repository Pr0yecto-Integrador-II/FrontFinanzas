/** Dinero siempre en enteros de centavos (`amount_minor`). Nunca `float` guardado. */

export const MAX_AMOUNT_MINOR = 999_999_999_999_999; // 13 enteros + 2 decimales

export function formatMoney(minor: number, currency = 'COP', opts?: { sign?: boolean }): string {
  const abs = Math.abs(minor);
  const hasCents = abs % 100 !== 0;
  const text = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs / 100);
  if (minor < 0) return `−${text}`;
  if (opts?.sign && minor > 0) return `+${text}`;
  return text;
}

/** Monto sin símbolo, para el campo de captura. */
export function formatPlain(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  const w = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(whole);
  return cents ? `${w},${String(cents).padStart(2, '0')}` : w;
}

/**
 * Interpreta "1.250.000", "1250000,50" o "1,250,000.50" y devuelve centavos.
 * El último separador es decimal solo si aparece una vez y le siguen 1 o 2 dígitos;
 * en cualquier otro caso se toma como separador de miles ("1.250" = 1250).
 * Devuelve `null` si no hay dígitos o el valor no es un entero seguro.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const idx = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let whole = s;
  let frac = '';
  if (idx >= 0) {
    const sep = s[idx];
    const after = s.slice(idx + 1);
    const occurrences = s.split(sep).length - 1;
    if (occurrences === 1 && after.length >= 1 && after.length <= 2) {
      whole = s.slice(0, idx);
      frac = after;
    }
  }
  whole = whole.replace(/[.,]/g, '');
  const minor = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}
