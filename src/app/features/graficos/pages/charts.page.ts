import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { AuthService } from '../../../core/auth.service';
import { Clock } from '../../../core/clock';
import { monthLabel, monthOf, shortMonth } from '../../../core/dates';
import { formatMoney } from '../../../core/money';
import { ThemeService } from '../../../core/theme.service';
import { EmptyState } from '../../../shared/empty-state';
import { MoneyPipe } from '../../../shared/money.pipe';
import { MonthSwitcher } from '../../../shared/month-switcher';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { FiltersState } from '../../movimientos/data/filters.state';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { DonutSlice, donutSlices, expenseByCategory, lastMonths } from '../../resumen/domain/summary';

interface Palette {
  ink: string;
  muted: string;
  line: string;
  surface: string;
  income: string;
  expense: string;
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--c-ink', '#0d1b17'),
    muted: v('--c-muted', '#5a6c66'),
    line: v('--c-line', '#dbe4e0'),
    surface: v('--c-surface', '#ffffff'),
    income: v('--c-income', '#12874f'),
    expense: v('--c-expense', '#cf3650'),
  };
}

@Component({
  selector: 'app-charts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, NgxEchartsDirective, MonthSwitcher, EmptyState, MoneyPipe],
  templateUrl: './charts.page.html',
  styleUrl: './charts.page.scss',
})
export class ChartsPage {
  private readonly clock = inject(Clock);
  private readonly txs = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly filters = inject(FiltersState);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  protected readonly month = signal(monthOf(this.clock.today()));
  protected readonly currentMonth = monthOf(this.clock.today());
  protected readonly monthTitle = computed(() => monthLabel(this.month()));

  /** Cambia con el tema para que los gráficos se vuelvan a pintar con los colores correctos. */
  private readonly themeTick = signal(0);

  constructor() {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => this.themeTick.update((n) => n + 1));
  }

  protected readonly slices = computed<DonutSlice[]>(() =>
    donutSlices(expenseByCategory(this.txs.confirmed(), this.month()), this.cats.byId()),
  );
  protected readonly total = computed(() => this.slices().reduce((a, s) => a + s.amountMinor, 0));
  protected readonly bars = computed(() => lastMonths(this.txs.confirmed(), this.month(), 6));
  protected readonly hasBars = computed(() => this.bars().some((b) => b.income || b.expense));

  private readonly palette = computed(() => {
    this.theme.choice();
    this.themeTick();
    return readPalette();
  });

  protected readonly donut = computed<EChartsCoreOption>(() => {
    const p = this.palette();
    const cur = this.auth.currency();
    return {
      aria: { enabled: true },
      tooltip: {
        trigger: 'item',
        backgroundColor: p.surface,
        borderColor: p.line,
        textStyle: { color: p.ink },
        formatter: (x: { name: string; value: number; percent: number }) =>
          `${x.name}<br/><b>${formatMoney(x.value, cur)}</b> · ${Math.round(x.percent)} %`,
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '84%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6 },
          data: this.slices().map((s) => ({
            name: s.name,
            value: s.amountMinor,
            categoryId: s.categoryId,
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  });

  protected readonly barOptions = computed<EChartsCoreOption>(() => {
    const p = this.palette();
    const cur = this.auth.currency();
    const rows = this.bars();
    return {
      aria: { enabled: true },
      grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: p.surface,
        borderColor: p.line,
        textStyle: { color: p.ink },
        valueFormatter: (v: number) => formatMoney(v, cur),
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => shortMonth(r.month)),
        axisLine: { lineStyle: { color: p.line } },
        axisTick: { show: false },
        axisLabel: { color: p.muted },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: p.line } },
        axisLabel: {
          color: p.muted,
          formatter: (v: number) =>
            new Intl.NumberFormat('es-CO', { notation: 'compact' }).format(v / 100),
        },
      },
      series: [
        { name: 'Ingresos', type: 'bar', data: rows.map((r) => r.income), itemStyle: { color: p.income, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 28 },
        { name: 'Gastos', type: 'bar', data: rows.map((r) => r.expense), itemStyle: { color: p.expense, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 28 },
      ],
    };
  });

  protected monthShort(m: string): string {
    return monthLabel(m, true);
  }

  /** Tocar una parte abre el historial filtrado por esa categoría y mes (HU15). */
  protected onSliceClick(e: unknown): void {
    const id = (e as { data?: { categoryId?: string | null } }).data?.categoryId;
    if (id) this.openCategory(id);
  }

  protected openCategory(id: string | null): void {
    if (!id) return;
    this.filters.showCategoryInMonth(id, this.month());
    void this.router.navigateByUrl('/movimientos');
  }
}
