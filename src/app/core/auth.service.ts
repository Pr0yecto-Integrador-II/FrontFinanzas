import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, ApiError, SessionResponse } from './api';
import { Db } from './db';
import { Account } from './models';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * Sesión del usuario (HU01–HU03). El access token vive solo en memoria;
 * el refresh token va en una cookie httpOnly que el navegador envía a `/auth/*`.
 * La cuenta se guarda en `meta` para abrir la app sin conexión.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly db = inject(Db);
  private readonly router = inject(Router);

  private readonly _account = signal<Account | null>(null);
  private readonly _status = signal<SessionStatus>('loading');
  private token: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  readonly account = this._account.asReadonly();
  readonly status = this._status.asReadonly();
  readonly currency = computed(() => this._account()?.currency ?? 'COP');
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');
  /** Hay cuenta local pero el servidor ya no reconoce la sesión (hay que iniciar de nuevo). */
  readonly expired = signal(false);

  get accessToken(): string | null {
    return this.token;
  }

  /** Arranque: abre con los datos locales aunque no haya internet (HU02). */
  async init(): Promise<void> {
    const local = await this.db.getAccount();
    if (local) this._account.set(local);
    try {
      const session = await this.api.refresh();
      await this.accept(session);
    } catch (e) {
      const err = e as ApiError;
      if (local && err.offline) {
        this._status.set('authenticated'); // sin conexión: se usa la sesión previa
      } else {
        if (local) this.expired.set(true);
        this._status.set('anonymous');
      }
    }
  }

  async register(email: string, password: string, confirmation: string, currency: string) {
    const session = await this.api.register({
      email,
      password,
      password_confirmation: confirmation,
      currency,
    });
    await this.switchAccount(session.user);
    await this.accept(session);
  }

  async login(email: string, password: string) {
    const session = await this.api.login({ email, password });
    await this.switchAccount(session.user);
    await this.accept(session);
  }

  /**
   * Renueva el access token. Las llamadas simultáneas comparten una sola petición:
   * dos refresh a la vez con el mismo token cerrarían la sesión (D-27).
   * Devuelve `false` si la sesión ya no es válida.
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      await this.accept(await this.api.refresh());
      return true;
    } catch (e) {
      if ((e as ApiError).offline) return this.token !== null;
      this.token = null;
      this.expired.set(true);
      this._status.set('anonymous');
      return false;
    }
  }

  /** Cierra la sesión en el servidor (si hay conexión) y borra todo lo local. */
  async logout(everywhere = false): Promise<void> {
    try {
      await this.api.logout(everywhere);
    } catch {
      // sin conexión: igualmente se borra lo local; el token vence solo
    }
    await this.clearLocal();
    await this.router.navigateByUrl('/ingresar');
  }

  async clearLocal(): Promise<void> {
    this.token = null;
    this._account.set(null);
    this.expired.set(false);
    this._status.set('anonymous');
    await this.db.wipe();
  }

  /** Deja la sesión en memoria sin tocar los datos locales (por ejemplo, tras restablecer la contraseña). */
  signOutQuietly(): void {
    this.token = null;
    this._status.set('anonymous');
  }

  /** Marca la sesión como caducada sin tocar los datos locales. */
  sessionLost(): void {
    this.token = null;
    this.expired.set(true);
    this._status.set('anonymous');
    void this.router.navigateByUrl('/ingresar');
  }

  private async accept(session: SessionResponse): Promise<void> {
    this.token = session.access_token;
    this._account.set(session.user);
    await this.db.setMeta('account', session.user);
    this.expired.set(false);
    this._status.set('authenticated');
  }

  /** Si entra otra cuenta distinta a la guardada, se descartan los datos del navegador. */
  private async switchAccount(next: Account): Promise<void> {
    const prev = await this.db.getAccount();
    if (prev && prev.id !== next.id) await this.db.wipe();
  }
}

