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
  abstract recognize(credentials: SpeechCredentials, locale: string): RecognitionHandle;
  abstract speak(credentials: SpeechCredentials, text: string, voice: string): PlaybackHandle;
}
