import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * La app solo existe para quien tiene sesión (o la tuvo y abre sin conexión).
 * Con `canMatch`, quien no la tiene cae en las rutas de acceso en vez de ver una pantalla vacía.
 */
export const authMatch: CanMatchFn = () => inject(AuthService).isAuthenticated();

/** Las pantallas de acceso no se muestran a quien ya inició sesión. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;
};
