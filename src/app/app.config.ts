import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideEchartsCore } from 'ngx-echarts';
import { Clock, SystemClock } from './core/clock';
import { AuthService } from './core/auth.service';
import { authInterceptor } from './core/auth.interceptor';
import { SyncService } from './core/sync.service';
import { ThemeService } from './core/theme.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    { provide: Clock, useExisting: SystemClock },
    provideAppInitializer(() => {
      inject(ThemeService);
      inject(SyncService).start();
      return inject(AuthService).init();
    }),
    provideEchartsCore({ echarts: () => import('./features/graficos/echarts-setup') }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
