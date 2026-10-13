import { Category, TxType } from '../../../core/models';
import { MAX_CATEGORY_NAME } from './catalog';

/**
 * Misma normalización que el servidor (D-38): NFKD, sin marcas diacríticas y en minúsculas.
 * Sirve para avisar de nombres repetidos sin conexión.
 */
export function nameKey(name: string): string {
  return name
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export type CategoryError =
  | 'empty'
  | 'too_long'
  | 'duplicate';

export function validateCategoryName(
  name: string,
  type: TxType,
  existing: readonly Category[],
  selfId?: string,
): CategoryError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > MAX_CATEGORY_NAME || nameKey(trimmed).length > MAX_CATEGORY_NAME) {
    return 'too_long';
  }
  const key = nameKey(trimmed);
  const clash = existing.some(
    (c) => c.id !== selfId && !c.deletedAt && c.type === type && c.nameKey === key,
  );
  return clash ? 'duplicate' : null;
}

export const CATEGORY_ERROR_TEXT: Record<CategoryError, (type: TxType) => string> = {
  empty: () => 'Escribe un nombre',
  too_long: () => 'Máximo 30 caracteres',
  duplicate: (type) =>
    type === 'expense'
      ? 'Ya tienes una categoría de gasto con ese nombre'
      : 'Ya tienes una categoría de ingreso con ese nombre',
};

/** HU08 regla 6: siempre debe quedar al menos una categoría de cada tipo. */
export function isLastOfType(category: Category, all: readonly Category[]): boolean {
  return !all.some((c) => c.id !== category.id && !c.deletedAt && c.type === category.type);
}
