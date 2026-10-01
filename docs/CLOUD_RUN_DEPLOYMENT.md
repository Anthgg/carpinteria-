# Despliegue en Google Cloud Run

Producción pública de Ordenada 360: **un único servicio Cloud Run** con dos contenedores, Supabase PostgreSQL y Supabase Storage. No contiene secretos: los valores reales viven en Secret Manager y en `Bcarpinteria/.env.supabase` (ignorado por Git).

## Arquitectura

```
Navegador ──HTTPS──▶ Cloud Run "ordenada-360" (us-east5)
                      ├─ frontend  (ingress, :8080)  nginx: SPA + /api → 127.0.0.1:3000
                      └─ backend   (sidecar, :3000)  NestJS ──▶ Supabase PostgreSQL (pooler 6543, us-east-2)
                                                            └─▶ Supabase Storage (bucket privado)
```

- **Una sola URL pública.** El backend no tiene endpoint propio, así que frontend, API, cookies, QR y seguimiento comparten el mismo origen.
- **Red compartida.** Los dos contenedores comparten la red de la instancia: nginx usa `127.0.0.1:3000`, no `backend:3000` como en Compose (`docker/nginx.cloudrun.conf` frente a `docker/nginx.conf`).
- **Orden de arranque.** El backend arranca primero (`run.googleapis.com/container-dependencies`). Tiene un *startup probe* `GET /api/health` en `:3000`, que es de solo lectura y no escribe en SystemProbe.
- **Región `us-east5` (Columbus).** Está junto a Supabase (AWS `us-east-2`, Ohio): se eligió por cercanía a la base de datos, no a los usuarios.

| Recurso | Valor |
|---|---|
| Proyecto GCP | `ordenada-360-1a2290` (dedicado; facturación vinculada) |
| Servicio | `ordenada-360`, región `us-east5` |
| URL | `https://ordenada-360-1026267815717.us-east5.run.app` (también responde la URL heredada `*.a.run.app`) |
| Imágenes | Artifact Registry `us-east5-docker.pkg.dev/ordenada-360-1a2290/ordenada360/{backend,frontend}:<commit>`, desplegadas por digest |
| Service account | `ordenada-360-runtime`: sin roles de proyecto, solo `secretmanager.secretAccessor` sobre sus 4 secretos |
| APIs habilitadas | Cloud Run, Artifact Registry, Secret Manager, Cloud Billing (sin Cloud Build, Cloud SQL, GKE, VM, LB ni CDN) |
| Escalado | min 0, max 3, concurrencia 40, timeout 60 s |
| Recursos | backend 1 vCPU / 512 MiB · frontend 0,5 vCPU / 256 MiB |

## Configuración del backend en Cloud Run

| Variable | Origen | Valor / nota |
|---|---|---|
| `DATABASE_URL` | Secret `ordenada-database-url` v1 | Transaction Pooler `:6543`, `pgbouncer=true&connection_limit=1&sslmode=require` |
| `SUPABASE_SECRET_KEY` | Secret `ordenada-supabase-secret-key` v1 | Solo backend |
| `JWT_SECRET` | Secret `ordenada-jwt-secret` v1 | El del entorno remoto; si se rota, se cierran todas las sesiones |
| `VAPID_PRIVATE_KEY` | Secret `ordenada-vapid-private-key` v1 | Mismo par VAPID del entorno remoto |
| `APP_ENV` | variable | `PRODUCTION`: la API exige pooler 6543, `STORAGE_DRIVER=supabase` y que no haya `DIRECT_URL` |
| `STORAGE_DRIVER`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` | variable | `supabase`, URL del proyecto, `production-photos` |
| `PUBLIC_BASE_URL`, `CORS_ORIGINS` | variable | La URL pública. QR, avisos y CSRF la usan |
| `TRUST_PROXY_HOPS` | variable | `2` (Google Front End + nginx), para que `req.ip` y el límite de intentos de login vean al cliente real |
| `UPLOAD_DIR` | variable | `/tmp/uploads`: solo temporal mientras se sube la foto; nada persiste en disco |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `PUSH_TEST_ORDER_CODES` | variable | No secretos |

Ni `DIRECT_URL` ni el Excel llegan al contenedor. En producción la importación desde Excel está deshabilitada: la API responde 400 con una explicación y el botón aparece deshabilitado.

**Seguridad de la sesión:**
- Las cookies son `HttpOnly`, `Secure` (por `NODE_ENV=production`) y `SameSite=Lax`.
- La protección CSRF compara el `Origin` con la URL pública.
- Los errores devuelven mensajes de la aplicación (por ejemplo, 404 «Producción no encontrada.»), sin trazas de Prisma ni respuestas internas de Supabase.

## Antes de desplegar: migraciones (paso deliberado)

El runtime nunca migra: `start:prod` y la imagen solo ejecutan `node dist/main.js`. Desde `Bcarpinteria`:

```powershell
npm run db:supabase:status    # debe decir "Database schema is up to date!"
# Solo si hay migraciones nuevas y revisadas:
$env:SUPABASE_MIGRATE_CONFIRM = 'YES'; npm run db:supabase:deploy; Remove-Item Env:SUPABASE_MIGRATE_CONFIRM
```

Estos comandos usan `DIRECT_URL` (Session Pooler 5432) y rechazan el pooler 6543.

## Desplegar o actualizar una revisión

Desde `Carpinteria`, con `gcloud` autenticado y Docker:

```powershell
./scripts/deploy-cloud-run.ps1 -ProjectId ordenada-360-1a2290 `
  -PublicBaseUrl https://ordenada-360-1026267815717.us-east5.run.app -Build
```

