import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Convierte una función de dominio `(valor) => mensaje | null` en un validador de formulario. */
export function msgValidator(fn: (value: string) => string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const msg = fn(String(c.value ?? ''));
    return msg ? { msg } : null;
  };
}

/** Mensaje de error visible: solo después de tocar el campo o de intentar enviar. */
export function errorOf(c: AbstractControl | null, force = false): string | null {
  if (!c || !c.errors || !(c.touched || c.dirty || force)) return null;
  return (c.errors['msg'] as string | undefined) ?? 'Valor no válido';
}
