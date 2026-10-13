import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Clock } from '../../../core/clock';
import { addDays, dayHeading } from '../../../core/dates';
import { Category } from '../../../core/models';
import { CategoryBadge } from '../../../shared/category-badge';
import { EmptyState } from '../../../shared/empty-state';
import { MoneyPipe } from '../../../shared/money.pipe';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { RuleRepo } from '../data/rule.repo';
import { occurrencesBetween } from '../domain/recurrence';

/** HU09 regla 10: lo que viene en los siguientes 30 días, con totales esperados. */
@Component({
  selector: 'app-upcoming-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CategoryBadge, EmptyState, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Próximos 30 días</h1>
        <a class="btn ghost sm" routerLink="/recurrentes">Ver reglas</a>
      </div>

      <div class="totals">
        <div class="card"><span class="muted">Gastos esperados</span><strong class="num expense">{{ totals().expense | money }}</strong></div>
        <div class="card"><span class="muted">Ingresos esperados</span><strong class="num income">{{ totals().income | money }}</strong></div>
      </div>

      @if (items().length) {
        <ul class="list card">
          @for (i of items(); track i.key) {
            <li class="row">
              <app-category-badge [icon]="i.category?.icon ?? 'more_horiz'" [color]="i.category?.color ?? '#64748B'" />
              <span class="info">
                <strong>{{ i.title }}</strong>
                <span class="muted day">{{ i.when }}</span>
              </span>
              <span class="num amt" [class.income]="i.type === 'income'" [class.expense]="i.type === 'expense'">
                {{ i.type === 'income' ? '+' : '−' }}{{ i.amount | money }}
              </span>
            </li>
          }
        </ul>
      } @else {
        <app-empty-state icon="event_available" text="No hay pagos programados para los próximos 30 días." />
      }
    </div>
  `,
  styles: `
    .totals {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .totals .card {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .totals strong {
      font-size: 1.25rem;
    }
    .list.card {
      padding: 4px 12px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
    }
    .row + .row {
      border-top: 1px solid var(--c-line);
    }
    .info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .day {
      text-transform: capitalize;
      font-size: 0.875rem;
    }
    .amt {
      font-weight: 700;
    }
  `,
})
export class UpcomingPage {
  private readonly rules = inject(RuleRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly clock = inject(Clock);

  protected readonly items = computed(() => {
    const today = this.clock.today();
    const from = addDays(today, 1);
    const to = addDays(today, 30);
    const out: {
      key: string;
      date: string;
      when: string;
      title: string;
      amount: number;
      type: 'expense' | 'income';
      category: Category | undefined;
    }[] = [];
    for (const rule of this.rules.active()) {
      const category = this.cats.byId().get(rule.categoryId);
      for (const date of occurrencesBetween(rule, from, to)) {
        out.push({
          key: `${rule.id}-${date}`,
          date,
          when: dayHeading(date, today),
          title: rule.description || category?.name || 'Recurrente',
          amount: rule.amountMinor,
          type: rule.type,
          category,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });

  protected readonly totals = computed(() => {
    let expense = 0;
    let income = 0;
    for (const i of this.items()) {
      if (i.type === 'income') income += i.amount;
      else expense += i.amount;
    }
    return { expense, income };
  });
}
