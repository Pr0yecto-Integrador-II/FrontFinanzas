import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SyncService } from '../core/sync.service';
import { RuleRepo } from '../features/recurrentes/data/rule.repo';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly sync = inject(SyncService);
  private readonly rules = inject(RuleRepo);

  protected readonly email = computed(() => this.auth.account()?.email ?? '');

  protected readonly main: NavItem[] = [
    { path: '/', label: 'Inicio', icon: 'home', exact: true },
    { path: '/movimientos', label: 'Movimientos', icon: 'receipt_long' },
    { path: '/presupuestos', label: 'Presupuestos', icon: 'donut_small' },
    { path: '/graficos', label: 'Gráficos', icon: 'bar_chart' },
    { path: '/recurrentes', label: 'Recurrentes', icon: 'event_repeat' },
    { path: '/categorias', label: 'Categorías', icon: 'category' },
    { path: '/ajustes', label: 'Ajustes', icon: 'settings' },
  ];

  protected readonly status = computed(() => {
    if (this.sync.offline()) return { text: 'Sin conexión', tone: 'off', icon: 'cloud_off' };
    const n = this.sync.pendingCount();
    if (this.sync.status() === 'syncing') return { text: 'Sincronizando…', tone: 'busy', icon: 'sync' };
    if (this.sync.rejectedCount()) {
      return { text: 'Hay cambios rechazados', tone: 'warn', icon: 'error' };
    }
    if (n) return { text: `${n} por sincronizar`, tone: 'busy', icon: 'schedule' };
    if (this.sync.status() === 'error') return { text: 'No se pudo sincronizar', tone: 'warn', icon: 'sync_problem' };
    return { text: 'Todo al día', tone: 'ok', icon: 'cloud_done' };
  });

  ngOnInit(): void {
    this.sync.start();
    void this.rules.generateDue();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.rules.generateDue();
    });
  }
}
