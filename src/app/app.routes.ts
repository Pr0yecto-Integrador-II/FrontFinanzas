import { Routes } from '@angular/router';
import { authMatch, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    // La app: solo coincide con sesión iniciada
    path: '',
    canMatch: [authMatch],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Inicio · Finanzas',
        loadComponent: () => import('./features/resumen/pages/home.page').then((m) => m.HomePage),
      },
      {
        path: 'movimientos',
        title: 'Movimientos · Finanzas',
        loadComponent: () =>
          import('./features/movimientos/pages/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'movimientos/nuevo',
        title: 'Nuevo movimiento · Finanzas',
        loadComponent: () =>
          import('./features/movimientos/pages/transaction-form.page').then(
            (m) => m.TransactionFormPage,
          ),
      },
      {
        path: 'movimientos/:id',
        title: 'Movimiento · Finanzas',
        loadComponent: () =>
          import('./features/movimientos/pages/transaction-form.page').then(
            (m) => m.TransactionFormPage,
          ),
      },
      {
        path: 'categorias',
        title: 'Categorías · Finanzas',
        loadComponent: () =>
          import('./features/categorias/pages/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'recurrentes',
        title: 'Recurrentes · Finanzas',
        loadComponent: () => import('./features/recurrentes/pages/rules.page').then((m) => m.RulesPage),
      },
      {
        path: 'recurrentes/proximos',
        title: 'Próximos · Finanzas',
        loadComponent: () =>
          import('./features/recurrentes/pages/upcoming.page').then((m) => m.UpcomingPage),
      },
      {
        path: 'recurrentes/nueva',
        title: 'Nuevo recurrente · Finanzas',
        loadComponent: () =>
          import('./features/recurrentes/pages/rule-form.page').then((m) => m.RuleFormPage),
      },
      {
        path: 'recurrentes/:id',
        title: 'Recurrente · Finanzas',
        loadComponent: () =>
          import('./features/recurrentes/pages/rule-form.page').then((m) => m.RuleFormPage),
      },
      {
        path: 'presupuestos',
        title: 'Presupuestos · Finanzas',
        loadComponent: () =>
          import('./features/presupuestos/pages/budgets.page').then((m) => m.BudgetsPage),
      },
      {
        path: 'graficos',
        title: 'Gráficos · Finanzas',
        loadComponent: () => import('./features/graficos/pages/charts.page').then((m) => m.ChartsPage),
      },
      {
        path: 'mas',
        title: 'Más · Finanzas',
        loadComponent: () => import('./features/ajustes/pages/more.page').then((m) => m.MorePage),
      },
      {
        path: 'ajustes',
        title: 'Ajustes · Finanzas',
        loadComponent: () => import('./features/ajustes/pages/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    // Acceso: lo que ve quien no tiene sesión
    path: '',
    loadComponent: () => import('./features/auth/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'ingresar' },
      {
        path: 'ingresar',
        canActivate: [guestGuard],
        title: 'Ingresar · Finanzas',
        loadComponent: () => import('./features/auth/pages/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'registro',
        canActivate: [guestGuard],
        title: 'Crear cuenta · Finanzas',
        loadComponent: () => import('./features/auth/pages/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'recuperar',
        canActivate: [guestGuard],
        title: 'Recuperar contraseña · Finanzas',
        loadComponent: () => import('./features/auth/pages/forgot.page').then((m) => m.ForgotPage),
      },
      {
        // El enlace del correo debe funcionar también con otra sesión abierta
        path: 'restablecer',
        title: 'Nueva contraseña · Finanzas',
        loadComponent: () => import('./features/auth/pages/reset.page').then((m) => m.ResetPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
