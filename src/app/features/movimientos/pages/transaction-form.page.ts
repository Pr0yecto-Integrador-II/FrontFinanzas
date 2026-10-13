import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { Clock } from '../../../core/clock';
import { addDays, longDate } from '../../../core/dates';
import { formatPlain, parseMoney } from '../../../core/money';
import { Transaction, TxType } from '../../../core/models';
import { SyncService } from '../../../core/sync.service';
import { Dialogs } from '../../../shared/confirm-dialog';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { DEFAULT_EXPENSE_NAME } from '../../categorias/domain/catalog';
import { BudgetRepo } from '../../presupuestos/data/budget.repo';
import { RuleRepo } from '../../recurrentes/data/rule.repo';
import { TransactionRepo } from '../data/transaction.repo';
import {
  MAX_DESCRIPTION,
  MAX_NOTE,
  MAX_TAGS,
  TAG_ERROR_TEXT,
  addTag,
  hasErrors,
  validateTx,
} from '../domain/rules';

@Component({
  selector: 'app-transaction-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './transaction-form.page.html',
  styleUrl: './transaction-form.page.scss',
})
export class TransactionFormPage {
  /** `:id` de la ruta; ausente al crear. */
  readonly id = input<string | undefined>();

  private readonly repo = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly rules = inject(RuleRepo);
  private readonly budgets = inject(BudgetRepo);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly clock = inject(Clock);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(Toast);
  private readonly dialogs = inject(Dialogs);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly today = this.clock.today();
  protected readonly yesterday = addDays(this.today, -1);
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly maxNote = MAX_NOTE;
  protected readonly maxTags = MAX_TAGS;
  protected readonly currencySymbol = computed(() => {
    try {
      return (
        new Intl.NumberFormat('es-CO', { style: 'currency', currency: this.auth.currency() })
          .formatToParts(0)
          .find((p) => p.type === 'currency')?.value ?? '$'
      );
    } catch {
      return '$';
    }
  });

  protected readonly form = this.fb.group({
    amount: [''],
    occurredOn: [this.today],
    description: [''],
    note: [''],
  });

  protected readonly type = signal<TxType>('expense');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly tags = signal<string[]>([]);
  protected readonly tagInput = signal('');
  protected readonly tagError = signal<string | null>(null);
  protected readonly showMore = signal(false);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly existing = signal<Transaction | null>(null);
  protected readonly missing = signal(false);

