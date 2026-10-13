import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Category, TxType } from '../../../core/models';
import { CategoryRepo } from '../data/category.repo';
import { COLORS, ICONS, MAX_CATEGORY_NAME } from '../domain/catalog';
import { CATEGORY_ERROR_TEXT, validateCategoryName } from '../domain/rules';

export interface CategoryDialogData {
  category?: Category;
  type: TxType;
  /** El tipo no se puede cambiar si la categoría tiene usos (HU08 regla 4). */
  lockType: boolean;
}

@Component({
  selector: 'app-category-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.category ? 'Editar categoría' : 'Nueva categoría' }}</h2>
    <mat-dialog-content>
      <form class="form" (submit)="$event.preventDefault(); save()">
        <div class="seg" role="group" aria-label="Tipo de categoría">
          <button type="button" [class.on]="type() === 'expense'" [attr.aria-pressed]="type() === 'expense'" [disabled]="data.lockType" (click)="type.set('expense')">Gasto</button>
          <button type="button" [class.on]="type() === 'income'" [attr.aria-pressed]="type() === 'income'" [disabled]="data.lockType" (click)="type.set('income')">Ingreso</button>
        </div>
        @if (data.lockType) {
          <p class="hint">El tipo no se puede cambiar porque tiene movimientos, reglas o presupuestos.</p>
        }

        <div class="field">
          <label for="cname">Nombre</label>
          <input
            id="cname"
            class="input"
            [value]="name()"
            (input)="name.set($any($event.target).value); touched.set(true)"
            [attr.maxlength]="max + 10"
            autocomplete="off"
            [class.invalid]="!!error()"
          />
          @if (error(); as e) {
            <span class="error-text">{{ e }}</span>
          }
        </div>

        <div class="field">
          <span class="label">Ícono</span>
          <div class="icons" role="radiogroup" aria-label="Ícono">
            @for (i of icons; track i) {
              <button type="button" role="radio" class="ico" [class.on]="icon() === i" [attr.aria-checked]="icon() === i" [attr.aria-label]="i" (click)="icon.set(i)">
                <span class="icon" aria-hidden="true">{{ i }}</span>
              </button>
            }
          </div>
        </div>

        <div class="field">
          <span class="label">Color</span>
          <div class="colors" role="radiogroup" aria-label="Color">
            @for (c of colors; track c) {
              <button type="button" role="radio" class="sw" [class.on]="color() === c" [attr.aria-checked]="color() === c" [attr.aria-label]="c" [style.background]="c" (click)="color.set(c)">
                @if (color() === c) {
                  <span class="icon" aria-hidden="true">check</span>
                }
              </button>
            }
          </div>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button class="btn ghost" type="button" mat-dialog-close>Cancelar</button>
      <button class="btn" type="button" [disabled]="!!error() || !name().trim()" (click)="save()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 4px;
    }
    .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--c-surface-2);
      border-radius: 999px;
      padding: 4px;
      gap: 4px;
    }
    .seg button {
      min-height: 42px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      font-weight: 600;
      color: var(--c-muted);
      cursor: pointer;
    }
    .seg button.on {
      background: var(--c-surface);
      color: var(--c-ink);
      box-shadow: var(--shadow-1);
    }
    .seg button:disabled:not(.on) {
      opacity: 0.4;
    }
    .icons {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
      gap: 6px;
    }
    .ico {
      display: grid;
      place-items: center;
      height: 46px;
      border-radius: 12px;
      border: 1.5px solid var(--c-line);
      background: var(--c-surface);
      cursor: pointer;
      color: var(--c-ink);
    }
    .ico.on {
      border-color: var(--c-primary);
      background: var(--c-primary-soft);
      color: var(--c-primary);
    }
    .colors {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 8px;
    }
    .sw {
      height: 40px;
      border-radius: 50%;
      border: 3px solid transparent;
      cursor: pointer;
      color: #fff;
      display: grid;
      place-items: center;
      outline-offset: 2px;
    }
    .sw.on {
      border-color: var(--c-surface);
      box-shadow: 0 0 0 2px var(--c-ink);
    }
    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
  `,
})
export class CategoryDialog {
  protected readonly data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CategoryDialog, boolean>>(MatDialogRef);
  private readonly repo = inject(CategoryRepo);

  protected readonly icons = ICONS;
  protected readonly colors = COLORS;
  protected readonly max = MAX_CATEGORY_NAME;

  protected readonly type = signal<TxType>(this.data.category?.type ?? this.data.type);
  protected readonly name = signal(this.data.category?.name ?? '');
  protected readonly icon = signal<string>(this.data.category?.icon ?? 'more_horiz');
  protected readonly color = signal<string>(this.data.category?.color ?? COLORS[0]);
  protected readonly touched = signal(false);

  protected readonly error = computed(() => {
    if (!this.touched()) return null;
    const e = validateCategoryName(this.name(), this.type(), this.repo.active(), this.data.category?.id);
    return e ? CATEGORY_ERROR_TEXT[e](this.type()) : null;
  });

  protected async save(): Promise<void> {
    this.touched.set(true);
    if (this.error() || !this.name().trim()) return;
    const input = { name: this.name(), type: this.type(), icon: this.icon(), color: this.color() };
    if (this.data.category) {
      await this.repo.update(this.data.category.id, input);
    } else {
      await this.repo.create(input);
    }
    this.ref.close(true);
  }
}
