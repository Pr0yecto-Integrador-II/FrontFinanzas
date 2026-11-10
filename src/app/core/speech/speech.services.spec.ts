import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, ApiError } from '../api';
import { AuthService } from '../auth.service';
import { Clock } from '../clock';
import { SyncService } from '../sync.service';
import { SpeechAuthService } from './speech-auth.service';
import {
  PlaybackHandle,
  RecognitionHandle,
  SPEECH_LOCALE,
  SPEECH_VOICE,
  SpeechCredentials,
  SpeechEngine,
} from './speech-engine';
import { SPEECH_TEXT, SpeechError, speechMessage } from './speech-errors';
import { SpeechRecognitionService } from './speech-recognition.service';
import { SpeechSynthesisService } from './speech-synthesis.service';

class FakeClock extends Clock {
  date = new Date('2026-10-12T15:00:00Z');
  now(): Date {
    return this.date;
  }
  advance(seconds: number): void {
    this.date = new Date(this.date.getTime() + seconds * 1000);
  }
}

interface FakePlayback extends PlaybackHandle {
  text: string;
  voice: string;
  finish(): void;
  fail(): void;
  paused: boolean;
  cancelled: boolean;
}

/** Motor de voz falso: nada de SDK, micrófono ni red. */
class FakeEngine extends SpeechEngine {
  micAllowed = true;
  recognitions: {
    locale: string;
    hints?: readonly string[];
    resolve: (t: string | null) => void;
  }[] = [];
  playbacks: FakePlayback[] = [];
  /** Si es `true`, el micrófono tarda en abrirse: `markReady()` lo abre. */
  holdReady = false;
  markReady: () => void = () => undefined;

  async requestMicrophone(): Promise<boolean> {
    return this.micAllowed;
  }

  recognize(_c: SpeechCredentials, locale: string, hints?: readonly string[]): RecognitionHandle {
    let reject: (e: unknown) => void = () => undefined;
    const result = new Promise<string | null>((res, rej) => {
      this.recognitions.push({ locale, hints, resolve: res });
      reject = rej;
    });
    let ready: Promise<void> | undefined;
    if (this.holdReady) ready = new Promise<void>((res) => (this.markReady = res));
    return {
      result,
      ready,
      cancel: () => {
        this.markReady();
        reject(new SpeechError('cancelled'));
      },
    };
  }

  speak(_c: SpeechCredentials, text: string, voice: string): PlaybackHandle {
    let resolve: () => void = () => undefined;
    let reject: (e: unknown) => void = () => undefined;
    const done = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const p: FakePlayback = {
      text,
      voice,
      done,
      paused: false,
      cancelled: false,
      finish: () => resolve(),
      fail: () => reject(new SpeechError('failed')),
      pause: () => (p.paused = true),
      resume: () => (p.paused = false),
      cancel: () => {
        p.cancelled = true;
        resolve();
      },
    };
    this.playbacks.push(p);
    return p;
  }

  get current(): FakePlayback {
    return this.playbacks[this.playbacks.length - 1];
  }
}

