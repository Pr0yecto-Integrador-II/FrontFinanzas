import { describe, expect, it } from 'vitest';
import { Category } from '../../../core/models';
import { isLastOfType, nameKey, validateCategoryName } from './rules';

const cat = (id: string, name: string, type: 'expense' | 'income' = 'expense', deleted = false): Category => ({
  id,
  name,
  nameKey: nameKey(name),
  type,
  icon: 'home',
  color: '#EF4444',
  isDefault: false,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: deleted ? '2026-10-02T00:00:00Z' : null,
  syncState: 'synced',
});

describe('categorías (HU08)', () => {
  it('name_key: minúsculas y sin tildes ("Café" = "cafe")', () => {
    expect(nameKey('Café')).toBe('cafe');
    expect(nameKey('  CAFE ')).toBe('cafe');
  });

  it('rechaza un nombre repetido del mismo tipo', () => {
    const existing = [cat('1', 'Café')];
    expect(validateCategoryName('cafe', 'expense', existing)).toBe('duplicate');
  });

  it('el mismo nombre en otro tipo es válido', () => {
    expect(validateCategoryName('Café', 'income', [cat('1', 'Café')])).toBeNull();
  });

  it('editar la misma categoría no cuenta como duplicado', () => {
    const existing = [cat('1', 'Café')];
    expect(validateCategoryName('Café', 'expense', existing, '1')).toBeNull();
  });

  it('las eliminadas no bloquean el nombre', () => {
    expect(validateCategoryName('Café', 'expense', [cat('1', 'Café', 'expense', true)])).toBeNull();
  });

  it('valida vacío y largo (1 a 30 caracteres)', () => {
    expect(validateCategoryName('  ', 'expense', [])).toBe('empty');
    expect(validateCategoryName('x'.repeat(31), 'expense', [])).toBe('too_long');
  });

  it('siempre debe quedar al menos una categoría de cada tipo', () => {
    const a = cat('1', 'Salario', 'income');
    expect(isLastOfType(a, [a, cat('2', 'Comida')])).toBe(true);
    expect(isLastOfType(a, [a, cat('3', 'Extra', 'income')])).toBe(false);
  });
});
