import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'finanzas.theme';

/** Tema claro/oscuro. Por defecto sigue al sistema; la elección se recuerda en este navegador. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>('auto');

  constructor() {
    try {
      const saved = localStorage.getItem(KEY) as ThemeChoice | null;
      if (saved === 'light' || saved === 'dark') this.choice.set(saved);
    } catch {
      /* almacenamiento bloqueado: se usa el tema del sistema */
    }
    this.apply();
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      if (choice === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* ignorar */
    }
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    const c = this.choice();
    if (c === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', c);
  }
}
