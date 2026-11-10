import { Injectable } from '@angular/core';
import { SpeechError } from './speech-errors';
import {
  PlaybackHandle,
  RecognitionHandle,
  SpeechCredentials,
  SpeechEngine,
} from './speech-engine';

// Solo tipos: el código del SDK llega por el bundle de navegador (ver `load`).
type Sdk = typeof import('microsoft-cognitiveservices-speech-sdk');

/**
 * Adaptador de `microsoft-cognitiveservices-speech-sdk` (Azure AI Speech).
 * El SDK se carga bajo demanda la primera vez que se usa la voz, fuera del bundle inicial.
 * Se autentica solo con el token temporal del backend: la clave nunca llega al navegador.
 */
@Injectable({ providedIn: 'root' })
export class AzureSpeechEngine extends SpeechEngine {
  private sdk: Promise<Sdk> | null = null;

  /**
   * Usa el bundle oficial para navegador: la entrada principal del paquete trae
   * dependencias de Node (`https`, `url`) que no existen en el navegador.
   */
  private load(): Promise<Sdk> {
    this.sdk ??=
      import('microsoft-cognitiveservices-speech-sdk/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js')
        .then(() => {
          const sdk = (window as unknown as { SpeechSDK?: Sdk }).SpeechSDK;
          if (!sdk) throw new Error('SpeechSDK no disponible');
          return sdk;
        })
        .catch((e: unknown) => {
          this.sdk = null; // permite reintentar si falló la descarga del chunk
          throw e;
        });
    return this.sdk;
  }

  async requestMicrophone(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // solo era para pedir el permiso
      return true;
    } catch {
      return false;
    }
  }

  recognize(credentials: SpeechCredentials, locale: string): RecognitionHandle {
    let recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | null = null;
    let settled = false;
    let rejectResult: (e: unknown) => void = () => undefined;

    const close = () => {
      recognizer?.close();
      recognizer = null;
    };

    const result = new Promise<string | null>((resolve, reject) => {
      rejectResult = reject;
      this.load().then(
        (sdk) => {
          if (settled) return;
          const config = sdk.SpeechConfig.fromAuthorizationToken(
            credentials.token,
            credentials.region,
          );
          config.speechRecognitionLanguage = locale;
          recognizer = new sdk.SpeechRecognizer(
            config,
            sdk.AudioConfig.fromDefaultMicrophoneInput(),
          );
          recognizer.recognizeOnceAsync(
            (r) => {
              settled = true;
              close();
              if (r.reason === sdk.ResultReason.RecognizedSpeech && r.text.trim()) resolve(r.text);
              else if (r.reason === sdk.ResultReason.NoMatch) resolve(null);
              else if (r.reason === sdk.ResultReason.RecognizedSpeech) resolve(null);
              else reject(new SpeechError('failed'));
            },
            () => {
              settled = true;
              close();
              reject(new SpeechError('failed'));
            },
          );
        },
        () => {
          settled = true;
          reject(new SpeechError('unavailable'));
        },
      );
    });

    return {
      result,
      cancel: () => {
        if (settled) return;
        settled = true;
        close();
        rejectResult(new SpeechError('cancelled'));
      },
    };
  }

  speak(credentials: SpeechCredentials, text: string, voice: string): PlaybackHandle {
    let player: import('microsoft-cognitiveservices-speech-sdk').SpeakerAudioDestination | null =
      null;
    let synthesizer: import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesizer | null =
      null;
    let settled = false;
    let resolveDone: () => void = () => undefined;
    let rejectDone: (e: unknown) => void = () => undefined;

    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    const finish = (error?: SpeechError) => {
      if (settled) return;
      settled = true;
      synthesizer?.close();
      synthesizer = null;
      if (error) rejectDone(error);
      else resolveDone();
    };

    this.load().then(
      (sdk) => {
        if (settled) return;
        const config = sdk.SpeechConfig.fromAuthorizationToken(
          credentials.token,
          credentials.region,
        );
        config.speechSynthesisVoiceName = voice;
        player = new sdk.SpeakerAudioDestination();
        player.onAudioEnd = () => finish();
        synthesizer = new sdk.SpeechSynthesizer(config, sdk.AudioConfig.fromSpeakerOutput(player));
        synthesizer.speakTextAsync(
          text,
          (r) => {
            if (r.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
              finish(new SpeechError('failed'));
            }
          },
          () => finish(new SpeechError('failed')),
        );
      },
      () => finish(new SpeechError('unavailable')),
    );

    return {
      done,
      pause: () => player?.pause(),
      resume: () => player?.resume(),
      cancel: () => {
        player?.pause();
        player?.close();
        player = null;
        finish();
      },
    };
  }
}
