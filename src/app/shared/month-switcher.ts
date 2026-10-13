import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { addMonths, monthLabel } from '../core/dates';

/** Selector de mes con flechas (HU13). Es el mismo en resumen y gráficos. */
@Component({
  selector: 'app-month-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="icon-btn" (click)="move(-1)" aria-label="Mes anterior">
      <span class="icon" aria-hidden="true">chevron_left</span>
    </button>
    <span class="label num" aria-live="polite">{{ label() }}</span>
    <button
      type="button"
      class="icon-btn"
      (click)="move(1)"
      [disabled]="max() !== null && month() >= max()!"
      aria-label="Mes siguiente"
    >
      <span class="icon" aria-hidden="true">chevron_right</span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: 999px;
      padding: 2px;
    }
    .label {
      min-width: 9.5ch;
      text-align: center;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .icon-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
  `,
})
export class MonthSwitcher {
  readonly month = model.required<string>();
  /** Último mes al que se puede avanzar (opcional). */
  readonly max = input<string | null>(null);
  protected readonly label = computed(() => monthLabel(this.month()));

  protected move(n: number): void {
    this.month.set(addMonths(this.month(), n));
  }
}
