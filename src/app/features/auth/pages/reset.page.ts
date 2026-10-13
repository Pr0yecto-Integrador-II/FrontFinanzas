import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, ApiError } from '../../../core/api';
import { AuthService } from '../../../core/auth.service';
import { errorOf, msgValidator } from '../../../shared/forms';
import { confirmationError, passwordError } from '../domain/rules';

/** Destino del enlace del correo: `/restablecer?token=...` (HU03). */
@Component({
  selector: 'app-reset-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
      <div class="panel">
        <header>
          <h1>Crea una contraseña nueva</h1>
          <p>Al cambiarla, cerraremos tus otras sesiones.</p>
        </header>

        @if (!token()) {
          <div class="banner error" role="alert">
            <span class="icon" aria-hidden="true">link_off</span>
            Este enlace ya no es válido
          </div>
          <a class="btn block" routerLink="/recuperar">Pedir un enlace nuevo</a>
        } @else {
          @if (error()) {
            <div class="banner error" role="alert">
              <span class="icon" aria-hidden="true">error</span>
              <span>
                {{ error() }}
                @if (invalidLink()) {
                  <a routerLink="/recuperar">Pedir un enlace nuevo</a>
                }
              </span>
            </div>
          }
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label for="password">Contraseña nueva</label>
              <input
                id="password"
                class="input"
                type="password"
                formControlName="password"
                autocomplete="new-password"
                [class.invalid]="!!err('password')"
              />
              @if (err('password'); as e) {
                <span class="error-text">{{ e }}</span>
              } @else {
                <span class="hint">De 8 a 128 caracteres, con al menos una letra y un número.</span>
              }
            </div>
            <div class="field">
              <label for="confirm">Confirma la contraseña</label>
              <input
                id="confirm"
                class="input"
                type="password"
                formControlName="confirmation"
                autocomplete="new-password"
                [class.invalid]="!!err('confirmation')"
              />
              @if (err('confirmation'); as e) {
                <span class="error-text">{{ e }}</span>
              }
            </div>
            <button class="btn block" type="submit" [disabled]="busy() || form.invalid">
              {{ busy() ? 'Guardando…' : 'Guardar contraseña' }}
            </button>
          </form>
        }
      </div>
  `,
})
export class ResetPage {
  /** Llega por `withComponentInputBinding` desde `?token=`. */
  readonly token = input<string | undefined>();

  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly invalidLink = signal(false);

  protected readonly form = this.fb.group(
    { password: ['', msgValidator(passwordError)], confirmation: [''] },
    {
      validators: [
        (g) => {
          const msg = confirmationError(g.get('password')?.value ?? '', g.get('confirmation')?.value ?? '');
          g.get('confirmation')?.setErrors(msg ? { msg } : null);
          return null;
        },
      ],
    },
  );

  protected err(name: 'password' | 'confirmation'): string | null {
    return errorOf(this.form.controls[name]);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const token = this.token();
    if (this.form.invalid || this.busy() || !token) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      await this.api.resetPassword({
        token,
        password: v.password,
        password_confirmation: v.confirmation,
      });
      this.auth.signOutQuietly(); // el servidor ya cerr� todas las sesiones
      await this.router.navigateByUrl('/ingresar?reset=1');
    } catch (e) {
      const err = e as ApiError;
      this.invalidLink.set(err.code === 'InvalidResetTokenError' || /enlace/i.test(err.message));
      this.error.set(err.offline ? 'No hay conexión con el servidor.' : err.message);
    } finally {
      this.busy.set(false);
    }
  }
}

