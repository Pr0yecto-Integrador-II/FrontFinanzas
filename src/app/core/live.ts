import { DestroyRef, Signal, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';

/**
 * Consulta viva sobre Dexie expuesta como signal: se vuelve a calcular sola
 * cada vez que cambian las tablas que lee. Debe llamarse en un contexto de inyección.
 */
export function liveSignal<T>(querier: () => T | Promise<T>, initial: T): Signal<T> {
  const state = signal<T>(initial);
  const sub = liveQuery(querier).subscribe({
    next: (v) => state.set(v),
    error: (e) => console.error('liveQuery', e),
  });
  inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  return state.asReadonly();
}
