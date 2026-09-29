# Carpintería Ordenada 360° · Frontend

React + TypeScript + Vite. Sirve la pantalla técnica de la fase **Foundation**.

## Requisitos

- Docker Desktop con Compose v2
- Node.js 22+ (solo si quieres correr el frontend fuera de Docker)

## Arranque (recomendado)

Desde este repositorio:

```bash
docker compose up --build
```

Levanta `frontend`, `backend` y `postgres`. El único puerto publicado es:

| URL | Contenido |
| --- | --- |
| http://localhost:8080 | frontend |
| http://localhost:8080/api/* | backend (proxy) |
| http://localhost:8080/api/health | health del backend |

## Desarrollo con hot reload

`compose.yml` (modo dev) ejecuta `vite` y `nest/nodemon` con los fuentes
montados en vivo:

- Frontend: Vite con `server.watch.usePolling` (los eventos inotify no cruzan
  el bind mount de Docker Desktop en Windows).
- Backend: `nodemon --legacy-watch` (polling) que recompila y reinicia Nest.

Edita un archivo y recarga el navegador: el cambio se sirve solo.

## Modo producción

```bash
docker compose -f compose.prod.yml up --build
```

Mismo puerto 8080, pero sirviendo el build estático desde nginx
(`docker/nginx.conf`): `/` → SPA, `/api` → `backend:3000`.

## Comandos sin Docker

```bash
npm install
npm run dev         # vite en 5173 con proxy /api -> localhost:3000
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
```

El backend se ejecuta en `C:\Users\anthg\Bcarpinteria` con `npm run start:dev`.

## Variables de entorno

Copia `.env.example` a `.env` (no se commitea):

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: las usa Compose.
- `APP_ENV`: entorno reportado por el backend (`LOCAL`).
- `VITE_API_BASE`: base de las llamadas al API (`/api`).
- `VITE_PROXY_TARGET`: destino del proxy de Vite en dev.

El frontend **nunca** llama a `localhost:3000` de forma fija: usa
`VITE_API_BASE` con el valor por defecto `/api`.

## Estado actual

Pantalla temporal que muestra `Carpintería Ordenada 360°`, `Frontend`,
`Backend`, `PostgreSQL`, `Entorno` y `Excel`, tomando backend/base de datos
desde `GET /api/health` (sondeo cada 5 s).

Fuera del alcance de esta fase: login, roles, inventario, importación Excel,
clientes, productos, pedidos, producción, cortes, QR, PDF, notificaciones y
Supabase.