const flush = async (times = 5) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('servicios de voz (HU16–HU19)', () => {
  let api: { speechToken: ReturnType<typeof vi.fn> };
  let online: ReturnType<typeof signal<boolean>>;
  let clock: FakeClock;
  let engine: FakeEngine;
  let account: ReturnType<typeof signal<{ id: string } | null>>;

  beforeEach(() => {
    account = signal<{ id: string } | null>({ id: 'u1' });
    api = {
      speechToken: vi
        .fn()
        .mockResolvedValue({ token: 'tok', region: 'eastus', expires_in_seconds: 600 }),
    };
    online = signal(true);
    clock = new FakeClock();
    engine = new FakeEngine();
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: SyncService, useValue: { online, offline: () => !online() } },
        { provide: Clock, useValue: clock },
        { provide: SpeechEngine, useValue: engine },
        { provide: AuthService, useValue: { account } },
      ],
    });
  });

  describe('SpeechAuthService (HU16)', () => {
    it('pide el token una vez y lo reutiliza mientras esté vigente', async () => {
      const auth = TestBed.inject(SpeechAuthService);
      expect(await auth.credentials()).toEqual({ token: 'tok', region: 'eastus' });
      clock.advance(500);
      await auth.credentials();
      expect(api.speechToken).toHaveBeenCalledTimes(1);
    });

    it('lo renueva cuando faltan menos de 60 segundos', async () => {
      const auth = TestBed.inject(SpeechAuthService);
      await auth.credentials();
      clock.advance(541);
      await auth.credentials();
      expect(api.speechToken).toHaveBeenCalledTimes(2);
    });

    it('otra sesión no reutiliza el token de la cuenta anterior', async () => {
      const auth = TestBed.inject(SpeechAuthService);
      await auth.credentials();
      account.set({ id: 'u2' });
      await auth.credentials();
      expect(api.speechToken).toHaveBeenCalledTimes(2);
    });

    it('las solicitudes simultáneas comparten una sola petición', async () => {
      const auth = TestBed.inject(SpeechAuthService);
      await Promise.all([auth.credentials(), auth.credentials(), auth.credentials()]);
      expect(api.speechToken).toHaveBeenCalledTimes(1);
    });

    it('sin conexión no llama a la API', async () => {
      online.set(false);
      await expect(TestBed.inject(SpeechAuthService).credentials()).rejects.toMatchObject({
        kind: 'offline',
      });
      expect(api.speechToken).not.toHaveBeenCalled();
    });

    it.each([
      [new ApiError(429, 'SPEECH_RATE_LIMITED', 'x'), 'rate_limited', SPEECH_TEXT.rateLimited],
      [
        new ApiError(503, 'SPEECH_SERVICE_UNAVAILABLE', 'x'),
        'unavailable',
        SPEECH_TEXT.unavailable,
      ],
      [new ApiError(0, 'Offline', 'x'), 'offline', SPEECH_TEXT.offline],
    ])('traduce el error de la API a un mensaje de voz (%#)', async (error, kind, message) => {
      api.speechToken.mockRejectedValueOnce(error);
      await expect(TestBed.inject(SpeechAuthService).credentials()).rejects.toMatchObject({
        kind,
        message,
      });
    });

    it('nunca guarda el token en el almacenamiento del navegador', async () => {
      await TestBed.inject(SpeechAuthService).credentials();
      expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('tok');
    });
  });

  describe('SpeechRecognitionService (HU17)', () => {
    it('«Escuchando» solo cuando el micrófono ya captura (antes se perdía el inicio de la frase)', async () => {
      engine.holdReady = true;
      const rec = TestBed.inject(SpeechRecognitionService);
      const p = rec.listen();
      await flush();
      expect(engine.recognitions).toHaveLength(1);
      expect(rec.state()).toBe('processing'); // preparando el micrófono: aún no hablar
      engine.markReady();
      await flush();
      expect(rec.state()).toBe('listening');
      engine.recognitions[0].resolve('Léeme el último gasto');
      expect(await p).toBe('Léeme el último gasto');
    });

    it('cancelar mientras se prepara el micrófono lo libera sin quedar colgado', async () => {
      engine.holdReady = true;
      const rec = TestBed.inject(SpeechRecognitionService);
      const p = rec.listen();
      await flush();
      rec.cancel();
      expect(await p).toBeNull();
      expect(rec.state()).toBe('idle');
    });

    it('pasa al motor las palabras que se esperan oír', async () => {
      const rec = TestBed.inject(SpeechRecognitionService);
      const p = rec.listen(['léeme', 'gastos', 'Alimentación']);
      await flush();
      expect(engine.recognitions[0].hints).toEqual(['léeme', 'gastos', 'Alimentación']);
      engine.recognitions[0].resolve('ok');
      await p;
    });

    it('escucha en es-CO y devuelve la transcripción', async () => {
      const rec = TestBed.inject(SpeechRecognitionService);
      const p = rec.listen();
      await flush();
      expect(rec.state()).toBe('listening');
      expect(engine.recognitions[0].locale).toBe(SPEECH_LOCALE);
      engine.recognitions[0].resolve('Gasté veinticinco mil pesos');
      expect(await p).toBe('Gasté veinticinco mil pesos');
      expect(rec.state()).toBe('idle');
    });

    it('permiso de micrófono denegado: no inicia el reconocimiento', async () => {
      engine.micAllowed = false;
      await expect(TestBed.inject(SpeechRecognitionService).listen()).rejects.toMatchObject({
        kind: 'mic_denied',
        message: SPEECH_TEXT.micDenied,
      });
      expect(engine.recognitions).toHaveLength(0);
    });

    it('silencio o audio no reconocido', async () => {
      const p = TestBed.inject(SpeechRecognitionService).listen();
      await flush();
      engine.recognitions[0].resolve(null);
      await expect(p).rejects.toMatchObject({ kind: 'no_match', message: SPEECH_TEXT.noMatch });
    });

    it('sin conexión no pide token ni micrófono', async () => {
      online.set(false);
      await expect(TestBed.inject(SpeechRecognitionService).listen()).rejects.toMatchObject({
        kind: 'offline',
      });
      expect(api.speechToken).not.toHaveBeenCalled();
      expect(speechMessage(new SpeechError('offline'), 'dictation')).toBe(
        SPEECH_TEXT.offlineDictation,
      );
    });

    it('doble toque: el segundo detiene la escucha y no abre otro reconocedor', async () => {
      const rec = TestBed.inject(SpeechRecognitionService);
      const first = rec.listen();
      await flush();
      expect(await rec.listen()).toBeNull();
      expect(await first).toBeNull();
      expect(engine.recognitions).toHaveLength(1);
      expect(rec.state()).toBe('idle');
    });

    it('perder la conexión durante el dictado cancela y avisa', async () => {
      const p = TestBed.inject(SpeechRecognitionService).listen();
      await flush();
      window.dispatchEvent(new Event('offline'));
      await expect(p).rejects.toMatchObject({
        kind: 'connection_lost',
        message: SPEECH_TEXT.connectionLost,
      });
    });
  });

  describe('SpeechSynthesisService (HU18 y HU19)', () => {
    it('lee un movimiento con la voz es-CO y vuelve a reposo al terminar', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.speakOne('t1', 'Gasto de $25.000');
      await flush();
      expect(tts.state()).toBe('speaking');
      expect(tts.activeId()).toBe('t1');
      expect(engine.current.voice).toBe(SPEECH_VOICE);
      engine.current.finish();
      await p;
      expect(tts.state()).toBe('idle');
      expect(tts.activeId()).toBeNull();
    });

    it('"Detener lectura" corta el audio de inmediato', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.speakOne('t1', 'x');
      await flush();
      tts.stop();
      await p;
      expect(engine.current.cancelled).toBe(true);
      expect(tts.state()).toBe('idle');
    });

    it('una lectura nueva detiene la anterior (exclusividad de audio)', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const first = tts.speakOne('t1', 'uno');
      await flush();
      const second = tts.speakOne('t2', 'dos');
      await flush();
      expect(engine.playbacks[0].cancelled).toBe(true);
      expect(tts.activeId()).toBe('t2');
      tts.stop(); // no dejar lecturas abiertas para las demás pruebas
      await Promise.all([first, second]);
    });

    it('error de síntesis: rechaza con el mensaje de HU18', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.speakOne('t1', 'x');
      await flush();
      engine.current.fail();
      await expect(p).rejects.toMatchObject({ message: SPEECH_TEXT.playbackFailed });
      expect(tts.state()).toBe('idle');
    });

    it('sin conexión no llama al sintetizador', async () => {
      online.set(false);
      await expect(
        TestBed.inject(SpeechSynthesisService).speakOne('t1', 'x'),
      ).rejects.toMatchObject({
        kind: 'offline',
      });
      expect(engine.playbacks).toHaveLength(0);
      expect(speechMessage(new SpeechError('offline'), 'reading')).toBe(SPEECH_TEXT.offlineReading);
    });

    const queue = [
      { id: null, text: 'Leyendo 3 movimientos' },
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ];

    it('cola: avanza en orden, muestra el avance y permite pausar, reanudar y saltar', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.playQueue(queue);
      await flush();
      expect(engine.current.text).toBe('Leyendo 3 movimientos');
      engine.current.finish();
      await flush();
      expect(tts.activeId()).toBe('a');
      expect(tts.progress()).toEqual({ current: 1, total: 3 });

      tts.pause();
      expect(tts.state()).toBe('paused');
      expect(engine.current.paused).toBe(true);
      tts.resume();
      expect(tts.state()).toBe('speaking');

      tts.next(); // "Siguiente": corta A y lee B
      await flush();
      expect(engine.current.text).toBe('B');
      expect(tts.progress()).toEqual({ current: 2, total: 3 });

      tts.stop();
      await p;
      expect(tts.state()).toBe('idle');
      expect(tts.mode()).toBeNull();
    });

    it('cola: renueva el token antes de seguir si está por vencer', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.playQueue(queue.slice(0, 2));
      await flush();
      clock.advance(560);
      engine.current.finish();
      await flush();
      engine.current.finish();
      await p;
      expect(api.speechToken).toHaveBeenCalledTimes(2);
    });

    it('cola: perder la conexión detiene la lectura de forma controlada', async () => {
      const tts = TestBed.inject(SpeechSynthesisService);
      const p = tts.playQueue(queue);
      await flush();
      online.set(false);
      window.dispatchEvent(new Event('offline'));
      await expect(p).rejects.toMatchObject({ kind: 'offline' });
      expect(tts.state()).toBe('idle');
    });
  });
});
