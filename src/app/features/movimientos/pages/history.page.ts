import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Clock } from '../../../core/clock';
import { dayHeading, shortDate } from '../../../core/dates';
import { formatPlain, parseMoney } from '../../../core/money';
import { Transaction } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state';
import { MoneyPipe } from '../../../shared/money.pipe';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { PendingList } from '../../recurrentes/components/pending-list';
import { TxRow } from '../components/tx-row';
import { FiltersState } from '../data/filters.state';
import { TransactionRepo } from '../data/transaction.repo';
import {
  PERIOD_LABEL,
  PeriodKey,
  applyFilters,
  filteredTotals,
  groupByDay,
  periodRange,
} from '../domain/filters';

const PAGE = 50;
const PERIODS: PeriodKey[] = ['all', 'this_month', 'last_month', 'last_30', 'this_year', 'custom'];

@Component({
  selector: 'app-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, TxRow, EmptyState, PendingList],
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
})
export class HistoryPage implements AfterViewInit {
  private readonly clock = inject(Clock);
  private readonly repo = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly state = inject(FiltersState);

  protected readonly today = this.clock.today();
  protected readonly periods = PERIODS.map((key) => ({ key, label: PERIOD_LABEL[key] }));
  protected readonly categories = this.cats.active;
  protected readonly tags = this.repo.knownTags;

  protected readonly panelOpen = signal(false);
  protected readonly visibleCount = signal(PAGE);
  protected readonly searchText = signal(this.state.filters().text);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  protected readonly filtered = computed(() =>
    applyFilters(this.repo.visible(), this.state.filters(), this.today),
  );
  protected readonly totals = computed(() => filteredTotals(this.filtered()));
  protected readonly groups = computed(() => groupByDay(this.filtered().slice(0, this.visibleCount())));
  protected readonly hasMore = computed(() => this.filtered().length > this.visibleCount());
  protected readonly hasAny = computed(() => this.repo.visible().length > 0);

  /** Chips de filtros activos, cada uno con su forma de quitarse (HU12 regla 3). */
  protected readonly chips = computed(() => {
    const f = this.state.filters();
    const out: { key: string; label: string; remove: () => void }[] = [];
    if (f.period !== 'all') {
      const { from, to } = periodRange(f, this.today);
      const label = f.period === 'custom' ? `${from ? shortDate(from) : '…'} – ${to ? shortDate(to) : '…'}` : PERIOD_LABEL[f.period];
      out.push({ key: 'period', label, remove: () => this.state.patch({ period: 'all', from: null, to: null }) });
    }
    if (f.type !== 'all') {
      out.push({ key: 'type', label: f.type === 'expense' ? 'Gastos' : 'Ingresos', remove: () => this.state.patch({ type: 'all' }) });
    }
    for (const id of f.categoryIds) {
      out.push({
        key: `cat-${id}`,
        label: this.cats.byId().get(id)?.name ?? 'Categoría',
        remove: () => this.state.patch({ categoryIds: f.categoryIds.filter((c) => c !== id) }),
      });
    }
    if (f.minMinor !== null || f.maxMinor !== null) {
      const a = f.minMinor !== null ? formatPlain(f.minMinor) : '…';
      const b = f.maxMinor !== null ? formatPlain(f.maxMinor) : '…';
      out.push({ key: 'amount', label: `Monto ${a} – ${b}`, remove: () => this.state.patch({ minMinor: null, maxMinor: null }) });
    }
    if (f.tag) out.push({ key: 'tag', label: `#${f.tag}`, remove: () => this.state.patch({ tag: null }) });
    if (f.text.trim()) {
      out.push({
        key: 'text',
        label: `“${f.text.trim()}”`,
        remove: () => {
          this.searchText.set('');
          this.state.patch({ text: '' });
        },
      });
    }
    return out;
  });

  protected readonly catOf = (id: string) => this.cats.byId().get(id);

  ngAfterViewInit(): void {
    // Carga progresiva de 50 en 50 al llegar al final de la lista (HU11 regla 5)
    const el = this.sentinel()?.nativeElement;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && this.hasMore()) {
        this.visibleCount.update((n) => n + PAGE);
      }
    });
    io.observe(el);
    this.destroyRef.onDestroy(() => io.disconnect());
  }

  protected heading(date: string): string {
    return dayHeading(date, this.today);
  }

  protected open(t: Transaction): void {
    void this.router.navigate(['/movimientos', t.id]);
  }

  /** La búsqueda por texto se ejecuta al dejar de escribir (300 ms). */
  protected onSearch(value: string): void {
    this.searchText.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.state.patch({ text: value });
      this.visibleCount.set(PAGE);
    }, 300);
  }

  protected setPeriod(key: PeriodKey): void {
    this.state.patch({
      period: key,
      ...(key !== 'custom' ? { from: null, to: null } : {}),
    });
    this.visibleCount.set(PAGE);
  }

  protected toggleCategory(id: string): void {
    const ids = this.state.filters().categoryIds;
    this.state.patch({ categoryIds: ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id] });
  }

  protected setAmount(which: 'min' | 'max', raw: string): void {
    const v = raw.trim() ? parseMoney(raw) : null;
    this.state.patch(which === 'min' ? { minMinor: v } : { maxMinor: v });
  }

  protected amountText(v: number | null): string {
    return v === null ? '' : formatPlain(v);
  }

  protected clear(): void {
    this.searchText.set('');
    this.state.clear();
    this.visibleCount.set(PAGE);
  }
}
