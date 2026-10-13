import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api';
import { AuthService } from '../../../core/auth.service';
import { SyncService } from '../../../core/sync.service';
import { errorOf, msgValidator } from '../../../shared/forms';
import { emailError, normalizeEmail } from '../domain/rules';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
    <div class="panel">
      <header>
        <h1>Inicia sesión</h1>
        <p>Entra para ver tus finanzas.</p>
      </header>

      @if (reset()) {
        <div class="banner info" role="status">
          <span class="icon" aria-hidden="true">check_circle</span>
          Contrase�a actualizada. Inicia sesi�n con la nueva.
        </div>
      }
      @if (auth.expired()) {
        <div class="banner warn" role="alert">
          <span class="icon" aria-hidden="true">lock_clock</span>
          Tu sesión venció. Inicia sesión de nuevo: tus datos de este equipo siguen aquí.
        </div>
      }
      @if (sync.offline()) {
        <div class="banner info" role="status">
          <span class="icon" aria-hidden="true">cloud_off</span>
          El primer inicio de sesión en cada dispositivo necesita internet.
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
            [class.invalid]="!!err('email')"
          />
          @if (err('email'); as e) {
            <span class="error-text">{{ e }}</span>
          }
        </div>

        <div class="field">
          <label for="password">Contraseña</label>
          <div class="pw">
            <input
              id="password"
              class="input"
              [type]="show() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              [class.invalid]="!!err('password')"
            />
            <button
              type="button"
              class="icon-btn toggle"
              (click)="show.set(!show())"
              [attr.aria-label]="show() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            >
              <span class="icon" aria-hidden="true">{{ show() ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
          @if (err('password'); as e) {
            <span class="error-text">{{ e }}</span>
          }
        </div>

        <button class="btn block" type="submit" [disabled]="busy() || sync.offline()">
          {{ busy() ? 'Entrando…' : 'Iniciar sesión' }}
        </button>
      </form>

      <div class="row-links">
        <a routerLink="/recuperar">Olvidé mi contraseña</a>
        <a routerLink="/registro">Crear cuenta</a>
      </div>
    </div>
  `,
})
export class LoginPage {
  /** ?reset=1 llega tras restablecer la contrase�a. */
  readonly reset = input<string | undefined>();

  protected readonly auth = inject(AuthService);
  protected readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly show = signal(false);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    email: ['', msgValidator(emailError)],
    password: ['', Validators.required],
  });

  protected err(name: 'email' | 'password'): string | null {
    const c = this.form.controls[name];
    if (name === 'password' && c.hasError('required')) {
      return c.touched || this.submitted() ? 'Escribe tu contraseña' : null;
    }
    return errorOf(c, this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(normalizeEmail(email), password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      const err = e as ApiError;
      this.error.set(
        err.status === 401
          ? 'Correo o contraseña incorrectos'
          : err.offline
            ? 'No hay conexión con el servidor. Intenta de nuevo.'
            : err.message,
      );
      this.form.controls.password.reset('');
    } finally {
      this.busy.set(false);
    }
  }
}

