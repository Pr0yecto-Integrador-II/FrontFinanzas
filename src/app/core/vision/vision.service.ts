import { Injectable, inject } from '@angular/core';
import { Api, ApiError } from '../api';
import { SyncService } from '../sync.service';
import { ImageAnalysis } from './image-analysis';
import { ImageResizer } from './image-resizer';
import { VisionError } from './vision-errors';

/**
 * Análisis de fotos de compras y recibos (HU20). Solo transporte y traducción de errores:
 * interpretar lo leído es del dominio (`features/movimientos/domain/receipt.ts`).
 * La foto y el resultado viven solo en memoria: nunca se guardan en Dexie ni en el outbox.
 */
@Injectable({ providedIn: 'root' })
export class VisionService {
  private readonly api = inject(Api);
  private readonly sync = inject(SyncService);
  private readonly resizer = inject(ImageResizer);

  /** Sin conexión no llama a la API (D3-07): el registro manual sigue disponible. */
  async analyze(file: Blob): Promise<ImageAnalysis> {
    if (!this.sync.online()) throw new VisionError('offline');
    const image = await this.resizer.resize(file);
    try {
      const res = await this.api.analyzeImage(image);
      return {
        ocrLines: res.ocr_lines,
        tags: res.tags.map((t) => ({ name: t.name, confidence: t.confidence })),
        caption: res.caption,
      };
    } catch (e) {
      throw toVisionError(e);
    }
  }
}

export function toVisionError(e: unknown): VisionError {
  if (e instanceof VisionError) return e;
  if (e instanceof ApiError) {
    if (e.offline) return new VisionError('offline');
    if (e.status === 413) return new VisionError('too_large');
    if (e.status === 415) return new VisionError('unsupported');
    if (e.status === 429) return new VisionError('rate_limited');
  }
  return new VisionError('unavailable');
}
