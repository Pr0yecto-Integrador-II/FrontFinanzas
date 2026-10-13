import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { monthLabel } from '../../../core/dates';
import { MAX_AMOUNT_MINOR, formatPlain, parseMoney } from '../../../core/money';
import { Budget, Category } from '../../../core/models';
import { BudgetRepo } from '../data/budget.repo';

export interface BudgetDialogData {
  category: Category;
  month: string;
  current: Budget | null;
}

export type BudgetDialogResult = 'saved' | 'removed';

@Component({
  selector: 'app-budget-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>Presupuesto de {{ data.category.name }}</h2>
    <mat-dialog-content>
      <form class="form" (submit)="$event.preventDefault(); save()">
        <div class="field">
          <label for="limit">Límite mensual</label>
          <input
            id="limit"
            class="input big num"
            inputmode="decimal"
            placeholder="0"
            [value]="text()"
            (input)="text.set($any($event.target).value); touched.set(true)"
            [class.invalid]="!!error()"
            autocomplete="off"
          />
          @if (error(); as e) {
            <span class="error-text">{{ e }}</span>
          }
        </div>
        <p class="hint">
          Aplica desde {{ monthName }} y se repite cada mes hasta que lo cambies o elimines. Los meses anteriores conservan su valor.
          Nunca impide registrar un gasto.
        </p>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (data.current) {
        <button type="button" class="btn ghost danger-text" (click)="remove()">Quitar</button>
      }
      <span class="grow"></span>
      <button type="button" class="btn ghost" mat-dialog-close>Cancelar</button>
      <button type="button" class="btn" [disabled]="!valid()" (click)="save()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 4px;
    }
    .big {
      font-size: 1.6rem;
      font-weight: 700;
      min-height: 60px;
    }
    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
    .grow {
      flex: 1;
    }
    .danger-text {
      color: var(--c-expense);
    }
  `,
})
export class BudgetDialog {
  protected readonly data = inject<BudgetDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BudgetDialog, BudgetDialogResult>>(MatDialogRef);
  private readonly repo = inject(BudgetRepo);

  protected readonly monthName = monthLabel(this.data.month);
  protected readonly text = signal(this.data.current ? formatPlain(this.data.current.amountMinor) : '');
  protected readonly touched = signal(false);

  private readonly minor = computed(() => parseMoney(this.text()));
  protected readonly error = computed(() => {
    if (!this.touched()) return null;
    const m = this.minor();
    if (m === null || m <= 0) return 'Ingresa un monto mayor que 0';
    if (m > MAX_AMOUNT_MINOR) return 'El monto es demasiado grande';
    return null;
  });
  protected readonly valid = computed(() => {
    const m = this.minor();
    return m !== null && m > 0 && m <= MAX_AMOUNT_MINOR;
  });

  protected async save(): Promise<void> {
    this.touched.set(true);
    if (!this.valid()) return;
    await this.repo.setFrom(this.data.category.id, this.minor() as number, this.data.month);
    this.ref.close('saved');
  }

  protected async remove(): Promise<void> {
    if (!this.data.current) return;
    await this.repo.remove(this.data.current);
    this.ref.close('removed');
  }
}
