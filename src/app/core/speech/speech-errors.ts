/** Errores y textos de los servicios de voz (MVP 2, HU16–HU19). */

export type SpeechErrorKind =
  | 'offline'
  | 'rate_limited'
  | 'unavailable'
  | 'mic_denied'
  | 'no_match'
  | 'connection_lost'
  | 'failed'
  | 'cancelled';

/** Textos exactos de `docs/MVP2.md`. */
export const SPEECH_TEXT = {
  offline: 'Los servicios de voz requieren conexión a internet',
  offlineDictation: 'El registro por voz requiere conexión a internet',
  offlineReading: 'La lectura por voz requiere conexión a internet',
  rateLimited: 'Has alcanzado el límite temporal del servicio de voz. Intenta más tarde',
  unavailable: 'El servicio de voz no está disponible en este momento',
  micDenied: 'Permiso de micrófono denegado. Habilítalo en tu navegador o registra manualmente',
  noMatch: 'No se reconoció ningún movimiento. Intenta de nuevo o escribe los datos',
  connectionLost:
    'Se perdió la conexión durante el dictado. Puedes completar el registro manualmente',
  playbackFailed: 'No se pudo reproducir el movimiento. Intenta nuevamente',
  noAmount: 'No pudimos detectar el monto. Ingrésalo para continuar',
  reviewDraft: 'Revisa los datos y presiona "Guardar"',
  emptyHistory: 'No hay movimientos para leer',
} as const;

const DEFAULT_MESSAGE: Record<SpeechErrorKind, string> = {
  offline: SPEECH_TEXT.offline,
  rate_limited: SPEECH_TEXT.rateLimited,
  unavailable: SPEECH_TEXT.unavailable,
  mic_denied: SPEECH_TEXT.micDenied,
  no_match: SPEECH_TEXT.noMatch,
  connection_lost: SPEECH_TEXT.connectionLost,
  failed: SPEECH_TEXT.playbackFailed,
  cancelled: '',
};

export class SpeechError extends Error {
  constructor(
    readonly kind: SpeechErrorKind,
    message: string = DEFAULT_MESSAGE[kind],
  ) {
    super(message);
  }
}

/** Mensaje para mostrar según dónde ocurrió el error (dictado o lectura). */
export function speechMessage(e: unknown, context: 'dictation' | 'reading'): string {
  if (!(e instanceof SpeechError)) return SPEECH_TEXT.unavailable;
  if (e.kind === 'offline') {
    return context === 'dictation' ? SPEECH_TEXT.offlineDictation : SPEECH_TEXT.offlineReading;
  }
  if (e.kind === 'failed' && context === 'dictation') return SPEECH_TEXT.unavailable;
  return e.message;
}
