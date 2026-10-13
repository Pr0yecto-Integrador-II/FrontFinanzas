import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, ApiError } from '../../../core/api';
import { SyncService } from '../../../core/sync.service';
import { errorOf, msgValidator } from '../../../shared/forms';
import { emailError, normalizeEmail } from '../domain/rules';

@Component({
  selector: 'app-forgot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
    <div class="panel">
      <header>
        <h1>Recupera tu contraseña</h1>
        <p>Escribe tu correo y te enviamos un enlace para crear una nueva.</p>
      </header>

      @if (sent()) {
        <div class="banner info" role="status">
          <span class="icon" aria-hidden="true">mark_email_read</span>
          Si el correo está registrado, recibirás un enlace en unos minutos.
        </div>
        <a class="btn ghost block" routerLink="/ingresar">Volver a iniciar sesión</a>
      } @else {
        @if (sync.offline()) {
          <div class="banner warn" role="status">
            <span class="icon" aria-hidden="true">cloud_off</span>
            Necesitas internet para recuperar tu contraseña
          </div>
        }
        @if (error()) {
          <div class="banner error" role="alert">
            <span class="icon" aria-hidden="true">error</span>
            {{ error() }}
          </div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="email">Correo</label>
            <input
              id="email"
              class="input"
              type="email"
              formControlName="email"
              autocomplete="username"
              inputmode="email"
              [class.invalid]="!!err()"
            />
            @if (err(); as e) {
              <span class="error-text">{{ e }}</span>
            }
          </div>
          <button class="btn block" type="submit" [disabled]="busy() || sync.offline()">
            {{ busy() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        </form>
        <p class="foot"><a routerLink="/ingresar">Volver a iniciar sesión</a></p>
      }
    </div>
  `,
})
export class ForgotPage {
  private readonly api = inject(Api);
  protected readonly sync = inject(SyncService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({ email: ['', msgValidator(emailError)] });

  protected err(): string | null {
    return errorOf(this.form.controls.email);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.forgotPassword(normalizeEmail(this.form.getRawValue().email));
      // La respuesta es siempre la misma, exista o no la cuenta (HU03 regla 2)
      this.sent.set(true);
    } catch (e) {
      this.error.set((e as ApiError).offline ? 'No hay conexión con el servidor.' : (e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }
}
