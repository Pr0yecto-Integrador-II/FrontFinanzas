import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Category, TxType } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { CategoryBadge } from '../../../shared/category-badge';
import { Dialogs } from '../../../shared/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state';
import { Toast } from '../../../shared/toast.service';
import { CategoryDialog, CategoryDialogData } from '../components/category-dialog';
import { ReassignData, ReassignDialog } from '../components/reassign-dialog';
import { CategoryRepo } from '../data/category.repo';
import { isLastOfType } from '../domain/rules';

@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryBadge, EmptyState],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Categorías</h1>
        <button type="button" class="btn sm" (click)="edit(undefined, 'expense')">
          <span class="icon" aria-hidden="true">add</span> Nueva
        </button>
      </div>

      @for (sec of sections; track sec.type) {
        <section class="sec" [attr.aria-labelledby]="'h-' + sec.type">
          <div class="sec-head">
            <h2 [id]="'h-' + sec.type">{{ sec.title }}</h2>
            <button type="button" class="btn text sm" (click)="edit(undefined, sec.type)">Agregar</button>
          </div>
          <ul class="list card">
            @for (c of list(sec.type); track c.id) {
              <li class="row">
                <app-category-badge [icon]="c.icon" [color]="c.color" />
                <span class="name">
                  {{ c.name }}
                  @if (c.syncState === 'pending') {
                    <span class="icon pend" title="Pendiente de sincronizar" aria-label="Pendiente de sincronizar">schedule</span>
                  }
                  @if (c.syncState === 'rejected') {
                    <span class="rej">{{ c.rejection?.message }}</span>
                  }
                </span>
                <button type="button" class="icon-btn" (click)="edit(c, c.type)" [attr.aria-label]="'Editar ' + c.name">
                  <span class="icon" aria-hidden="true">edit</span>
                </button>
                <button type="button" class="icon-btn del" (click)="remove(c)" [attr.aria-label]="'Eliminar ' + c.name">
                  <span class="icon" aria-hidden="true">delete</span>
                </button>
              </li>
            } @empty {
              <li><app-empty-state icon="category" text="No hay categorías todavía" /></li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: `
    .sec {
      margin-bottom: 24px;
    }
    .sec-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .list.card {
      padding: 4px 12px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }
    .row + .row {
      border-top: 1px solid var(--c-line);
    }
    .name {
      flex: 1;
      font-weight: 600;
      display: flex;
      flex-direction: column;
    }
    .pend {
      font-size: 16px;
      color: var(--c-muted);
    }
    .rej {
      color: var(--c-expense);
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .del {
      color: var(--c-expense);
    }
  `,
})
export class CategoriesPage {
  private readonly repo = inject(CategoryRepo);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(Toast);
  private readonly sync = inject(SyncService);

  protected readonly sections: { type: TxType; title: string }[] = [
    { type: 'expense', title: 'Categorías de gasto' },
    { type: 'income', title: 'Fuentes de ingreso' },
  ];

  protected list(type: TxType): Category[] {
    return this.repo.ofType(type);
  }

  protected async edit(category: Category | undefined, type: TxType): Promise<void> {
    const usage = category ? await this.repo.usage(category.id) : null;
    const data: CategoryDialogData = { category, type, lockType: !!usage && usage.total > 0 };
    const ref = this.dialog.open<CategoryDialog, CategoryDialogData, boolean>(CategoryDialog, {
      data,
      width: '460px',
      maxWidth: '94vw',
    });
    if (await firstValueFrom(ref.afterClosed())) {
      this.toast.show(category ? 'Categoría actualizada' : 'Categoría creada');
      void this.sync.sync();
    }
  }

  protected async remove(c: Category): Promise<void> {
    if (isLastOfType(c, this.repo.active())) {
      this.toast.show(
        c.type === 'income'
          ? 'Debes tener al menos una categoría de ingreso'
          : 'Debes tener al menos una categoría de gasto',
      );
      return;
    }
    const usage = await this.repo.usage(c.id);
    if (usage.total === 0) {
      const r = await this.dialogs.confirm({
        title: `¿Eliminar «${c.name}»?`,
        message: 'Esta categoría no tiene movimientos.',
        confirmText: 'Eliminar',
        danger: true,
      });
      if (r !== 'confirm') return;
      await this.repo.remove(c.id, null);
    } else {
      const candidates = this.repo.ofType(c.type).filter((x) => x.id !== c.id);
      const ref = this.dialog.open<ReassignDialog, ReassignData, string>(ReassignDialog, {
        data: { category: c, candidates, count: usage.total },
        width: '440px',
        maxWidth: '94vw',
      });
      const target = await firstValueFrom(ref.afterClosed());
      if (!target) return;
      await this.repo.remove(c.id, target);
    }
    this.toast.show('Categoría eliminada');
    void this.sync.sync();
  }
}
