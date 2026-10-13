import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Clock } from '../../../core/clock';
import { formatPlain, parseMoney, MAX_AMOUNT_MINOR } from '../../../core/money';
import { Frequency, RuleMode, TxType } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { Dialogs } from '../../../shared/confirm-dialog';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { RuleRepo } from '../data/rule.repo';
import { FREQUENCY_LABEL } from '../domain/recurrence';

type EndKind = 'never' | 'date' | 'count';

@Component({
  selector: 'app-rule-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="page narrow">
      <div class="top">
        <button type="button" class="icon-btn" (click)="close()" aria-label="Volver">
          <span class="icon" aria-hidden="true">arrow_back</span>
        </button>
        <h1>{{ id() ? 'Editar recurrente' : 'Nuevo recurrente' }}</h1>
      </div>

      @if (id() && existing()) {
        <div class="banner info">
          <span class="icon" aria-hidden="true">info</span>
          Los cambios afectan solo las fechas posteriores a hoy. Lo ya registrado no cambia.
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="form">
        <div class="seg" role="group" aria-label="Tipo">
          <button type="button" [class.on]="type() === 'expense'" [attr.aria-pressed]="type() === 'expense'" (click)="setType('expense')">Gasto</button>
          <button type="button" [class.on]="type() === 'income'" [attr.aria-pressed]="type() === 'income'" (click)="setType('income')">Ingreso</button>
        </div>

        <div class="field">
          <label for="amount">Monto</label>
          <input id="amount" class="input big num" formControlName="amount" inputmode="decimal" placeholder="0" [class.invalid]="attempted() && !!errors().amount" />
          @if (attempted() && errors().amount) {
            <span class="error-text">{{ errors().amount }}</span>
          }
          @if (mode() === 'confirm') {
            <span class="hint">Es un estimado: podrás ajustarlo al confirmar.</span>
          }
        </div>

        <div class="field">
          <label for="cat">{{ type() === 'income' ? 'Fuente' : 'Categoría' }}</label>
          <select id="cat" class="select" [value]="categoryId() ?? ''" (change)="categoryId.set($any($event.target).value)" [class.invalid]="attempted() && !!errors().category">
            @for (c of categories(); track c.id) {
              <option [value]="c.id" [selected]="c.id === categoryId()">{{ c.name }}</option>
            }
          </select>
          @if (attempted() && errors().category) {
            <span class="error-text">{{ errors().category }}</span>
          }
        </div>

        <div class="field">
          <label for="description">Descripción <span class="muted">(opcional)</span></label>
          <input id="description" class="input" formControlName="description" maxlength="100" placeholder="Ej. Arriendo" />
        </div>

        <div class="field">
          <span class="label">Frecuencia</span>
          <div class="chips" role="radiogroup" aria-label="Frecuencia">
            @for (f of frequencies; track f.key) {
              <button type="button" role="radio" class="chip" [attr.aria-checked]="frequency() === f.key" [attr.aria-pressed]="frequency() === f.key" (click)="frequency.set(f.key)">
                {{ f.label }}
              </button>
            }
          </div>
          <span class="hint">{{ frequencyHint() }}</span>
        </div>

        <div class="field">
          <label for="start">Fecha de inicio</label>
          <input id="start" class="input" type="date" formControlName="startOn" />
          <span class="hint">Puede ser pasada: se registrarán las fechas que ya pasaron.</span>
          @if (attempted() && errors().start) {
            <span class="error-text">{{ errors().start }}</span>
          }
        </div>

        <div class="field">
          <span class="label">Termina</span>
          <div class="chips" role="radiogroup" aria-label="Fin">
            <button type="button" role="radio" class="chip" [attr.aria-checked]="endKind() === 'never'" [attr.aria-pressed]="endKind() === 'never'" (click)="endKind.set('never')">Nunca</button>
            <button type="button" role="radio" class="chip" [attr.aria-checked]="endKind() === 'date'" [attr.aria-pressed]="endKind() === 'date'" (click)="endKind.set('date')">En una fecha</button>
            <button type="button" role="radio" class="chip" [attr.aria-checked]="endKind() === 'count'" [attr.aria-pressed]="endKind() === 'count'" (click)="endKind.set('count')">Tras N veces</button>
          </div>
          @if (endKind() === 'date') {
            <input class="input" type="date" formControlName="endOn" aria-label="Fecha de fin" />
          }
          @if (endKind() === 'count') {
            <input class="input" type="number" min="1" max="100000" formControlName="count" aria-label="Número de repeticiones" />
          }
          @if (attempted() && errors().end) {
            <span class="error-text">{{ errors().end }}</span>
          }
        </div>

        <div class="field">
          <span class="label">Cómo se registra</span>
          <div class="modes" role="radiogroup" aria-label="Modo">
            <button type="button" role="radio" class="mode" [class.on]="mode() === 'auto'" [attr.aria-checked]="mode() === 'auto'" (click)="mode.set('auto')">
              <span class="icon" aria-hidden="true">bolt</span>
              <strong>Automático</strong>
              <span class="muted">En su fecha se registra solo.</span>
            </button>
            <button type="button" role="radio" class="mode" [class.on]="mode() === 'confirm'" [attr.aria-checked]="mode() === 'confirm'" (click)="mode.set('confirm')">
              <span class="icon" aria-hidden="true">task_alt</span>
              <strong>Con confirmación</strong>
              <span class="muted">Te pide confirmar el monto (ideal para facturas).</span>
            </button>
          </div>
        </div>

        <div class="actions">
          @if (existing()) {
            <button type="button" class="btn ghost danger-text" (click)="remove()">Eliminar</button>
          }
          <button type="submit" class="btn grow" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .narrow {
      max-width: 640px;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .top h1 {
      font-size: 1.35rem;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .banner {
      margin-bottom: 12px;
    }
    .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--c-surface-2);
      border-radius: 999px;
      padding: 4px;
      gap: 4px;
    }
    .seg button {
      min-height: 44px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      font-weight: 600;
      color: var(--c-muted);
      cursor: pointer;
    }
    .seg button.on {
      background: var(--c-surface);
      color: var(--c-ink);
      box-shadow: var(--shadow-1);
    }
    .big {
      font-size: 1.6rem;
      font-weight: 700;
      min-height: 60px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .modes {
      display: grid;
      gap: 8px;
    }
    .mode {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 12px;
      row-gap: 2px;
      text-align: left;
      padding: 14px;
      border-radius: 16px;
      border: 1.5px solid var(--c-line);
      background: var(--c-surface);
      cursor: pointer;
    }
    .mode .icon {
      grid-row: span 2;
      color: var(--c-primary);
      align-self: center;
    }
    .mode.on {
      border-color: var(--c-primary);
      background: var(--c-primary-soft);
    }
    .actions {
      display: flex;
      gap: 10px;
      padding: 8px 0;
    }
    .grow {
      flex: 1;
    }
    .danger-text {
      color: var(--c-expense);
    }
    @media (min-width: 600px) {
      .modes {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class RuleFormPage {
  readonly id = input<string | undefined>();
  /** `?desde=<id de movimiento>`: "Repetir este movimiento" (HU09). */
  readonly desde = input<string | undefined>();

  private readonly repo = inject(RuleRepo);
  private readonly txs = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly clock = inject(Clock);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(Toast);
  private readonly dialogs = inject(Dialogs);
  private readonly sync = inject(SyncService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly frequencies = (Object.keys(FREQUENCY_LABEL) as Frequency[]).map((key) => ({
    key,
    label: FREQUENCY_LABEL[key],
  }));

  protected readonly form = this.fb.group({
    amount: [''],
    description: [''],
    startOn: [this.clock.today()],
    endOn: [''],
    count: [12],
  });

  protected readonly type = signal<TxType>('expense');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly frequency = signal<Frequency>('monthly');
  protected readonly mode = signal<RuleMode>('auto');
  protected readonly endKind = signal<EndKind>('never');
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly existing = signal<Awaited<ReturnType<RuleRepo['get']>> | null>(null);

  private readonly amountText = signal('');
  private readonly startValue = signal(this.clock.today());
  private readonly endValue = signal('');
  private readonly countValue = signal(12);

  protected readonly categories = computed(() => this.cats.ofType(this.type()));
  protected readonly errors = computed(() => {
    const e: { amount?: string; category?: string; start?: string; end?: string } = {};
    const amount = parseMoney(this.amountText());
    if (amount === null || amount <= 0) e.amount = 'Ingresa un monto mayor que 0';
    else if (amount > MAX_AMOUNT_MINOR) e.amount = 'El monto es demasiado grande';
    if (!this.categoryId()) e.category = 'Elige una categoría';
    if (!this.startValue()) e.start = 'Elige la fecha de inicio';
    if (this.endKind() === 'date') {
      if (!this.endValue()) e.end = 'Elige la fecha de fin';
      else if (this.startValue() && this.endValue() < this.startValue()) {
        e.end = 'La fecha de fin no puede ser anterior al inicio';
      }
    }
    if (this.endKind() === 'count') {
      const n = this.countValue();
      if (!Number.isInteger(n) || n < 1 || n > 100000) e.end = 'Usa un número entre 1 y 100.000';
    }
    return e;
  });

  protected readonly frequencyHint = computed(() => {
    switch (this.frequency()) {
      case 'weekly':
        return 'El mismo día de la semana que la fecha de inicio.';
      case 'biweekly':
        return 'Los días 15 y último de cada mes.';
      case 'monthly':
        return 'El mismo día del mes. Si no existe (31 en abril), se usa el último día.';
      case 'yearly':
        return 'La misma fecha cada año. El 29 de febrero pasa al 28 en años no bisiestos.';
      default:
        return 'Todos los días.';
    }
  });

  constructor() {
    this.form.controls.amount.valueChanges.subscribe((v) => this.amountText.set(v));
    this.form.controls.startOn.valueChanges.subscribe((v) => this.startValue.set(v));
    this.form.controls.endOn.valueChanges.subscribe((v) => this.endValue.set(v));
    this.form.controls.count.valueChanges.subscribe((v) => this.countValue.set(Number(v)));

    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
    effect(() => {
      const from = this.desde();
      if (from) void this.prefill(from);
    });
    effect(() => {
      const list = this.categories();
      untracked(() => {
        const cur = this.categoryId();
        if (!cur || !list.some((c) => c.id === cur)) this.categoryId.set(list[0]?.id ?? null);
      });
    });
  }

  private async load(id: string): Promise<void> {
    const r = await this.repo.get(id);
    if (!r || r.deletedAt) {
      void this.router.navigateByUrl('/recurrentes');
      return;
    }
    this.existing.set(r);
    this.type.set(r.type);
    this.categoryId.set(r.categoryId);
    this.frequency.set(r.frequency);
    this.mode.set(r.mode);
    this.endKind.set(r.endOn ? 'date' : r.maxOccurrences ? 'count' : 'never');
    this.form.setValue({
      amount: formatPlain(r.amountMinor),
      description: r.description ?? '',
      startOn: r.startOn,
      endOn: r.endOn ?? '',
      count: r.maxOccurrences ?? 12,
    });
  }

  private async prefill(txId: string): Promise<void> {
    const t = await this.txs.get(txId);
    if (!t) return;
    this.type.set(t.type);
    this.categoryId.set(t.categoryId);
    this.form.patchValue({
      amount: formatPlain(t.amountMinor),
      description: t.description ?? '',
      startOn: t.occurredOn,
    });
  }

  protected setType(t: TxType): void {
    if (this.type() === t) return;
    this.type.set(t);
    this.categoryId.set(null);
  }

  protected async save(): Promise<void> {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length || this.saving()) return;
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.save({
        id: this.existing()?.id,
        type: this.type(),
        amountMinor: parseMoney(v.amount) as number,
        categoryId: this.categoryId() as string,
        description: v.description,
        frequency: this.frequency(),
        startOn: v.startOn,
        endOn: this.endKind() === 'date' ? v.endOn : null,
        maxOccurrences: this.endKind() === 'count' ? Number(v.count) : null,
        mode: this.mode(),
      });
      await this.repo.generateDue(); // si empieza hoy o antes, se registra de inmediato
      this.toast.show(this.existing() ? 'Regla actualizada' : 'Regla creada');
      void this.sync.sync();
      this.close();
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const rule = this.existing();
    if (!rule) return;
    const r = await this.dialogs.confirm({
      title: '¿Eliminar esta regla?',
      message: 'Deja de generar movimientos. Los ya registrados se conservan y los pendientes por confirmar se eliminan.',
      confirmText: 'Eliminar regla',
      danger: true,
    });
    if (r !== 'confirm') return;
    await this.repo.remove(rule);
    this.toast.show('Regla eliminada');
    void this.sync.sync();
    void this.router.navigateByUrl('/recurrentes');
  }

  protected close(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/recurrentes');
  }
}
