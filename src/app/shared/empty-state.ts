import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="icon big" aria-hidden="true">{{ icon() }}</span>
    <p class="text">{{ text() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px 20px;
      text-align: center;
      color: var(--c-muted);
    }
    .big {
      font-size: 48px;
      color: var(--c-primary);
      opacity: 0.7;
    }
    .text {
      max-width: 36ch;
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly text = input.required<string>();
}
