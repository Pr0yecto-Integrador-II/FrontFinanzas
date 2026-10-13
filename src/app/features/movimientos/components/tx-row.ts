import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Category, Transaction } from '../../../core/models';
import { CategoryBadge } from '../../../shared/category-badge';
import { MoneyPipe } from '../../../shared/money.pipe';

/** Fila de movimiento (HU11): ícono, descripción, monto con signo e indicadores. */
@Component({
  selector: 'app-tx-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryBadge, MoneyPipe],
  template: `
    <button type="button" class="row" (click)="open.emit(tx())" [attr.aria-label]="aria()">
      <app-category-badge [icon]="category()?.icon ?? 'more_horiz'" [color]="category()?.color ?? '#64748B'" />
      <span class="main">
        <span class="title">{{ tx().description || category()?.name || 'Sin categoría' }}</span>
        <span class="sub">
          @if (tx().description) {
            <span>{{ category()?.name }}</span>
          }
          @if (tx().recurringRuleId) {
            <span class="icon flag" title="Movimiento recurrente" aria-label="Recurrente">event_repeat</span>
          }
          @if (tx().tags.length) {
            <span class="icon flag" title="Tiene etiquetas" aria-label="Con etiquetas">sell</span>
          }
          @if (tx().syncState === 'pending') {
            <span class="icon flag" title="Pendiente de sincronizar" aria-label="Pendiente de sincronizar">schedule</span>
          }
          @if (tx().syncState === 'rejected') {
            <span class="icon flag bad" title="El servidor rechazó este cambio" aria-label="Rechazado">error</span>
          }
        </span>
      </span>
      <span class="amount num" [class.income]="tx().type === 'income'" [class.expense]="tx().type === 'expense'">
        {{ signed() | money: 'sign' }}
      </span>
    </button>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 64px;
      padding: 10px 4px;
      background: transparent;
      border: 0;
      border-radius: 14px;
      text-align: left;
      cursor: pointer;
    }
    .row:hover {
      background: var(--c-surface-2);
    }
    .main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .title {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--c-muted);
      font-size: 0.8125rem;
    }
    .flag {
      font-size: 16px;
    }
    .flag.bad {
      color: var(--c-expense);
    }
    .amount {
      font-weight: 700;
      font-size: 1.0625rem;
      white-space: nowrap;
    }
  `,
})
export class TxRow {
  readonly tx = input.required<Transaction>();
  readonly category = input<Category | undefined>();
  readonly open = output<Transaction>();

  /** Gasto con "−" e ingreso con "+": el color no es la única señal. */
  protected readonly signed = computed(() =>
    this.tx().type === 'income' ? this.tx().amountMinor : -this.tx().amountMinor,
  );
  protected readonly aria = computed(
    () => `${this.tx().description || this.category()?.name || 'Movimiento'}, abrir detalle`,
  );
}