El script:
1. Exige los dos repositorios sin cambios: las imágenes se etiquetan con el commit de cada uno.
2. Con `-Build`, construye `backend` (target `production`) y `frontend` (target `cloudrun`), y los sube a Artifact Registry.
3. Ejecuta `db:supabase:status` y **aborta** si el esquema no está al día. No migra.
4. Renderiza `deploy/cloudrun/service.template.yaml`, que referencia los secretos por nombre y versión fija, y ejecuta `gcloud run services replace` con las imágenes por digest.
5. Con `-AllowPublic` (solo la primera vez) concede `roles/run.invoker` a `allUsers`. La autorización de usuarios, roles y seguimiento la hace la aplicación.

Para rotar un secreto, primero añade una versión nueva: `gcloud secrets versions add <secreto> --data-file=-` (desde stdin, sin imprimirla). Después despliega con `-DatabaseUrlVersion`, `-SupabaseSecretKeyVersion`, `-JwtSecretVersion` o `-VapidPrivateKeyVersion` apuntando a ella. No se usa `latest`.

## Smoke posterior (sin escribir datos)

Comprobar, en este orden:
1. `GET /` → 200 y los recursos de `/assets` → 200.
2. Las rutas SPA (`/pedidos`, `/seguimiento/…`) → 200.
3. `GET /api/health` → 200, con `PRODUCTION`, `PostgreSQL (Supabase)` y storage `supabase/conectado`.
4. Login ADMIN y dashboard. Que la cabecera muestre **PRODUCCIÓN**.
5. Seguimiento de un pedido conocido:
   - la foto pública → 200;
   - la foto interna → 404;
   - una foto interna pedida sin sesión → 401.
6. El PDF, y decodificar su QR: debe apuntar a `https://…run.app/seguimiento/<token>`.
7. Logs, sin secretos ni 5xx:

   ```powershell
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="ordenada-360"' --project ordenada-360-1a2290 --freshness=1h
   ```

**Logs:** nginx no escribe *access log* en Cloud Run. Aun así, el *request log* de la propia plataforma registra la URL completa, incluido el token de seguimiento: solo es visible para quien tiene acceso al proyecto, así que ese acceso debe mantenerse restringido.

## Rollback

| Nivel | Cómo |
|---|---|
| Revisión | `gcloud run revisions list --service ordenada-360 --region us-east5 --project ordenada-360-1a2290` y luego `gcloud run services update-traffic ordenada-360 --to-revisions <REVISIÓN_ANTERIOR>=100 --region us-east5 --project ordenada-360-1a2290` |
| Código | Tag `a018-cloud-run-freeze` (despliegue actual) o `a017-supabase-runtime-freeze` (antes de Cloud Run): checkout + redeploy con el script |
| Datos | Supabase no se toca en un rollback de revisión. Una migración nueva se revierte con su propia migración, nunca con `db push` |
| Local | El stack LOCAL (`npm run stack:local`), los volúmenes `carpinteria_pgdata` y `carpinteria_uploads` y los backups siguen intactos |

## Rendimiento medido (A018, latencia dentro de Google, mediana en caliente)

| Ruta | A017 (Lima → Ohio) | Cloud Run us-east5 |
|---|---|---|
| login | ~3,5 s | ~1,0 s |
| dashboard (15 consultas) | ~7 s | ~1,36 s |
| pedidos | 3–5 s | ~0,53 s |
| producción (lista) | ~1,9 s | ~0,39 s |
| detalle de producción (20 consultas) | 4–6 s | ~1,0 s |
| seguimiento | ~1,6 s | ~0,33 s |
| health | — | ~0,13 s |

**Arranque en frío** (min 0, desde instancia en cero): la primera petición tarda **~6,6 s**, y las siguientes ~0,5 s. El arranque de contenedores (p99) es de ~11,5 s según Cloud Monitoring. Memoria p99 ≤ 31 % y CPU p99 ≤ 11 % de los límites.

**Deuda abierta:**
- **Coste por consulta:** sigue siendo de ~70–90 ms, por el enlace Google→AWS, el Transaction Pooler de Supavisor y `connection_limit=1`, que pone en serie las consultas paralelas. Si hace falta bajarlo, revisar en este orden:
  1. reducir consultas de autenticación por petición;
  2. agrupar los `include` de Prisma;
  3. evaluar `connection_limit` > 1 frente al plan de Supabase.
- **Tamaño de la imagen del backend:** ~760 MB, porque `prisma` y `typescript` llegan como *peer dependencies* de `@prisma/client`.

## Costes

Solo se usan Cloud Run (min 0, se cobra por uso), Artifact Registry (almacenamiento de imágenes), Secret Manager (4 secretos) y logging. No hay Cloud SQL, GKE, VM, balanceador, CDN ni dominio. Antes de subir `min instances` a 1 (para evitar el arranque en frío de la demo), compara el coste mensual de una instancia siempre activa con la molestia del arranque medido.
