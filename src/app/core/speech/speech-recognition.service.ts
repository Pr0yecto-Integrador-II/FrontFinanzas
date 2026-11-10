import { Injectable, inject, signal } from '@angular/core';
import { SyncService } from '../sync.service';
import { SpeechAuthService } from './speech-auth.service';
import { SPEECH_LOCALE, RecognitionHandle, SpeechEngine } from './speech-engine';
import { SpeechError } from './speech-errors';
import { playReadyTone } from './ready-tone';

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
  async listen(hints?: readonly string[]): Promise<string | null> {
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
      this.handle = this.engine.recognize(credentials, SPEECH_LOCALE, hints);
      void this.handle.result.catch(() => undefined); // se espera más abajo; evita falsos «sin manejar»
      // «Escuchando» solo cuando el micrófono ya captura: antes, lo dicho se perdía
      await this.handle.ready;
      if (this.stopping) this.handle.cancel();
      else {
        this._state.set('listening');
        playReadyTone();
      }
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

  /**
   * Adelanta la conexión mientras el asistente todavía habla, para que la siguiente escucha
   * empiece casi al instante (una respuesta corta dicha de inmediato, como «sí», no se pierda).
   * Sin conexión o ante cualquier fallo no hace nada: `listen` funciona igual, solo tarda más.
   */
  prepare(hints?: readonly string[]): void {
    if (!this.sync.online()) return;
    this.auth.credentials().then(
      (credentials) => this.engine.prepare(credentials, SPEECH_LOCALE, hints),
      () => undefined,
    );
  }

  /** Detiene la escucha y libera el micrófono. */
  cancel(): void {
    this.stopping = true;
    this.handle?.cancel();
    this.engine.discard();
  }
}
