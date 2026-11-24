import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, ApiError } from '../api';
import { SyncService } from '../sync.service';
import { ImageResizer, MAX_SIDE_PX, fitWithin } from './image-resizer';
import { VISION_TEXT, VisionError, visionMessage } from './vision-errors';
import { VisionService } from './vision.service';

const PHOTO = new Blob(['foto'], { type: 'image/jpeg' });
const RESIZED = new Blob(['chica'], { type: 'image/jpeg' });

class FakeResizer extends ImageResizer {
  override async resize(): Promise<Blob> {
    return RESIZED;
  }
}

describe('VisionService (HU20)', () => {
  const online = signal(true);
  const analyzeImage = vi.fn();

  beforeEach(() => {
    online.set(true);
    analyzeImage.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { analyzeImage } },
        { provide: SyncService, useValue: { online } },
        { provide: ImageResizer, useClass: FakeResizer },
      ],
    });
  });

  it('envía la foto reducida y traduce la respuesta al formato del dominio', async () => {
    analyzeImage.mockResolvedValue({
      ocr_lines: ['TOTAL 45.900'],
      tags: [{ name: 'food', confidence: 0.9 }],
      caption: 'a plate of food',
    });
    const result = await TestBed.inject(VisionService).analyze(PHOTO);
    expect(analyzeImage).toHaveBeenCalledWith(RESIZED);
    expect(result).toEqual({
      ocrLines: ['TOTAL 45.900'],
      tags: [{ name: 'food', confidence: 0.9 }],
      caption: 'a plate of food',
    });
  });

  it('sin conexión no llama a la API (D3-07)', async () => {
    online.set(false);
    await expect(TestBed.inject(VisionService).analyze(PHOTO)).rejects.toMatchObject({
      kind: 'offline',
      message: VISION_TEXT.offline,
    });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'offline'],
    [413, 'too_large'],
    [415, 'unsupported'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [500, 'unavailable'],
  ])('el estado %i se traduce a "%s"', async (status, kind) => {
    analyzeImage.mockRejectedValue(new ApiError(status, 'X', 'x'));
    await expect(TestBed.inject(VisionService).analyze(PHOTO)).rejects.toMatchObject({ kind });
  });

  it('un error desconocido se presenta como servicio no disponible', async () => {
    analyzeImage.mockRejectedValue(new Error('boom'));
    await expect(TestBed.inject(VisionService).analyze(PHOTO)).rejects.toBeInstanceOf(VisionError);
    expect(visionMessage(new Error('boom'))).toBe(VISION_TEXT.unavailable);
  });

  it('los textos de error coinciden con los del backend', () => {
    expect(new VisionError('rate_limited').message).toBe(
      'Has alcanzado el límite temporal de análisis de imágenes. Intenta más tarde',
    );
    expect(new VisionError('unavailable').message).toBe(
      'El análisis de imágenes no está disponible en este momento',
    );
  });
});

describe('fitWithin', () => {
  it('reduce el lado mayor a 1600 px conservando la proporción', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_SIDE_PX, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: MAX_SIDE_PX });
  });

  it('nunca agranda una foto pequeña', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
