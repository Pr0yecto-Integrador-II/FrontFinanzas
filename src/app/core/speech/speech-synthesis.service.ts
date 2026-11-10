import { Injectable, computed, inject, signal } from '@angular/core';
import { SyncService } from '../sync.service';
import { SpeechAuthService } from './speech-auth.service';
import { PlaybackHandle, SPEECH_VOICE, SpeechEngine } from './speech-engine';
import { SpeechError } from './speech-errors';

export type ReadingState = 'idle' | 'preparing' | 'speaking' | 'paused';
export type ReadingMode = 'single' | 'queue';

export interface SpeechQueueItem {
  /** Movimiento que se resalta mientras se lee; `null` para anuncios. */
  id: string | null;
  text: string;
}

/**
 * Lectura en voz alta con `SpeechSynthesizer` (HU18 y HU19).
 * Solo suena una lectura a la vez: empezar otra detiene la anterior.
 */
@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService {
  private readonly auth = inject(SpeechAuthService);
  private readonly engine = inject(SpeechEngine);
  private readonly sync = inject(SyncService);

  private readonly _state = signal<ReadingState>('idle');
  private readonly _mode = signal<ReadingMode | null>(null);
  private readonly _activeId = signal<string | null>(null);
  private readonly _position = signal(0);
  private readonly _ids = signal<string[]>([]);

  readonly state = this._state.asReadonly();
  readonly mode = this._mode.asReadonly();
  /** Movimiento que se está leyendo ahora mismo. */
  readonly activeId = this._activeId.asReadonly();
  readonly active = computed(() => this._state() !== 'idle');
  /** Avance de la cola: "2 de 3" (solo cuenta movimientos, no anuncios). */
  readonly progress = computed(() => {
    const ids = this._ids();
    const id = this._activeId();
    return { current: id ? ids.indexOf(id) + 1 : 0, total: ids.length };
  });

  private items: SpeechQueueItem[] = [];
  private handle: PlaybackHandle | null = null;
  private run = 0;

  /** Lee un movimiento (HU18). */
  speakOne(id: string, text: string): Promise<void> {
    return this.play([{ id, text }], 'single');
  }

  /** Lee una secuencia de movimientos y anuncios (HU19). */
  playQueue(items: SpeechQueueItem[]): Promise<void> {
    return this.play(items, 'queue');
  }

  pause(): void {
    if (this._state() !== 'speaking') return;
    this.handle?.pause();
    this._state.set('paused');
  }

  resume(): void {
    if (this._state() !== 'paused') return;
    this.handle?.resume();
    this._state.set('speaking');
  }

  /** Corta el elemento actual y pasa al siguiente. */
  next(): void {
    if (this._mode() !== 'queue') return;
    this.handle?.cancel();
  }

  stop(): void {
    this.run++;
    this.handle?.cancel();
    this.reset();
  }

  private async play(items: SpeechQueueItem[], mode: ReadingMode): Promise<void> {
    this.stop();
    if (!items.length) return;
    const run = this.run;
    this.items = items;
    this._mode.set(mode);
    this._ids.set(items.flatMap((i) => (i.id ? [i.id] : [])));

    let lost = false;
    const onOffline = () => {
      lost = true;
      this.handle?.cancel();
    };
    window.addEventListener('offline', onOffline);
    try {
      for (let i = 0; i < this.items.length; i++) {
        if (run !== this.run) return;
        if (lost || !this.sync.online()) throw new SpeechError('offline');
        const item = this.items[i];
        this._position.set(i);
        this._activeId.set(item.id ?? (mode === 'single' ? this._activeId() : null));
        this._state.set('preparing');
        // Renovación transparente: si el token está por vencer, se pide otro antes de seguir
        const credentials = await this.auth.credentials();
        if (run !== this.run) return;
        this.handle = this.engine.speak(credentials, item.text, SPEECH_VOICE);
        this._state.set('speaking');
        await this.handle.done;
        this.handle = null;
        if (lost) throw new SpeechError('offline');
      }
    } finally {
      window.removeEventListener('offline', onOffline);
      if (run === this.run) this.reset();
    }
  }

  private reset(): void {
    this.handle = null;
    this.items = [];
    this._state.set('idle');
    this._mode.set(null);
    this._activeId.set(null);
    this._position.set(0);
    this._ids.set([]);
  }
}
