/**
 * Producción. La cookie de refresh es `Path=/auth`, así que la API debe servirse
 * en la raíz del mismo origen (proxy inverso) o en un origen permitido por CORS.
 * La URL de la API no es un secreto; se ajusta al desplegar.
 */
export const environment = {
  production: true,
  apiUrl: '',
};
