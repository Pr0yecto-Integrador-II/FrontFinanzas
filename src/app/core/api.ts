import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Account, EntityName } from './models';

export interface SessionResponse {
  access_token: string;
  user: Account;
}

export interface PushChange {
  entity: EntityName;
  op: 'upsert' | 'delete';
  id: string;
  data: Record<string, unknown>;
}

export interface PushResponse {
  applied: string[];
  rejected: { id: string; code: string; message: string }[];
  version: number;
}

export interface PullChange {
  entity: EntityName;
  id: string;
  version: number;
  data: Record<string, unknown>;
  deleted: boolean;
}

export interface PullResponse {
  changes: PullChange[];
  next_since: number;
  has_more: boolean;
}

/** Error normalizado de la API. `status` 0 = sin conexión con el servidor. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  get offline(): boolean {
    return this.status === 0;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) {
      return new ApiError(0, 'Offline', 'No se pudo conectar con el servidor.');
    }
    const body = e.error as { code?: string; message?: string; detail?: unknown } | null;
    if (body?.code && body.message) return new ApiError(e.status, body.code, body.message);
    if (e.status === 422) return new ApiError(422, 'ValidationError', 'Revisa los datos ingresados.');
    if (e.status === 429) {
      return new ApiError(429, 'TooManyRequestsError', 'Demasiados intentos. Intenta de nuevo en 15 minutos');
    }
    return new ApiError(e.status, 'ServerError', 'Algo salió mal. Intenta de nuevo.');
  }
  return new ApiError(-1, 'Unknown', 'Algo salió mal. Intenta de nuevo.');
}

/** Cliente de la API del backend (BLUEPRINT 6.4). Solo transporte: sin lógica de negocio. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private async call<T>(req: Promise<T>): Promise<T> {
    try {
      return await req;
    } catch (e) {
      throw toApiError(e);
    }
  }

  register(body: {
    email: string;
    password: string;
    password_confirmation: string;
    currency: string;
  }): Promise<SessionResponse> {
    return this.call(
      firstValueFrom(
        this.http.post<SessionResponse>(`${this.base}/auth/register`, body, { withCredentials: true }),
      ),
    );
  }

  login(body: { email: string; password: string }): Promise<SessionResponse> {
    return this.call(
      firstValueFrom(
        this.http.post<SessionResponse>(`${this.base}/auth/login`, body, { withCredentials: true }),
      ),
    );
  }

  refresh(): Promise<SessionResponse> {
    return this.call(
      firstValueFrom(
        this.http.post<SessionResponse>(`${this.base}/auth/refresh`, null, { withCredentials: true }),
      ),
    );
  }

  logout(all = false): Promise<void> {
    return this.call(
      firstValueFrom(
        this.http.post<void>(`${this.base}/auth/logout${all ? '?all=true' : ''}`, null, {
          withCredentials: true,
        }),
      ),
    );
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    return this.call(
      firstValueFrom(this.http.post<{ message: string }>(`${this.base}/auth/password/forgot`, { email })),
    );
  }

  resetPassword(body: {
    token: string;
    password: string;
    password_confirmation: string;
  }): Promise<{ message: string }> {
    return this.call(
      firstValueFrom(this.http.post<{ message: string }>(`${this.base}/auth/password/reset`, body)),
    );
  }

  me(): Promise<Account> {
    return this.call(firstValueFrom(this.http.get<Account>(`${this.base}/me`)));
  }

  push(changes: PushChange[]): Promise<PushResponse> {
    return this.call(firstValueFrom(this.http.post<PushResponse>(`${this.base}/sync/push`, { changes })));
  }

  pull(since: number, limit = 500): Promise<PullResponse> {
    return this.call(
      firstValueFrom(
        this.http.get<PullResponse>(`${this.base}/sync/pull`, { params: { since, limit } }),
      ),
    );
  }
}
