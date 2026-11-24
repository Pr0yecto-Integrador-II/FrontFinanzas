import { Injectable } from '@angular/core';
import { VisionError } from './vision-errors';

/** Lado mayor de la foto que se envía: suficiente para leer un recibo y barato de subir. */
export const MAX_SIDE_PX = 1600;
export const JPEG_QUALITY = 0.85;

/** Dimensiones que caben en `max` conservando la proporción. Nunca agranda. */
export function fitWithin(width: number, height: number, max = MAX_SIDE_PX) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Reduce la foto antes de enviarla (menos datos, menos costo, menos exposición).
 * Es una clase para poder sustituirla en las pruebas: `canvas` no existe en jsdom.
 */
@Injectable({ providedIn: 'root' })
export class ImageResizer {
  async resize(file: Blob): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sin contexto 2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('sin blob'))),
          'image/jpeg',
          JPEG_QUALITY,
        ),
      );
    } catch {
      throw new VisionError('unreadable');
    }
  }
}
