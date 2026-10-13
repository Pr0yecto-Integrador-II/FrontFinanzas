/**
 * Íconos y colores permitidos por el servidor (backend: categories/domain/catalog.py).
 * Cualquier otro valor se rechaza, así que la interfaz solo ofrece estos.
 */
import { TxType } from '../../../core/models';

export const ICONS = [
  'restaurant',
  'shopping_cart',
  'directions_bus',
  'home',
  'bolt',
  'water_drop',
  'wifi',
  'health_and_safety',
  'school',
  'sports_esports',
  'movie',
  'shopping_bag',
  'pets',
  'flight',
  'local_cafe',
  'fitness_center',
  'child_care',
  'card_giftcard',
  'savings',
  'payments',
  'work',
  'laptop',
  'trending_up',
  'account_balance',
  'receipt_long',
  'phone_android',
  'checkroom',
  'build',
  'more_horiz',
  'paid',
] as const;

export const COLORS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#14B8A6',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#D946EF',
  '#EC4899',
  '#78716C',
  '#64748B',
] as const;

export const DEFAULT_EXPENSE_NAME = 'Otros gastos';

export const MAX_CATEGORY_NAME = 30;

export function typeLabel(t: TxType): string {
  return t === 'expense' ? 'Gasto' : 'Ingreso';
}
