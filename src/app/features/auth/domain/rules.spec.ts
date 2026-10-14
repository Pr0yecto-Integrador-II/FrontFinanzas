import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  confirmationError,
  currencyLabel,
  emailError,
  normalizeEmail,
  passwordError,
} from './rules';

describe('Auth Domain Rules (HU01 & HU02)', () => {
  describe('normalizeEmail', () => {
    it('elimina espacios en blanco y convierte a minúsculas', () => {
      expect(normalizeEmail('  Usuario@Ejemplo.COM  ')).toBe('usuario@ejemplo.com');
    });
  });

  describe('emailError', () => {
    it('retorna error cuando el correo está vacío', () => {
      expect(emailError('')).toBe('Escribe tu correo');
      expect(emailError('   ')).toBe('Escribe tu correo');
    });

    it('retorna error cuando el formato es inválido', () => {
      expect(emailError('sin-arroba')).toBe('Escribe un correo válido');
      expect(emailError('usuario@')).toBe('Escribe un correo válido');
      expect(emailError('@dominio.com')).toBe('Escribe un correo válido');
      expect(emailError('usuario@dominio')).toBe('Escribe un correo válido');
    });

    it('retorna null cuando el correo es válido', () => {
      expect(emailError('juan@example.com')).toBeNull();
      expect(emailError('test.user+tag@domain.co')).toBeNull();
    });
  });

  describe('passwordError (HU01: 8 a 128 caracteres, letra y número)', () => {
    it('rechaza contraseñas con menos de 8 caracteres', () => {
      expect(passwordError('Abc1')).toBe('Usa al menos 8 caracteres');
    });

    it('rechaza contraseñas de más de 128 caracteres', () => {
      const longPass = 'A1' + 'a'.repeat(127);
      expect(passwordError(longPass)).toBe('Usa máximo 128 caracteres');
    });

    it('rechaza contraseñas sin números', () => {
      expect(passwordError('SoloLetrasSeguras')).toBe(
        'La contraseña debe tener al menos una letra y un número',
      );
    });

    it('rechaza contraseñas sin letras', () => {
      expect(passwordError('1234567890')).toBe(
        'La contraseña debe tener al menos una letra y un número',
      );
    });

    it('acepta contraseñas válidas con letras y números', () => {
      expect(passwordError('Secreto123')).toBeNull();
      expect(passwordError('MiClaveSegura2026!')).toBeNull();
    });
  });

  describe('confirmationError', () => {
    it('retorna null si las contraseñas coinciden exactamente', () => {
      expect(confirmationError('Clave123', 'Clave123')).toBeNull();
    });

    it('retorna error si las contraseñas difieren', () => {
      expect(confirmationError('Clave123', 'Clave456')).toBe('Las contraseñas no coinciden');
    });
  });

  describe('Monedas soportadas', () => {
    it('incluye COP como moneda por defecto', () => {
      expect(DEFAULT_CURRENCY).toBe('COP');
      expect(CURRENCIES).toContain('COP');
    });

    it('currencyLabel formatea el código con nombre legible', () => {
      const label = currencyLabel('COP');
      expect(label).toContain('COP');
    });
  });
});
