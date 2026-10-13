import { MAX_AMOUNT_MINOR } from '../../../core/money';

export const MAX_DESCRIPTION = 100;
export const MAX_NOTE = 500;
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 20;

/** "#Viaje Cartagena" -> "viaje-cartagena" (HU10 regla 2). */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type TagError = 'empty' | 'too_long' | 'max';

/** Agrega una etiqueta ya normalizada sin duplicar. Devuelve el error si no se puede. */
export function addTag(
  tags: readonly string[],
  raw: string,
): { tags: string[]; error: TagError | null } {
  const tag = normalizeTag(raw);
  if (!tag) return { tags: [...tags], error: 'empty' };
  if (tag.length > MAX_TAG_LENGTH) return { tags: [...tags], error: 'too_long' };
  if (tags.includes(tag)) return { tags: [...tags], error: null };
  if (tags.length >= MAX_TAGS) return { tags: [...tags], error: 'max' };
  return { tags: [...tags, tag], error: null };
}

export const TAG_ERROR_TEXT: Record<TagError, string> = {
  empty: 'Escribe una etiqueta',
  too_long: 'Máximo 20 caracteres',
  max: 'Máximo 5 etiquetas por movimiento',
};

export interface TxFormValue {
  amountMinor: number | null;
  occurredOn: string;
  description: string;
  note: string;
}

export interface TxFormErrors {
  amount?: string;
  date?: string;
  category?: string;
  description?: string;
  note?: string;
}

/** Validaciones de HU04/HU05. `today` viene del Clock inyectado. */
export function validateTx(
  v: TxFormValue,
  categoryId: string | null,
  today: string,
): TxFormErrors {
  const errors: TxFormErrors = {};
  if (v.amountMinor === null || v.amountMinor <= 0) {
    errors.amount = 'Ingresa un monto mayor que 0';
  } else if (v.amountMinor > MAX_AMOUNT_MINOR) {
    errors.amount = 'El monto es demasiado grande';
  }
  if (!v.occurredOn) errors.date = 'Elige una fecha';
  else if (v.occurredOn > today) errors.date = 'La fecha no puede ser futura';
  if (!categoryId) errors.category = 'Elige una categoría';
  if (v.description.trim().length > MAX_DESCRIPTION) {
    errors.description = 'Máximo 100 caracteres';
  }
  if (v.note.trim().length > MAX_NOTE) errors.note = 'Máximo 500 caracteres';
  return errors;
}

export function hasErrors(e: TxFormErrors): boolean {
  return Object.keys(e).length > 0;
}
