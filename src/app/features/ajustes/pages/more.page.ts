import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Menú de "Más" en móvil: las secciones que no caben en la barra inferior. */
@Component({
  selector: 'app-more-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="page">
      <h1 class="title">Más</h1>
      <ul class="list card">
        @for (l of links; track l.path) {
          <li>
            <a class="link" [routerLink]="l.path">
              <span class="ic"><span class="icon" aria-hidden="true">{{ l.icon }}</span></span>
              <span class="tx">
                <strong>{{ l.label }}</strong>
                <span class="muted">{{ l.hint }}</span>
              </span>
              <span class="icon chev" aria-hidden="true">chevron_right</span>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .title {
      margin-bottom: 16px;
    }
    .list.card {
      padding: 4px 12px;
    }
    .link {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      color: inherit;
      text-decoration: none;
    }
    li + li .link {
      border-top: 1px solid var(--c-line);
    }
    .ic {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--c-primary-soft);
      color: var(--c-primary);
    }
    .tx {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .tx .muted {
      font-size: 0.875rem;
    }
    .chev {
      color: var(--c-muted);
    }
  `,
})
export class MorePage {
  protected readonly links = [
    { path: '/graficos', icon: 'bar_chart', label: 'Gráficos', hint: 'Cómo se reparten y evolucionan tus gastos' },
    { path: '/recurrentes', icon: 'event_repeat', label: 'Recurrentes', hint: 'Pagos e ingresos que se repiten' },
    { path: '/categorias', icon: 'category', label: 'Categorías', hint: 'Crea, edita y elimina las tuyas' },
    { path: '/ajustes', icon: 'settings', label: 'Ajustes', hint: 'Cuenta, tema, sincronización y sesión' },
    { path: '/ayuda', icon: 'menu_book', label: 'Manual de usuario', hint: 'Aprende a usar la app paso a paso' },
  ];
}
