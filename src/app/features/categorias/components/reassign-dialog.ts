import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Category } from '../../../core/models';
import { CategoryBadge } from '../../../shared/category-badge';

export interface ReassignData {
  category: Category;
  candidates: Category[];
  count: number;
}

/** HU08 regla 5: eliminar una categoría con uso obliga a elegir a cuál pasan sus datos. */
@Component({
  selector: 'app-reassign-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, CategoryBadge],
  template: `
    <h2 mat-dialog-title>Eliminar «{{ data.category.name }}»</h2>
    <mat-dialog-content>
      <p class="msg">
        Tiene {{ data.count }} {{ data.count === 1 ? 'elemento' : 'elementos' }} (movimientos, recurrentes o
        presupuestos). Elige a qué categoría de {{ data.category.type === 'expense' ? 'gasto' : 'ingreso' }}
        pasarán.
      </p>
      <ul class="list opts" role="radiogroup" aria-label="Categoría destino">
        @for (c of data.candidates; track c.id) {
          <li>
            <button type="button" role="radio" class="opt" [class.on]="target() === c.id" [attr.aria-checked]="target() === c.id" (click)="target.set(c.id)">
              <app-category-badge [icon]="c.icon" [color]="c.color" style="--size: 36px" />
              <span>{{ c.name }}</span>
              @if (target() === c.id) {
                <span class="icon check" aria-hidden="true">check_circle</span>
              }
            </button>
          </li>
        }
      </ul>
      <p class="hint">Si las dos categorías tenían presupuesto, se conserva el de la categoría destino.</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button class="btn ghost" type="button" mat-dialog-close>Cancelar</button>
      <button class="btn danger" type="button" [disabled]="!target()" (click)="confirm()">Mover y eliminar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .msg {
      color: var(--c-muted);
      margin-bottom: 12px;
    }
    .opts {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .opt {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 8px 12px;
      border: 1.5px solid var(--c-line);
      border-radius: 14px;
      background: var(--c-surface);
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }
    .opt.on {
      border-color: var(--c-primary);
      background: var(--c-primary-soft);
    }
    .check {
      margin-left: auto;
      color: var(--c-primary);
    }
    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
  `,
})
export class ReassignDialog {
  protected readonly data = inject<ReassignData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ReassignDialog, string>>(MatDialogRef);
  protected readonly target = signal<string | null>(null);
  protected readonly hasTarget = computed(() => !!this.target());

  protected confirm(): void {
    const t = this.target();
    if (t) this.ref.close(t);
  }
}
