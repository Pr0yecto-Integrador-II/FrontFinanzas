/** Resultado del análisis de una imagen (HU20), ya en el formato del dominio. */
export interface ImageTag {
  /** Minúsculas, normalmente en inglés ("food"). */
  name: string;
  /** Entre 0 y 1. */
  confidence: number;
}

export interface ImageAnalysis {
  ocrLines: string[];
  tags: ImageTag[];
  caption: string | null;
}
