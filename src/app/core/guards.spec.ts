import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { authMatch, guestGuard } from './guards';

describe('Seguridad y Rutas: Guards (Unit Tests)', () => {
  const setupTest = (isAuthenticated: boolean) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => isAuthenticated,
          },
        },
        {
          provide: Router,
          useValue: {
            createUrlTree: (commands: string[]) => ({ commands } as unknown as UrlTree),
          },
        },
      ],
    });
  };

  describe('authMatch', () => {
    it('permite cargar rutas protegidas cuando el usuario está autenticado', () => {
      setupTest(true);
      const canMatch = TestBed.runInInjectionContext(() => authMatch({} as never, [], {} as never));
      expect(canMatch).toBe(true);
    });

    it('bloquea rutas protegidas cuando el usuario NO está autenticado', () => {
      setupTest(false);
      const canMatch = TestBed.runInInjectionContext(() => authMatch({} as never, [], {} as never));
      expect(canMatch).toBe(false);
    });
  });

  describe('guestGuard', () => {
    it('permite acceder a pantallas de login/registro si es usuario anónimo', () => {
      setupTest(false);
      const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(result).toBe(true);
    });

    it('redirige a la raíz (/) si el usuario ya tiene sesión iniciada', () => {
      setupTest(true);
      const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(result).toMatchObject({ commands: ['/'] });
    });
  });
});
