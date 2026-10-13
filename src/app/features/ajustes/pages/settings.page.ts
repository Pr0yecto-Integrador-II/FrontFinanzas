import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { Db } from '../../../core/db';
import { liveSignal } from '../../../core/live';
import { EntityName } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { ThemeChoice, ThemeService } from '../../../core/theme.service';
import { Dialogs } from '../../../shared/confirm-dialog';
import { Toast } from '../../../shared/toast.service';
import { currencyLabel } from '../../auth/domain/rules';

interface RejectedItem {
  entity: EntityName;
  id: string;
  label: string;
  message: string;
}

const ENTITY_LABEL: Record<EntityName, string> = {
  category: 'Categoría',
  transaction: 'Movimiento',
  recurring_rule: 'Recurrente',
  budget: 'Presupuesto',
};

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly sync = inject(SyncService);
  protected readonly themeSvc = inject(ThemeService);
  private readonly db = inject(Db);
  private readonly dialogs = inject(Dialogs);
  private readonly toast = inject(Toast);

  protected readonly themes: { key: ThemeChoice; label: string; icon: string }[] = [
    { key: 'auto', label: 'Automático', icon: 'brightness_auto' },
    { key: 'light', label: 'Claro', icon: 'light_mode' },
    { key: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  ];

  protected readonly currency = computed(() => currencyLabel(this.auth.currency()));

  protected readonly rejected = liveSignal<RejectedItem[]>(async () => {
    const out: RejectedItem[] = [];
    const [txs, cats, rules, budgets] = await Promise.all([
      this.db.transactions.where('syncState').equals('rejected').toArray(),
      this.db.categories.where('syncState').equals('rejected').toArray(),
      this.db.recurringRules.where('syncState').equals('rejected').toArray(),
      this.db.budgets.where('syncState').equals('rejected').toArray(),
    ]);
    const msg = (r?: { message: string }) => r?.message ?? 'El servidor rechazó este cambio.';
    for (const t of txs) out.push({ entity: 'transaction', id: t.id, label: `${ENTITY_LABEL.transaction}: ${t.description ?? t.occurredOn}`, message: msg(t.rejection) });
    for (const c of cats) out.push({ entity: 'category', id: c.id, label: `${ENTITY_LABEL.category}: ${c.name}`, message: msg(c.rejection) });
    for (const r of rules) out.push({ entity: 'recurring_rule', id: r.id, label: `${ENTITY_LABEL.recurring_rule}: ${r.description ?? r.startOn}`, message: msg(r.rejection) });
    for (const b of budgets) out.push({ entity: 'budget', id: b.id, label: `${ENTITY_LABEL.budget} desde ${b.effectiveFrom}`, message: msg(b.rejection) });
    return out;
  }, []);

  protected async syncNow(): Promise<void> {
    await this.sync.sync();
    this.toast.show(this.sync.status() === 'idle' ? 'Todo sincronizado' : 'No se pudo sincronizar');
  }

  protected retry(item: RejectedItem): Promise<void> {
    return this.sync.retryRejected(item.entity, item.id);
  }

  protected async discard(item: RejectedItem): Promise<void> {
    const r = await this.dialogs.confirm({
      title: '¿Descartar este cambio?',
      message: 'Vuelve a la versión del servidor, o se quita si nunca llegó a guardarse allí.',
      confirmText: 'Descartar',
      danger: true,
    });
    if (r === 'confirm') await this.sync.discardRejected(item.entity, item.id);
  }

  /** HU02 regla 5: advierte si hay cambios sin sincronizar antes de borrar los datos locales. */
  protected async logout(everywhere = false): Promise<void> {
    const pending = this.sync.pendingCount();
    if (pending > 0) {
      const r = await this.dialogs.confirm({
        title: 'Cambios sin sincronizar',
        message: `Tienes ${pending} ${pending === 1 ? 'cambio' : 'cambios'} sin sincronizar. Si cierras sesión se perderán.`,
        confirmText: 'Cerrar de todas formas',
        altText: 'Sincronizar primero',
        danger: true,
      });
      if (r === 'cancel') return;
      if (r === 'alt') {
        await this.sync.sync();
        if (this.sync.pendingCount() > 0) {
          this.toast.show('No se pudo sincronizar. Revisa tu conexión.');
        } else {
          this.toast.show('Todo sincronizado. Ya puedes cerrar sesión.');
        }
        return;
      }
    } else if (everywhere) {
      const r = await this.dialogs.confirm({
        title: '¿Cerrar sesión en todos los dispositivos?',
        message: 'Tendrás que iniciar sesión de nuevo en cada uno.',
        confirmText: 'Cerrar en todos',
        danger: true,
      });
      if (r !== 'confirm') return;
    }
    await this.auth.logout(everywhere);
  }
}
