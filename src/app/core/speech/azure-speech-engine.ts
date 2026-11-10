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
type SdkRecognizer = import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer;

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

  /** Reconocedor ya creado y con la conexión abierta, a la espera de `recognize`. */
  private warm: { recognizer: SdkRecognizer; at: number } | null = null;
  private warmId = 0;

  /** Crea un reconocedor con el idioma, los tiempos de silencio y las palabras esperadas. */
  private build(
    sdk: Sdk,
    credentials: SpeechCredentials,
    locale: string,
    hints: readonly string[],
  ): SdkRecognizer {
    const config = sdk.SpeechConfig.fromAuthorizationToken(credentials.token, credentials.region);
    config.speechRecognitionLanguage = locale;
    // Una pausa para pensar a mitad de frase no debe cortar el dictado…
    config.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '1500');
    // …y se da tiempo a empezar a hablar tras el aviso sonoro.
    config.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '8000');
    const recognizer = new sdk.SpeechRecognizer(
      config,
      sdk.AudioConfig.fromDefaultMicrophoneInput(),
    );
    if (hints.length) sdk.PhraseListGrammar.fromRecognizer(recognizer).addPhrases([...hints]);
    return recognizer;
  }

  /**
   * Adelanta la parte lenta (crear el reconocedor y abrir la conexión) mientras el asistente
   * todavía está hablando. Así, al terminar la pregunta, el micrófono se abre casi al instante
   * y un «sí» dicho de inmediato no se pierde. El micrófono no se toca hasta `recognize`.
   */
  override prepare(
    credentials: SpeechCredentials,
    locale: string,
    hints: readonly string[] = [],
  ): void {
    this.discard();
    const id = this.warmId;
    this.load()
      .then((sdk) => {
        if (id !== this.warmId) return; // llegó tarde: ya se descartó o se pidió otro
        const recognizer = this.build(sdk, credentials, locale, hints);
        this.warm = { recognizer, at: Date.now() };
        sdk.Connection.fromRecognizer(recognizer).openConnection();
      })
      .catch(() => undefined); // si falla, `recognize` lo crea como siempre
  }

  override discard(): void {
    this.warmId++;
    this.warm?.recognizer.close();
    this.warm = null;
  }

  recognize(
    credentials: SpeechCredentials,
    locale: string,
    hints: readonly string[] = [],
  ): RecognitionHandle {
    let recognizer: SdkRecognizer | null = null;
    let settled = false;
    let rejectResult: (e: unknown) => void = () => undefined;
    let markReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (markReady = resolve));

    const close = () => {
      recognizer?.close();
      recognizer = null;
      markReady(); // nunca deja a nadie esperando un micrófono que ya no va a abrir
    };

    const result = new Promise<string | null>((resolve, reject) => {
      rejectResult = reject;
      this.load().then(
        (sdk) => {
          if (settled) return;
          // Usa el reconocedor adelantado si es reciente; si no, uno nuevo
          const warm = this.warm;
          this.warm = null;
          this.warmId++;
          if (warm && Date.now() - warm.at < 30_000) recognizer = warm.recognizer;
          else {
            warm?.recognizer.close();
            recognizer = this.build(sdk, credentials, locale, hints);
          }
          recognizer.sessionStarted = () => markReady();
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
      ready,
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
