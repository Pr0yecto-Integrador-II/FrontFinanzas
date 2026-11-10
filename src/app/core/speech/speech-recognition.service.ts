import { Injectable, inject, signal } from '@angular/core';
import { SyncService } from '../sync.service';
import { SpeechAuthService } from './speech-auth.service';
import { SPEECH_LOCALE, RecognitionHandle, SpeechEngine } from './speech-engine';
import { SpeechError } from './speech-errors';

export type DictationState = 'idle' | 'processing' | 'listening';

/**
 * Dictado de un movimiento con `SpeechRecognizer` (HU17). Un solo reconocedor a la vez:
 * tocar de nuevo mientras escucha lo detiene.
 */
@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  private readonly auth = inject(SpeechAuthService);
  private readonly engine = inject(SpeechEngine);
  private readonly sync = inject(SyncService);

  private readonly _state = signal<DictationState>('idle');
  readonly state = this._state.asReadonly();

  private handle: RecognitionHandle | null = null;
  private stopping = false;

  /**
   * Escucha una frase y devuelve la transcripción, o `null` si se canceló.
   * Lanza `SpeechError` con el motivo (sin conexión, micrófono denegado, sin coincidencias…).
   */
  async listen(): Promise<string | null> {
    if (this._state() !== 'idle') {
      this.cancel();
      return null;
    }
    if (!this.sync.online()) throw new SpeechError('offline');

    this._state.set('processing');
    this.stopping = false;
    let lost = false;
    const onOffline = () => {
      lost = true;
      this.handle?.cancel();
    };
    window.addEventListener('offline', onOffline);
    try {
      const credentials = await this.auth.credentials();
      if (this.stopping) return null;
      if (!(await this.engine.requestMicrophone())) throw new SpeechError('mic_denied');
      if (this.stopping) return null;
      this._state.set('listening');
      this.handle = this.engine.recognize(credentials, SPEECH_LOCALE);
      const text = await this.handle.result;
      this._state.set('processing');
      if (!text?.trim()) throw new SpeechError('no_match');
      return text;
    } catch (e) {
      if (lost) throw new SpeechError('connection_lost');
      if (e instanceof SpeechError && e.kind === 'cancelled') return null;
      throw e;
    } finally {
      window.removeEventListener('offline', onOffline);
      this.handle = null;
      this._state.set('idle');
    }
  }

  /** Detiene la escucha y libera el micrófono. */
  cancel(): void {
    this.stopping = true;
    this.handle?.cancel();
  }
}
