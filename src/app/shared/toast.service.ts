import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Avisos breves. "Deshacer" dura 5 segundos (HU07). */
@Injectable({ providedIn: 'root' })
export class Toast {
  private readonly bar = inject(MatSnackBar);

  show(message: string): void {
    this.bar.open(message, undefined, { duration: 3000, horizontalPosition: 'center' });
  }

  undo(message: string, onUndo: () => void): void {
    const ref = this.bar.open(message, 'Deshacer', { duration: 5000, horizontalPosition: 'center' });
    ref.onAction().subscribe(onUndo);
  }

  alert(message: string): void {
    this.bar.open(message, 'Entendido', {
      duration: 8000,
      horizontalPosition: 'center',
      panelClass: 'alert-snack',
    });
  }
}
