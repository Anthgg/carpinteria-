# Modos de ejecución: LOCAL y SUPABASE QA

La misma aplicación (Vite + NestJS en Docker, en `http://127.0.0.1:8080`) puede ejecutarse contra dos infraestructuras de datos. Para cambiar de una a otra se usa un comando; no se edita ningún `.env`.

| | LOCAL (por defecto) | SUPABASE QA |
|---|---|---|
| Comando (desde `Carpinteria`) | `npm run stack:local` = `docker compose up -d` | `npm run stack:supabase` = `docker compose -f compose.yml -f compose.supabase.yml up -d` |
| Base de datos | PostgreSQL del contenedor `postgres` (volumen `carpinteria_pgdata`) | Supabase PostgreSQL vía **Transaction Pooler (6543)** |
| Fotografías | `STORAGE_DRIVER=local`, volumen `carpinteria_uploads` | `STORAGE_DRIVER=supabase`, bucket privado `production-photos` |
| Variables del backend | `Bcarpinteria/.env` + `compose.yml` | Solo `Bcarpinteria/.env.supabase` (ignorado por Git) + `compose.supabase.yml` |
| Migraciones al arrancar | `prisma migrate deploy` (local) | **Ninguna** (`start:dev:remote`) |
| `APP_ENV` / indicador | `LOCAL` | `SUPABASE` / «SUPABASE QA» |

> **Desde A018, Supabase es también la base de PRODUCCIÓN** (Cloud Run, ver `docs/CLOUD_RUN_DEPLOYMENT.md`). El modo SUPABASE QA local lee y escribe **los mismos datos** que la URL pública. Úsalo solo para diagnóstico y con pedidos marcados como QA.

SUPABASE QA ejecuta la app en la máquina local, no en Cloud Run: sigue en HTTP local (`NODE_ENV=development`, cookies sin `secure`), `PUBLIC_BASE_URL=http://127.0.0.1:8080` y CORS solo para `127.0.0.1/localhost:8080`. Los QR, avisos y seguimiento apuntan a la máquina local.

## Cómo saber en qué entorno estás

- **Interfaz:** junto al avatar, en la cabecera interna, aparece `LOCAL` (gris) o `SUPABASE QA` (ámbar). El *tooltip* indica la base y el almacenamiento. El seguimiento público no lo muestra.
- **API:** `GET /api/health` devuelve `environment`, `database.provider` (`PostgreSQL (Docker local)` o `PostgreSQL (Supabase)`) y `storage` (`driver` y `status`). Es de solo lectura: hace `SELECT 1` y lee la metadata del bucket con caché de 60 s. Nunca muestra host, usuario, cadena de conexión, project ref ni claves.
- **Logs del backend:** `Fotografías: almacenamiento local (UPLOAD_DIR)` o `… Supabase Storage (bucket privado)`.

## Qué hace `compose.supabase.yml`

- Reemplaza (`!override`) el `env_file` y el `environment` del backend. Así **no** hereda la `DATABASE_URL` del contenedor local, y las credenciales salen solo de `Bcarpinteria/.env.supabase`, que el override exige (`required: true`).
- Quita la dependencia de `postgres` (`depends_on: !reset`) y le asigna el perfil `local-db`: en modo Supabase no se arranca. Si ya estaba corriendo se deja intacto, lo que permite comparar.
- Vacía `DIRECT_URL` en el runtime: el contenedor de la API nunca recibe la conexión de migraciones.
- Arranca con `npm run start:dev:remote`: el mismo servidor de desarrollo, sin `prisma migrate deploy`.

El backend además se protege solo: con `APP_ENV=SUPABASE` no arranca si `DATABASE_URL` no es el pooler 6543 con `pgbouncer=true`, `sslmode=require` y `connection_limit`.

## Variables (`Bcarpinteria/.env.supabase`)

Copia la plantilla `.env.supabase.example` y complétala a mano. **Nunca** la subas ni la compartas.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Runtime: Transaction Pooler `:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL` | Solo migraciones desde el host: Session Pooler `:5432/postgres?sslmode=require` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage, solo en el backend (`sb_secret_…`) |
| `JWT_SECRET` | Propio de este entorno. Las sesiones no se comparten con LOCAL |
| `VAPID_*`, `PUSH_TEST_ORDER_CODES` | Web Push (opcional) |

`APP_ENV`, `STORAGE_DRIVER`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `UPLOAD_DIR` y `BD_PATH` los fija `compose.supabase.yml`; no son secretos.

## Migraciones en Supabase (deliberadas)

Desde `Bcarpinteria`; siempre usan `DIRECT_URL` (5432) y rechazan el pooler 6543:

```powershell
npm run db:supabase:status                      # lectura: ¿está al día?
$env:SUPABASE_MIGRATE_CONFIRM = 'YES'; npm run db:supabase:deploy; Remove-Item Env:SUPABASE_MIGRATE_CONFIRM
```

Antes de levantar SUPABASE QA tras cambios de esquema: `db:supabase:status` debe decir «Database schema is up to date». Nunca uses `prisma db push`, `migrate dev` ni el seed contra Supabase.

## Aislamiento

- Cada modo escribe solo en su base y en su almacenamiento. Un pedido creado en SUPABASE QA (por ejemplo `PED-00009`) no existe en LOCAL, la `NumberSequence` de cada base avanza por separado y las fotos subidas en Supabase quedan solo en el bucket.
- `AuditLog`, `Session` y `PushSubscription` son propios de cada entorno y ya no se comparan entre sí.
- `scripts/migrate-data-to-supabase.cjs` fue una copia única (A015.3). Ahora aborta porque el destino ya tiene datos; no se vuelve a ejecutar.

## Volver a LOCAL

```powershell
npm run stack:local    # o: docker compose up -d
```

Recrea el backend con `compose.yml`: `APP_ENV=LOCAL`, el contenedor `postgres` y `STORAGE_DRIVER=local`. No hay que borrar nada; los volúmenes `carpinteria_pgdata` y `carpinteria_uploads` no se tocan. Nunca uses `docker compose down -v`.

## Rendimiento observado (A017, desde este equipo hacia us-east-2)

Cada consulta tarda ~250–550 ms de ida y vuelta, y con `connection_limit=1` las consultas en paralelo se ejecutan en serie.
- **Tiempos típicos:**
  - login: ~3,5 s;
  - dashboard: ~7 s (15 consultas);
  - pedidos: ~3–5 s (9 consultas);
  - detalle de producción: ~4–6 s (20 consultas, una por relación incluida);
  - seguimiento: ~1,6 s (6 consultas).
- **No hay N+1** por fila. El tiempo se explica casi entero por la red: en LOCAL, las mismas rutas tardan 50–200 ms.
- **Implicación para Cloud Run:** desplegar la API cerca de la base (GCP `us-east5` Columbus u otra región del este de EE. UU.). No se debe subir `connection_limit` ni los *timeouts* como primera medida.
