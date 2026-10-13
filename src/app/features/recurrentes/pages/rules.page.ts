import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Clock } from '../../../core/clock';
import { longDate } from '../../../core/dates';
import { RecurringRule } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { CategoryBadge } from '../../../shared/category-badge';
import { Dialogs } from '../../../shared/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state';
import { MoneyPipe } from '../../../shared/money.pipe';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { RuleRepo } from '../data/rule.repo';
import { FREQUENCY_LABEL, nextOccurrence } from '../domain/recurrence';

@Component({
  selector: 'app-rules-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CategoryBadge, EmptyState, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Recurrentes</h1>
        <div class="head-actions">
          <a class="btn ghost sm" routerLink="/recurrentes/proximos">Próximos 30 días</a>
          <a class="btn sm" routerLink="/recurrentes/nueva"><span class="icon" aria-hidden="true">add</span> Nueva</a>
        </div>
      </div>

      @if (items().length) {
        <ul class="list">
          @for (r of items(); track r.rule.id) {
            <li class="card rule" [class.paused]="!!r.rule.pausedAt">
              <app-category-badge [icon]="r.category?.icon ?? 'more_horiz'" [color]="r.category?.color ?? '#64748B'" />
              <a class="info" [routerLink]="['/recurrentes', r.rule.id]">
                <strong>{{ r.rule.description || r.category?.name }}</strong>
                <span class="muted">
                  {{ r.freq }} ·
                  {{ r.rule.mode === 'auto' ? 'Automático' : 'Con confirmación' }}
                </span>
                <span class="muted small">
                  @if (r.rule.pausedAt) {
                    En pausa
                  } @else if (r.next) {
                    Próxima: {{ r.nextLabel }}
                  } @else {
                    Terminó
                  }
                </span>
              </a>
              <span class="amt num" [class.income]="r.rule.type === 'income'" [class.expense]="r.rule.type === 'expense'">
                {{ r.rule.type === 'income' ? '+' : '−' }}{{ r.rule.amountMinor | money }}
              </span>
              <button type="button" class="icon-btn" (click)="toggle(r.rule)" [attr.aria-label]="r.rule.pausedAt ? 'Reanudar' : 'Pausar'">
                <span class="icon" aria-hidden="true">{{ r.rule.pausedAt ? 'play_arrow' : 'pause' }}</span>
              </button>
              <button type="button" class="icon-btn del" (click)="remove(r.rule)" aria-label="Eliminar regla">
                <span class="icon" aria-hidden="true">delete</span>
              </button>
            </li>
          }
        </ul>
      } @else {
        <app-empty-state icon="event_repeat" text="Programa una vez tus pagos fijos (arriendo, servicios, salario) y se registran solos.">
          <a class="btn" routerLink="/recurrentes/nueva">Crear el primero</a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .head-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .rule {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .rule.paused {
      opacity: 0.65;
    }
    .info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .small {
      font-size: 0.8125rem;
    }
    .amt {
      font-weight: 700;
      white-space: nowrap;
    }
    .del {
      color: var(--c-expense);
    }
    @media (max-width: 600px) {
      .rule {
        flex-wrap: wrap;
      }
      .info {
        flex-basis: 60%;
      }
    }
  `,
})
export class RulesPage {
  private readonly repo = inject(RuleRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly clock = inject(Clock);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(Toast);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);

  protected readonly items = computed(() => {
    const today = this.clock.today();
    return this.repo.active().map((rule) => {
      const next = nextOccurrence(rule, today);
      return {
        rule,
        category: this.cats.byId().get(rule.categoryId),
        freq: FREQUENCY_LABEL[rule.frequency],
        next,
        nextLabel: next ? longDate(next) : '',
      };
    });
  });

  protected async toggle(rule: RecurringRule): Promise<void> {
    if (rule.pausedAt) {
      await this.repo.resume(rule);
      this.toast.show('Regla reanudada');
    } else {
      await this.repo.pause(rule);
      this.toast.show('Regla en pausa');
    }
    void this.sync.sync();
  }

  protected async remove(rule: RecurringRule): Promise<void> {
    const r = await this.dialogs.confirm({
      title: '¿Eliminar esta regla?',
      message: 'Deja de generar movimientos. Los ya registrados se conservan y los pendientes por confirmar se eliminan.',
      confirmText: 'Eliminar regla',
      danger: true,
    });
    if (r !== 'confirm') return;
    await this.repo.remove(rule);
    this.toast.show('Regla eliminada');
    void this.sync.sync();
    void this.router.navigateByUrl('/recurrentes');
  }
}
