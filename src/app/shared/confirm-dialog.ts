import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  /** Tercera acción opcional (por ejemplo, "Sincronizar primero"). */
  altText?: string;
  danger?: boolean;
}

export type ConfirmResult = 'confirm' | 'alt' | 'cancel';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="msg">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button class="btn ghost" [mat-dialog-close]="'cancel'">{{ data.cancelText ?? 'Cancelar' }}</button>
      @if (data.altText) {
        <button class="btn soft" [mat-dialog-close]="'alt'">{{ data.altText }}</button>
      }
      <button class="btn" [class.danger]="data.danger" [mat-dialog-close]="'confirm'" cdkFocusInitial>
        {{ data.confirmText }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .msg {
      color: var(--c-muted);
    }
    mat-dialog-actions {
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 24px 20px;
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly dialog = inject(MatDialog);

  async confirm(data: ConfirmData): Promise<ConfirmResult> {
    const ref = this.dialog.open<ConfirmDialog, ConfirmData, ConfirmResult>(ConfirmDialog, {
      data,
      width: '420px',
      maxWidth: '92vw',
    });
    return (await firstValueFrom(ref.afterClosed())) ?? 'cancel';
  }
}
