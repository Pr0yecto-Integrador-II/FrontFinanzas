import { Injectable } from '@angular/core';

/** Fuente única del tiempo. El dominio la recibe por parámetro; nunca llama a `new Date()`. */
export abstract class Clock {
  abstract now(): Date;

  /** Fecha local de hoy como `YYYY-MM-DD`. */
  today(): string {
    return toIsoDate(this.now());
  }
}

@Injectable({ providedIn: 'root' })
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
