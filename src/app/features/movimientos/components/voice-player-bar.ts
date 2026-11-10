import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SpeechSynthesisService } from '../../../core/speech/speech-synthesis.service';

/** Barra compacta de lectura del historial (HU19 regla 3): pausar, siguiente y detener. */
@Component({
  selector: 'app-voice-player-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section class="bar" aria-label="Lectura del historial">
        <span class="icon pulse" aria-hidden="true">graphic_eq</span>
        <span class="status" aria-live="polite">{{ status() }}</span>
        <div class="controls">
          @if (paused()) {
            <button type="button" class="icon-btn" (click)="speech.resume()" aria-label="Reanudar">
              <span class="icon" aria-hidden="true">play_arrow</span>
            </button>
          } @else {
            <button
              type="button"
              class="icon-btn"
              (click)="speech.pause()"
              [disabled]="speech.state() !== 'speaking'"
              aria-label="Pausar"
            >
              <span class="icon" aria-hidden="true">pause</span>
            </button>
          }
          <button type="button" class="icon-btn" (click)="speech.next()" aria-label="Siguiente">
            <span class="icon" aria-hidden="true">skip_next</span>
          </button>
          <button type="button" class="icon-btn stop" (click)="speech.stop()" aria-label="Detener">
            <span class="icon" aria-hidden="true">stop</span>
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    .bar {
      position: sticky;
      bottom: 12px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
      padding: 8px 8px 8px 16px;
      border-radius: 999px;
      background: var(--c-hero);
      color: var(--c-on-hero);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    }
    .status {
      flex: 1;
      font-weight: 600;
      font-size: 0.9375rem;
    }
    .controls {
      display: flex;
      gap: 2px;
    }
    .controls .icon-btn {
      color: var(--c-on-hero);
    }
    .controls .icon-btn:hover {
      background: rgb(255 255 255 / 0.12);
    }
    .controls .stop {
      color: #ffb4c0;
    }
    .pulse {
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.4;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse {
        animation: none;
      }
    }
  `,
})
export class VoicePlayerBar {
  protected readonly speech = inject(SpeechSynthesisService);

  protected readonly visible = computed(
    () => this.speech.mode() === 'queue' && this.speech.active(),
  );
  protected readonly paused = computed(() => this.speech.state() === 'paused');
  protected readonly status = computed(() => {
    const { current, total } = this.speech.progress();
    if (this.paused()) return 'En pausa';
    if (!current) return 'Leyendo historial…';
    return `Leyendo ${current} de ${total}`;
  });
}