  private readonly amountText = signal('');
  private readonly dateValue = signal(this.today);
  private readonly descLength = signal(0);
  protected readonly noteLength = signal(0);
  protected readonly descCount = this.descLength.asReadonly();

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly isIncome = computed(() => this.type() === 'income');
  protected readonly categories = computed(() => this.cats.ofType(this.type()));
  protected readonly amountMinor = computed(() => parseMoney(this.amountText()));
  protected readonly errors = computed(() =>
    validateTx(
      {
        amountMinor: this.amountMinor(),
        occurredOn: this.dateValue(),
        description: this.form.controls.description.value,
        note: this.form.controls.note.value,
      },
      this.categoryId(),
      this.today,
    ),
  );
  protected readonly valid = computed(() => !hasErrors(this.errors()));
  protected readonly suggestions = computed(() => {
    const q = this.tagInput().trim().toLowerCase().replace(/^#+/, '');
    return this.repo
      .knownTags()
      .filter((t) => !this.tags().includes(t) && (!q || t.includes(q)))
      .slice(0, 6);
  });
  protected readonly title = computed(() => {
    if (this.isEdit()) return this.isIncome() ? 'Editar ingreso' : 'Editar gasto';
    return 'Nuevo movimiento';
  });
  protected readonly dateLabel = computed(() => longDate(this.dateValue()));
  protected readonly rule = computed(() => {
    const rid = this.existing()?.recurringRuleId;
    return rid ? this.rules.byId().get(rid) : undefined;
  });

  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  constructor() {
    // Al crear, el cursor ya está en el monto: "+" → escribir → "Guardar"
    afterNextRender(() => {
      if (!this.id()) this.amountInput()?.nativeElement.focus();
    });

    this.form.controls.amount.valueChanges.subscribe((v) => this.amountText.set(v));
    this.form.controls.occurredOn.valueChanges.subscribe((v) => this.dateValue.set(v));
    this.form.controls.description.valueChanges.subscribe((v) => this.descLength.set(v.length));
    this.form.controls.note.valueChanges.subscribe((v) => this.noteLength.set(v.length));

    // Carga del movimiento al editar
    effect(() => {
      const id = this.id();
      if (!id) return;
      void this.load(id);
    });

    // Preselección de categoría: la última usada de ese tipo (HU04)
    effect(() => {
      const list = this.categories();
      const type = this.type();
      untracked(() => {
        if (this.isEdit() && this.existing()) return;
        const current = this.categoryId();
        if (current && list.some((c) => c.id === current)) return;
        const last = this.repo.lastUsedCategory(type);
        const fallback =
          type === 'expense' ? list.find((c) => c.name === DEFAULT_EXPENSE_NAME) : undefined;
        const pick = list.find((c) => c.id === last) ?? fallback ?? list[0];
        this.categoryId.set(pick?.id ?? null);
      });
    });
  }

  private async load(id: string): Promise<void> {
    const t = await this.repo.get(id);
    if (!t || t.deletedAt) {
      this.missing.set(true);
      return;
    }
    this.existing.set(t);
    this.type.set(t.type);
    this.categoryId.set(t.categoryId);
    this.tags.set(t.tags);
    this.form.setValue({
      amount: formatPlain(t.amountMinor),
      occurredOn: t.occurredOn,
      description: t.description ?? '',
      note: t.note ?? '',
    });
    this.showMore.set(!!t.note || t.tags.length > 0);
  }

  protected setType(t: TxType): void {
    if (this.isEdit() || this.type() === t) return;
    this.type.set(t);
    this.categoryId.set(null);
  }

  protected pickDate(iso: string): void {
    this.form.controls.occurredOn.setValue(iso);
  }

  protected addTag(): void {
    const res = addTag(this.tags(), this.tagInput());
    if (res.error) {
      this.tagError.set(TAG_ERROR_TEXT[res.error]);
      return;
    }
    this.tagError.set(null);
    this.tags.set(res.tags);
    this.tagInput.set('');
  }

  protected useSuggestion(tag: string): void {
    const res = addTag(this.tags(), tag);
    this.tagError.set(res.error ? TAG_ERROR_TEXT[res.error] : null);
    if (!res.error) this.tags.set(res.tags);
    this.tagInput.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.update((t) => t.filter((x) => x !== tag));
    this.tagError.set(null);
  }

  protected onTagKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.addTag();
    }
  }

  protected async save(): Promise<void> {
    this.attempted.set(true);
    if (!this.valid() || this.saving()) return; // doble toque: un solo movimiento
    this.saving.set(true);
    try {
      const prev = this.existing();
      const v = this.form.getRawValue();
      const saved = await this.repo.save({
        id: prev?.id,
        type: this.type(),
        amountMinor: this.amountMinor() as number,
        categoryId: this.categoryId() as string,
        occurredOn: v.occurredOn,
        description: v.description,
        note: v.note,
        tags: this.tags(),
      });
      const catName = this.cats.byId().get(saved.categoryId)?.name ?? 'esta categoría';
      const alerts = await this.budgets.alertsAfterSave(
        saved,
        prev?.status === 'confirmed' ? prev.amountMinor : 0,
        this.auth.currency(),
        catName,
      );
      this.toast.show(prev ? 'Cambios guardados' : saved.type === 'income' ? 'Ingreso guardado' : 'Gasto guardado');
      for (const a of alerts) this.toast.alert(a);
      void this.sync.sync();
      this.close();
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const t = this.existing();
    if (!t) return;
    await this.repo.remove(t);
    this.toast.undo('Movimiento eliminado', () => void this.repo.restore(t));
    void this.sync.sync();
    this.close('/movimientos');
  }

  protected async discardRejected(): Promise<void> {
    const t = this.existing();
    if (!t) return;
    const r = await this.dialogs.confirm({
      title: '¿Descartar este cambio?',
      message: 'El movimiento vuelve a como está en el servidor, o se quita si nunca llegó a guardarse allí.',
      confirmText: 'Descartar',
      danger: true,
    });
    if (r !== 'confirm') return;
    await this.sync.discardRejected('transaction', t.id);
    this.close('/movimientos');
  }

  protected close(fallback = '/'): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl(fallback);
  }
}
