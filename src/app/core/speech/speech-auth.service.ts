import { Injectable, inject } from '@angular/core';
import { Api, ApiError } from '../api';
import { AuthService } from '../auth.service';
import { Clock } from '../clock';
import { SyncService } from '../sync.service';
import { SpeechError } from './speech-errors';
import { SpeechCredentials } from './speech-engine';

/** Se renueva cuando quedan menos de 60 s de vigencia (HU16 regla 5). */
export const RENEW_BEFORE_MS = 60_000;

interface CachedToken extends SpeechCredentials {
  expiresAt: number;
  /** Cuenta para la que se emitió: otra sesión nunca lo reutiliza. */
  owner: string | null;
}

/**
 * Autorización temporal de Azure AI Speech (HU16).
 * El token vive solo en memoria (nunca en localStorage ni IndexedDB) y las llamadas
 * simultáneas comparten una sola petición para no gastar la cuota de 30 por hora.
 */
@Injectable({ providedIn: 'root' })
export class SpeechAuthService {
  private readonly api = inject(Api);
  private readonly sync = inject(SyncService);
  private readonly clock = inject(Clock);
  private readonly session = inject(AuthService);

  private cached: CachedToken | null = null;
  private inflight: Promise<SpeechCredentials> | null = null;

  /** Token vigente o uno nuevo. Sin conexión no llama a la API. */
  credentials(): Promise<SpeechCredentials> {
    if (!this.sync.online()) return Promise.reject(new SpeechError('offline'));
    const now = this.clock.now().getTime();
    const c = this.cached;
    if (c && c.owner === this.owner() && c.expiresAt - now > RENEW_BEFORE_MS) {
      return Promise.resolve({ token: c.token, region: c.region });
    }
    this.inflight ??= this.fetch().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Olvida el token (p. ej. al cerrar sesión). */
  clear(): void {
    this.cached = null;
  }

  private owner(): string | null {
    return this.session.account()?.id ?? null;
  }

  private async fetch(): Promise<SpeechCredentials> {
    const owner = this.owner();
    try {
      const res = await this.api.speechToken();
      this.cached = {
        token: res.token,
        region: res.region,
        expiresAt: this.clock.now().getTime() + res.expires_in_seconds * 1000,
        owner,
      };
      return { token: res.token, region: res.region };
    } catch (e) {
      const err = e as ApiError;
      if (err.offline) throw new SpeechError('offline');
      if (err.status === 429) throw new SpeechError('rate_limited');
      throw new SpeechError('unavailable');
    }
  }
}
