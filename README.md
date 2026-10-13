# FrontFinanzas

PWA en Angular para el control de finanzas personales. Funciona sin conexión: los datos viven en el navegador (Dexie / IndexedDB) y se sincronizan con [BackFinanzas](../BackFinanzas) mediante `POST /sync/push` y `GET /sync/pull`.

Fuente de verdad del producto: `BackFinanzas/BLUEPRINT.md` (historias HU01–HU15, modelo de datos y API).

## Comandos

```bash
npm install
npm start            # http://localhost:4200 (API en http://localhost:8000)
npm run lint
npm test -- --no-watch
npm run build
```

Para tener la API real: en `BackFinanzas`, `docker compose up -d` y después, dentro de `backend/`, `uv run alembic upgrade head`, `uv run uvicorn app.main:app` y el worker de ARQ para el correo de recuperación. El CORS del backend solo admite `http://localhost:4200` (variable `FRONTEND_URL`).

## Estructura

```
src/app/
  core/        sesión, interceptor (refresh serializado), Dexie, outbox, sincronización, reloj, dinero y fechas
  shared/      componentes y servicios reutilizables (toast, diálogos, pipe de dinero…)
  layout/      shell responsive: barra lateral (escritorio) y barra inferior con «+» (móvil)
  features/<funcionalidad>/{pages,components,data,domain}
```

Reglas de capas (AGENTS.md del backend): el dominio es TypeScript puro; los componentes nunca usan `HttpClient` ni Dexie, todo pasa por repositorios; toda escritura va a Dexie y al `outbox` **en la misma transacción** (`core/local-store.ts`).

## Contrato con el backend

- Montos en enteros de centavos (`amount_minor`). `version` solo la pone el servidor.
- Refresh token en cookie httpOnly con `Path=/auth`: las peticiones llevan `withCredentials`. Los refresh se serializan (D-27).
- Categorías, movimientos, recurrentes y presupuestos viajan solo por `/sync/*`. Íconos y colores: `features/categorias/domain/catalog.ts` replica `categories/domain/catalog.py`; si cambia uno, cambia el otro.
- `name_key` se calcula igual que en el servidor (NFKD, minúsculas, sin tildes).

## Diseño

Tokens en `src/styles.scss` (`--c-*`): verde pino, modo claro/oscuro automático o elegido en Ajustes. Tipografías locales (Bricolage Grotesque para cifras y títulos, Figtree para texto) y Material Symbols; todo se sirve desde el propio origen para que funcione sin conexión.

## Pendiente / notas

- Deslizar para eliminar en el historial (HU07) no está; se elimina desde el detalle del movimiento, con «Deshacer» 5 s.
- Al tocar una etiqueta en el detalle (HU10) aún no se abre el historial filtrado; el filtro por etiqueta está en Filtros (`FiltersState.showTag` ya existe).
- Verificado contra un simulacro del contrato, no contra el backend real (sin Docker en la máquina de desarrollo). Conviene un recorrido completo con la API real.
