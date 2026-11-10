/**
 * Puerto hacia el motor de voz. Los servicios dependen de esta abstracción y nunca del SDK:
 * así las pruebas usan un motor falso y los componentes no conocen `microsoft-cognitiveservices-speech-sdk`.
 */

/** Idioma del dictado y voz neuronal de lectura (configuración del cliente, no secretos). */
export const SPEECH_LOCALE = 'es-CO';
export const SPEECH_VOICE = 'es-CO-SalomeNeural';

export interface SpeechCredentials {
  token: string;
  region: string;
}

export interface RecognitionHandle {
  /** Texto reconocido, o `null` si no se entendió nada (silencio o audio ininteligible). */
  readonly result: Promise<string | null>;
  /**
   * Se resuelve cuando el micrófono ya está capturando (o al cancelar). Hasta entonces lo que
   * se diga se pierde, así que la interfaz solo debe decir «Escuchando» después de esto.
   * Ausente = listo de inmediato.
   */
  readonly ready?: Promise<void>;
  cancel(): void;
}

export interface PlaybackHandle {
  /** Se resuelve al terminar o al cancelar; se rechaza si la síntesis falla. */
  readonly done: Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export abstract class SpeechEngine {
  /** Pide permiso de micrófono. `false` si el usuario o el navegador lo niegan. */
  abstract requestMicrophone(): Promise<boolean>;
  /**
   * `hints`: frases y palabras que se esperan ("léeme", "últimos", nombres de categorías…).
   * Sesgan el reconocimiento hacia ese vocabulario y reducen los errores de transcripción.
   */
  abstract recognize(
    credentials: SpeechCredentials,
    locale: string,
    hints?: readonly string[],
  ): RecognitionHandle;
  /**
   * Adelanta lo lento del reconocimiento (conexión abierta) mientras el asistente habla,
   * para que el micrófono abra casi al instante después. Opcional: por defecto no hace nada.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- firma que los motores reales redefinen
  prepare(_credentials: SpeechCredentials, _locale: string, _hints?: readonly string[]): void {
    // el motor de pruebas no necesita calentarse
  }
  /** Descarta lo adelantado con `prepare` si ya no se va a usar. */
  discard(): void {
    // ídem
  }
  abstract speak(credentials: SpeechCredentials, text: string, voice: string): PlaybackHandle;
}
