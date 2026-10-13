import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Clock } from '../../../core/clock';
import { Transaction } from '../../../core/models';
import { addDays, addMonths, monthEnd, monthLabel, monthOf, monthStart } from '../../../core/dates';
import { CategoryBadge } from '../../../shared/category-badge';
import { EmptyState } from '../../../shared/empty-state';
import { MonthSwitcher } from '../../../shared/month-switcher';
import { MoneyPipe } from '../../../shared/money.pipe';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TxRow } from '../../movimientos/components/tx-row';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { PendingList } from '../../recurrentes/components/pending-list';
import { RuleRepo } from '../../recurrentes/data/rule.repo';
import { occurrencesBetween } from '../../recurrentes/domain/recurrence';
import { monthTotals, pendingTotals, topCategories, variation } from '../domain/summary';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    MonthSwitcher,
    MoneyPipe,
    CategoryBadge,
    EmptyState,
    TxRow,
    PendingList,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly clock = inject(Clock);
  private readonly txs = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly rules = inject(RuleRepo);

  protected readonly currentMonth = monthOf(this.clock.today());
  protected readonly month = signal(this.currentMonth);

  protected readonly title = computed(() => monthLabel(this.month(), false).toLowerCase());
  protected readonly totals = computed(() => monthTotals(this.txs.confirmed(), this.month()));
  private readonly previous = computed(() =>
    monthTotals(this.txs.confirmed(), addMonths(this.month(), -1)),
  );
  protected readonly expenseVar = computed(() =>
    variation(this.totals().expense, this.previous().expense),
  );
  protected readonly incomeVar = computed(() =>
    variation(this.totals().income, this.previous().income),
  );

  /** Participación de ingresos y gastos para la barra del encabezado. */
  protected readonly split = computed(() => {
    const { income, expense } = this.totals();
    const total = income + expense;
    return total ? { income: (income / total) * 100, expense: (expense / total) * 100 } : null;
  });

  protected readonly top = computed(() =>
    topCategories(this.txs.confirmed(), this.month()).map((s) => ({
      ...s,
      category: this.cats.byId().get(s.categoryId),
    })),
  );

  protected readonly pending = computed(() => pendingTotals(this.txs.visible()));

  /** HU13: recurrentes que faltan por generarse en el mes mostrado. */
  protected readonly upcoming = computed(() => {
    const today = this.clock.today();
    const month = this.month();
    if (month < this.currentMonth) return { count: 0, expense: 0, income: 0 };
    const from = month === this.currentMonth ? addDays(today, 1) : monthStart(month);
    const to = monthEnd(month);
    let expense = 0;
    let income = 0;
    let count = 0;
    for (const rule of this.rules.active()) {
      const n = occurrencesBetween(rule, from, to).length;
      count += n;
      if (rule.type === 'income') income += n * rule.amountMinor;
      else expense += n * rule.amountMinor;
    }
    return { count, expense, income };
  });

  protected readonly recent = computed(() => this.txs.confirmed().slice(0, 5));
  protected readonly isEmpty = computed(() => this.txs.visible().length === 0);

  protected readonly catOf = (id: string) => this.cats.byId().get(id);

  private readonly router = inject(Router);

  protected openTx(t: Transaction): void {
    void this.router.navigate(['/movimientos', t.id]);
  }

  protected arrow(v: number | null): string {
    if (v === null) return '—';
    return `${v > 0 ? '+' : ''}${v} %`;
  }
}
