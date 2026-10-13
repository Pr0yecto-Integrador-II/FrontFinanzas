/** Monedas aceptadas por el servidor (backend: auth/domain/rules.py). */
export const CURRENCIES = (
  'COP USD EUR MXN ARS BRL CLP PEN UYU BOB PYG VES CRC GTQ HNL NIO PAB DOP CUP ' +
  'GBP CHF JPY CNY CAD AUD NZD SEK NOK DKK PLN CZK HUF RON UAH TRY RUB INR PKR ' +
  'BDT IDR PHP THB VND MYR SGD KRW HKD TWD ILS AED SAR QAR KWD EGP MAD ZAR NGN ' +
  'KES GHS'
).split(' ');

export const DEFAULT_CURRENCY = 'COP';

export function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames('es', { type: 'currency' }).of(code);
    return name ? `${code} · ${name.charAt(0).toUpperCase()}${name.slice(1)}` : code;
  } catch {
    return code;
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailError(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!e) return 'Escribe tu correo';
  if (e.length > 254 || !EMAIL.test(e)) return 'Escribe un correo válido';
  return null;
}

/** Reglas de HU01: 8 a 128 caracteres, con al menos una letra y un número. */
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Usa al menos 8 caracteres';
  if (password.length > 128) return 'Usa máximo 128 caracteres';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe tener al menos una letra y un número';
  }
  return null;
}

export function confirmationError(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'Las contraseñas no coinciden';
}
