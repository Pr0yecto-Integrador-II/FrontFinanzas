import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../core/api';
import { AuthService } from '../../../core/auth.service';
import { SyncService } from '../../../core/sync.service';
import { LoginPage } from './login.page';

describe('LoginPage (Integration Test: Componente + Formulario + Servicios)', () => {
  let fixture: ComponentFixture<LoginPage>;
  let authServiceMock: {
    login: ReturnType<typeof vi.fn>;
    expired: ReturnType<typeof signal<boolean>>;
  };
  let syncServiceMock: {
    offline: ReturnType<typeof signal<boolean>>;
  };
  let router: Router;

  beforeEach(async () => {
    authServiceMock = {
      login: vi.fn(),
      expired: signal(false),
    };
    syncServiceMock = {
      offline: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
        { provide: SyncService, useValue: syncServiceMock },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('renderiza el título y los campos del formulario iniciales', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Inicia sesión');
    expect(el.querySelector('input#email')).not.toBeNull();
    expect(el.querySelector('input#password')).not.toBeNull();
    expect(el.querySelector('button[type="submit"]')?.textContent).toContain('Iniciar sesión');
  });

  it('muestra mensajes de validación cuando se envía el formulario vacío', async () => {
    const submitBtn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Escribe tu correo');
    expect(el.textContent).toContain('Escribe tu contraseña');
    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('permite alternar la visibilidad de la contraseña al hacer clic en el botón de ver/ocultar', () => {
    const passwordInput = fixture.nativeElement.querySelector('input#password') as HTMLInputElement;
    const toggleBtn = fixture.nativeElement.querySelector('button.toggle') as HTMLButtonElement;

    expect(passwordInput.type).toBe('password');
    toggleBtn.click();
    fixture.detectChanges();
    expect(passwordInput.type).toBe('text');

    toggleBtn.click();
    fixture.detectChanges();
    expect(passwordInput.type).toBe('password');
  });

  it('envía los datos normalizados y navega a la raíz cuando las credenciales son válidas', async () => {
    authServiceMock.login.mockResolvedValueOnce(undefined);

    const emailInput = fixture.nativeElement.querySelector('input#email') as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector('input#password') as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    emailInput.value = '  USUARIO@Ejemplo.com  ';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'MiClaveSegura123';
    passwordInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(authServiceMock.login).toHaveBeenCalledWith('usuario@ejemplo.com', 'MiClaveSegura123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('muestra banner de error 401 si las credenciales son incorrectas', async () => {
    const error401 = new ApiError(401, 'Unauthorized', 'Correo o contraseña incorrectos');
    authServiceMock.login.mockRejectedValueOnce(error401);

    const emailInput = fixture.nativeElement.querySelector('input#email') as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector('input#password') as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    emailInput.value = 'usuario@ejemplo.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'ClaveEquivocada1';
    passwordInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.banner.error');
    expect(banner?.textContent).toContain('Correo o contraseña incorrectos');
  });

  it('deshabilita el botón de inicio cuando el estado es offline', () => {
    syncServiceMock.offline.set(true);
    fixture.detectChanges();

    const submitBtn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('El primer inicio de sesión en cada dispositivo necesita internet');
  });
});
