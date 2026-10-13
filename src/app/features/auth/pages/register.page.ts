import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api';
import { AuthService } from '../../../core/auth.service';
import { SyncService } from '../../../core/sync.service';
import { errorOf, msgValidator } from '../../../shared/forms';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  confirmationError,
  currencyLabel,
  emailError,
  normalizeEmail,
  passwordError,
} from '../domain/rules';

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './auth.scss',
  template: `
    <div class="panel">
      <header>
        <h1>Crea tu cuenta</h1>
        <p>Un solo formulario y empiezas a registrar.</p>
      </header>

      @if (sync.offline()) {
        <div class="banner warn" role="status">
          <span class="icon" aria-hidden="true">cloud_off</span>
          Necesitas internet para crear tu cuenta
        </div>
      }
      @if (error()) {
        <div class="banner error" role="alert">
          <span class="icon" aria-hidden="true">error</span>
          <span>
            {{ error() }}
            @if (emailTaken()) {
              <a routerLink="/ingresar">Iniciar sesión</a>
            }
          </span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset [disabled]="sync.offline()">
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
            <input
              id="password"
              class="input"
              [type]="show() ? 'text' : 'password'"
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
              [type]="show() ? 'text' : 'password'"
              formControlName="confirmation"
              autocomplete="new-password"
              [class.invalid]="!!err('confirmation')"
            />
            @if (err('confirmation'); as e) {
              <span class="error-text">{{ e }}</span>
            }
          </div>

          <label class="check">
            <input type="checkbox" [checked]="show()" (change)="show.set(!show())" />
            Mostrar contraseñas
          </label>

          <div class="field">
            <label for="currency">Moneda</label>
            <select id="currency" class="select" formControlName="currency">
              @for (c of currencies; track c) {
                <option [value]="c">{{ label(c) }}</option>
              }
            </select>
            <span class="hint">No se puede cambiar después.</span>
          </div>
        </fieldset>

        <button class="btn block" type="submit" [disabled]="busy() || sync.offline() || form.invalid">
          {{ busy() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
      </form>

      <p class="foot">¿Ya tienes cuenta? <a routerLink="/ingresar">Inicia sesión</a></p>
    </div>
  `,
  styles: `
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9375rem;
      color: var(--c-muted);
      min-height: 32px;
    }
    .check input {
      width: 20px;
      height: 20px;
      accent-color: var(--c-primary);
    }
  `,
})
export class RegisterPage {
  protected readonly auth = inject(AuthService);
  protected readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly currencies = CURRENCIES;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly emailTaken = signal(false);
  protected readonly show = signal(false);

  protected readonly form = this.fb.group(
    {
      email: ['', msgValidator(emailError)],
      password: ['', msgValidator(passwordError)],
      confirmation: [''],
      currency: [DEFAULT_CURRENCY],
    },
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

  protected label(code: string): string {
    return currencyLabel(code);
  }

  protected err(name: 'email' | 'password' | 'confirmation'): string | null {
    return errorOf(this.form.controls[name]);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return; // doble clic: una sola solicitud
    this.busy.set(true);
    this.error.set(null);
    this.emailTaken.set(false);
    try {
      const v = this.form.getRawValue();
      await this.auth.register(normalizeEmail(v.email), v.password, v.confirmation, v.currency);
      await this.router.navigateByUrl('/');
    } catch (e) {
      const err = e as ApiError;
      this.emailTaken.set(err.code === 'EmailAlreadyRegisteredError');
      this.error.set(
        err.offline
          ? 'Necesitas internet para crear tu cuenta'
          : err.status >= 500 || err.status < 0
            ? 'Algo salió mal. Intenta de nuevo.'
            : err.message,
      );
      // El formulario conserva lo escrito, salvo las contraseñas
      this.form.patchValue({ password: '', confirmation: '' });
    } finally {
      this.busy.set(false);
    }
  }
}
