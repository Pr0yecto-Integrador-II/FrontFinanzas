import { expect, test } from '@playwright/test';

test.describe('Pruebas de Aceptación: Flujo de Autenticación y Navegación (HU01 & HU02)', () => {
  test.beforeEach(async ({ page }) => {
    // Interceptar llamadas al backend por defecto para no depender de un servidor externo
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
  });

  test('Criterio de Aceptación: Redirección automática a /ingresar si no hay sesión iniciada', async ({ page }) => {
    // Al intentar entrar a la raíz o rutas privadas sin token, debe proteger la vista
    await page.goto('/');
    await expect(page).toHaveURL(/.*ingresar/);
    await expect(page.locator('h1')).toContainText('Inicia sesión');
  });

  test('Criterio de Aceptación (HU02): Validación visual en formulario de inicio de sesión', async ({ page }) => {
    await page.goto('/ingresar');

    // Intentar enviar con campos vacíos
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Deben aparecer los mensajes de validación
    await expect(page.getByText('Escribe tu correo')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña')).toBeVisible();

    // Escribir correo inválido
    await page.locator('input#email').fill('correo-invalido');
    await submitBtn.click();
    await expect(page.getByText('Escribe un correo válido')).toBeVisible();
  });

  test('Criterio de Aceptación: Alternar visibilidad de la contraseña', async ({ page }) => {
    await page.goto('/ingresar');
    const passwordInput = page.locator('input#password');
    const toggleBtn = page.locator('button.toggle');

    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Clic para mostrar contraseña
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Clic para ocultar contraseña
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('Criterio de Aceptación (HU02): Manejo de error 401 por credenciales incorrectas', async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'InvalidCredentials',
          message: 'Correo o contraseña incorrectos',
        }),
      });
    });

    await page.goto('/ingresar');
    await page.locator('input#email').fill('usuario@ejemplo.com');
    await page.locator('input#password').fill('ClaveIncorrecta123');
    await page.locator('button[type="submit"]').click();

    // Debe mostrar banner de error
    const errorBanner = page.locator('.banner.error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Correo o contraseña incorrectos');
  });

  test('Criterio de Aceptación (HU01): Formulario de registro y validación de coincidencia de contraseñas', async ({ page }) => {
    await page.goto('/registro');
    await expect(page.locator('h1')).toContainText('Crea tu cuenta');

    // Llenar datos con contraseñas que no coinciden
    await page.locator('input#email').fill('nuevo@ejemplo.com');
    await page.locator('input#password').fill('PasswordSeguro123');
    await page.locator('input#confirm').fill('OtraPassword456');

    // Mueve el foco o envía para activar la validación
    await page.locator('input#confirm').blur();
    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
  });

  test('Criterio de Aceptación (PWA/Offline): Detección de desconexión en pantalla de acceso', async ({ page, context }) => {
    await page.goto('/ingresar');
    await page.waitForLoadState('networkidle');

    // Emular corte de conexión de red
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Debe mostrar banner informativo indicando necesidad de internet
    await expect(
      page.getByText('El primer inicio de sesión en cada dispositivo necesita internet'),
    ).toBeVisible();

    // El botón debe deshabilitarse para evitar acciones fallidas
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
  });
});
