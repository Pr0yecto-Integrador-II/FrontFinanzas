import { Injectable, computed, signal } from '@angular/core';
import { monthEnd, monthOf, monthStart } from '../../../core/dates';
import { EMPTY_FILTERS, TxFilters, activeFilterCount } from '../domain/filters';

/** Los filtros se mantienen mientras la app esté abierta (HU12 regla 6). */
@Injectable({ providedIn: 'root' })
export class FiltersState {
  readonly filters = signal<TxFilters>({ ...EMPTY_FILTERS });
  readonly count = computed(() => activeFilterCount(this.filters()));

  patch(changes: Partial<TxFilters>): void {
    this.filters.update((f) => ({ ...f, ...changes }));
  }

  clear(): void {
    this.filters.set({ ...EMPTY_FILTERS });
  }

  /** Atajo de HU10/HU15: ver todo lo de una etiqueta o de una categoría y mes. */
  showTag(tag: string): void {
    this.filters.set({ ...EMPTY_FILTERS, tag });
  }

  showCategoryInMonth(categoryId: string, month: string): void {
    this.filters.set({
      ...EMPTY_FILTERS,
      period: 'custom',
      from: monthStart(month),
      to: monthEnd(month),
      type: 'expense',
      categoryIds: [categoryId],
    });
  }

  showMonth(date: string): void {
    const month = monthOf(date);
    this.filters.set({ ...EMPTY_FILTERS, period: 'custom', from: monthStart(month), to: monthEnd(month) });
  }
}
