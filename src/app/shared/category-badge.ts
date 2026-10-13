import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Ícono de categoría sobre un fondo teñido con su color. */
@Component({
  selector: 'app-category-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="icon" aria-hidden="true">{{ icon() }}</span>`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: var(--size, 44px);
      height: var(--size, 44px);
      border-radius: 14px;
      flex: none;
      background: color-mix(in srgb, var(--badge) 18%, transparent);
      color: var(--badge);
    }
    .icon {
      font-size: calc(var(--size, 44px) * 0.55);
    }
  `,
  host: { '[style.--badge]': 'color()' },
})
export class CategoryBadge {
  readonly icon = input('more_horiz');
  readonly color = input('#64748B');
}
