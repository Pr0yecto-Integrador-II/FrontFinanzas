import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <section class="hero" aria-hidden="true">
      <div class="brand">
        <span class="mark"><span class="icon">account_balance_wallet</span></span>
        <span class="name">Finanzas</span>
      </div>
      <div class="pitch">
        <p class="big num">Sabe en qué se va tu dinero.</p>
        <ul>
          <li><span class="icon">bolt</span> Registra un gasto en menos de 10 segundos</li>
          <li><span class="icon">cloud_off</span> Funciona sin conexión y se sincroniza solo</li>
          <li><span class="icon">donut_small</span> Presupuestos que avisan antes de pasarte</li>
        </ul>
      </div>
    </section>
    <main id="contenido">
      <router-outlet />
    </main>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
