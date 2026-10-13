import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Clock } from '../../../core/clock';
import { monthOf } from '../../../core/dates';
import { Category } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { CategoryBadge } from '../../../shared/category-badge';
import { EmptyState } from '../../../shared/empty-state';
import { MoneyPipe } from '../../../shared/money.pipe';
import { MonthSwitcher } from '../../../shared/month-switcher';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { BudgetDialog, BudgetDialogData, BudgetDialogResult } from '../components/budget-dialog';
import { BudgetRepo } from '../data/budget.repo';
import { budgetStatus, effectiveBudget, spentInMonth } from '../domain/budget';

@Component({
  selector: 'app-budgets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MonthSwitcher, MoneyPipe, CategoryBadge, EmptyState],
  templateUrl: './budgets.page.html',
  styleUrl: './budgets.page.scss',
})
export class BudgetsPage {
  private readonly clock = inject(Clock);
  private readonly cats = inject(CategoryRepo);
  private readonly txs = inject(TransactionRepo);
  private readonly budgets = inject(BudgetRepo);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(Toast);
  private readonly sync = inject(SyncService);

  protected readonly month = signal(monthOf(this.clock.today()));

  protected readonly rows = computed(() => {
    const month = this.month();
    const confirmed = this.txs.confirmed();
    const all = this.budgets.active();
    return this.cats.expense().map((category) => {
      const budget = effectiveBudget(all, category.id, month);
      const spent = spentInMonth(confirmed, category.id, month);
      return {
        category,
        budget,
        spent,
        status: budget ? budgetStatus(budget.amountMinor, spent) : null,
      };
    });
  });

  protected readonly withBudget = computed(() => this.rows().filter((r) => r.status));
  protected readonly without = computed(() => this.rows().filter((r) => !r.status));

  /** Total presupuestado frente al total gastado en categorías con presupuesto (HU14 regla 6). */
  protected readonly totals = computed(() => {
    const rows = this.withBudget();
    const limit = rows.reduce((a, r) => a + (r.status?.limit ?? 0), 0);
    const spent = rows.reduce((a, r) => a + r.spent, 0);
    return { limit, spent, status: budgetStatus(limit, spent), count: rows.length };
  });

  protected pct(p: number): number {
    return Math.min(100, p);
  }

  protected async edit(category: Category, current: ReturnType<typeof effectiveBudget>): Promise<void> {
    const ref = this.dialog.open<BudgetDialog, BudgetDialogData, BudgetDialogResult>(BudgetDialog, {
      data: { category, month: this.month(), current },
      width: '440px',
      maxWidth: '94vw',
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    if (result === 'saved') this.toast.show('Presupuesto guardado');
    else if (current) this.toast.undo('Presupuesto eliminado', () => void this.budgets.restore(current));
    void this.sync.sync();
  }
}
