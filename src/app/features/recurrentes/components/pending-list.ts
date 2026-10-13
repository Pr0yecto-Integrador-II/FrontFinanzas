import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { shortDate } from '../../../core/dates';
import { formatPlain, parseMoney } from '../../../core/money';
import { Transaction } from '../../../core/models';
import { CategoryBadge } from '../../../shared/category-badge';
import { MoneyPipe } from '../../../shared/money.pipe';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { BudgetRepo } from '../../presupuestos/data/budget.repo';
import { AuthService } from '../../../core/auth.service';

/**
 * "Por confirmar" (HU09): recurrentes con confirmación. No cuentan en el balance hasta
 * que el usuario los confirma (puede ajustar el monto) u omite.
 */
@Component({
  selector: 'app-pending-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryBadge, MoneyPipe],
  template: `
    @if (items().length) {
      <section class="card pending" aria-labelledby="pend-title">
        <header>
          <h2 id="pend-title">Por confirmar</h2>
          <span class="count">{{ items().length }}</span>
        </header>
        <ul class="list">
          @for (t of items(); track t.id) {
            <li class="item">
              <app-category-badge
                [icon]="cat(t)?.icon ?? 'more_horiz'"
                [color]="cat(t)?.color ?? '#64748B'"
                style="--size: 40px"
              />
              <div class="info">
                <strong>{{ t.description || cat(t)?.name }}</strong>
                <span class="muted">{{ date(t) }} · estimado {{ t.amountMinor | money }}</span>
              </div>
              <input
                class="input amt"
                inputmode="decimal"
                [value]="draft(t)"
                (input)="setDraft(t.id, $any($event.target).value)"
                [attr.aria-label]="'Monto de ' + (t.description || cat(t)?.name)"
              />
              <div class="actions">
                <button type="button" class="btn sm" (click)="confirm(t)">Confirmar</button>
                <button type="button" class="btn sm ghost" (click)="skip(t)">Omitir</button>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .pending {
      border-color: color-mix(in srgb, var(--c-warn) 45%, var(--c-line));
      background: color-mix(in srgb, var(--c-warn-soft) 55%, var(--c-surface));
    }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .count {
      min-width: 24px;
      height: 24px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      background: var(--c-warn);
      color: #fff;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 12px;
      align-items: center;
      padding: 12px 0;
      border-top: 1px solid var(--c-line);
    }
    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .info .muted {
      font-size: 0.8125rem;
    }
    .amt {
      grid-column: 1 / -1;
      font-family: var(--font-display);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
    }
    @media (min-width: 720px) {
      .item {
        grid-template-columns: auto 1fr 150px auto;
      }
      .amt,
      .actions {
        grid-column: auto;
      }
    }
  `,
})
export class PendingList {
  private readonly repo = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly budgets = inject(BudgetRepo);
  private readonly toast = inject(Toast);
  private readonly auth = inject(AuthService);

  protected readonly items = computed(() =>
    [...this.repo.pending()].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
  );
  private readonly drafts = signal<Record<string, string>>({});

  protected cat(t: Transaction) {
    return this.cats.byId().get(t.categoryId);
  }
  protected date(t: Transaction): string {
    return shortDate(t.occurredOn);
  }
  protected draft(t: Transaction): string {
    return this.drafts()[t.id] ?? formatPlain(t.amountMinor);
  }
  protected setDraft(id: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  protected async confirm(t: Transaction): Promise<void> {
    const amount = parseMoney(this.draft(t));
    if (amount === null || amount <= 0) {
      this.toast.show('Ingresa un monto mayor que 0');
      return;
    }
    await this.repo.confirm(t.id, amount);
    const saved: Transaction = { ...t, amountMinor: amount, status: 'confirmed' };
    const alerts = await this.budgets.alertsAfterSave(
      saved,
      0,
      this.auth.currency(),
      this.cat(t)?.name ?? 'esta categoría',
    );
    this.toast.show(t.type === 'income' ? 'Ingreso registrado' : 'Gasto registrado');
    for (const a of alerts) this.toast.alert(a);
  }

  protected async skip(t: Transaction): Promise<void> {
    await this.repo.skip(t.id);
    this.toast.show('Omitido. No se volverá a generar');
  }
}
