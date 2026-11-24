/** Errores y textos del análisis de imágenes (MVP 3, HU20–HU21, HU25). */

export type VisionErrorKind =
  'offline' | 'too_large' | 'unsupported' | 'rate_limited' | 'unavailable' | 'unreadable';

/** Textos exactos del backend (`vision/domain/errors.py`) y de la interfaz. */
export const VISION_TEXT = {
  offline: 'El análisis de fotos requiere conexión a internet. Puedes registrar manualmente',
  tooLarge: 'La imagen es demasiado grande',
  unsupported: 'Solo se admiten imágenes JPEG o PNG',
  rateLimited: 'Has alcanzado el límite temporal de análisis de imágenes. Intenta más tarde',
  unavailable: 'El análisis de imágenes no está disponible en este momento',
  unreadable: 'No se pudo leer la foto. Intenta con otra o registra manualmente',
  reviewDraft: 'Revisa los datos detectados en la foto y presiona "Guardar"',
  noAmount: 'No pudimos detectar el monto en la foto. Ingrésalo para continuar',
  nothingDetected: 'No se detectó nada útil en la foto. Intenta con otra o escribe los datos',
  analyzing: 'Analizando la foto...',
  readingFailed: 'No se pudo reproducir lo detectado. Intenta nuevamente',
} as const;

const DEFAULT_MESSAGE: Record<VisionErrorKind, string> = {
  offline: VISION_TEXT.offline,
  too_large: VISION_TEXT.tooLarge,
  unsupported: VISION_TEXT.unsupported,
  rate_limited: VISION_TEXT.rateLimited,
  unavailable: VISION_TEXT.unavailable,
  unreadable: VISION_TEXT.unreadable,
};

export class VisionError extends Error {
  constructor(
    readonly kind: VisionErrorKind,
    message: string = DEFAULT_MESSAGE[kind],
  ) {
    super(message);
  }
}

/** Mensaje para mostrar; cualquier error desconocido se presenta como servicio no disponible. */
export function visionMessage(e: unknown): string {
  return e instanceof VisionError ? e.message : VISION_TEXT.unavailable;
}
