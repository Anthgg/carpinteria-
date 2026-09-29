# Carpintería Ordenada 360° — Frontend V1

Interfaz React + TypeScript + Vite para administrar pedidos y coordinar el trabajo del taller. La API NestJS vive en el repositorio hermano `Bcarpinteria`; PostgreSQL permanece dentro del Compose local aprobado.

## Arranque

Desde esta carpeta:

```powershell
docker compose up --build
```

La aplicación está en <http://127.0.0.1:8080>; la API usa el prefijo `/api`. El puerto de PostgreSQL no se publica al host. El volumen `carpinteria_pgdata` conserva los datos y `carpinteria_uploads` conserva las fotografías.

Si aún no hay usuarios, crea una cuenta local con variables de entorno temporales (sin guardar credenciales en archivos versionados):

```powershell
$env:SEED_ADMIN_EMAIL = 'admin@local.test'
$env:SEED_ADMIN_PASSWORD = '<contraseña propia de 12 o más caracteres>'
docker compose exec -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD backend npm run seed
Remove-Item Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD
```

La guía completa del backend y los roles está en `Bcarpinteria/README.md`.

## Pantallas

- **Resumen:** pedidos activos/listos, producción por etapa, incidencias abiertas, alertas de stock y movimientos recientes.
- **Inventario:** importa después de revisar el Excel, crea y edita artículos, administra stock y unidades físicas, y decide si cada retazo se conserva o descarta.
- **Clientes y productos:** búsqueda, alta y edición. El catálogo no fija materiales; cada pedido define lo que se fabricará.
- **Pedidos:** carrito con varias líneas (catálogo, mueble personalizado o material vendible), dimensiones en mm/cm/m, cotización del servidor, pagos manuales, ficha PDF + QR, WhatsApp manual y enlace de seguimiento.
- **Producción:** componentes y piezas por línea del pedido, planos SVG de sugerencia de corte, reserva/consumo, etapas e historial, pausas, notas internas/públicas, incidencias y fotos públicas u ocultas.
- **Seguimiento público:** `/seguimiento/<token>` sin cuenta de cliente, con estado, producto, porcentaje, timeline y contenido público. Web Push solo solicita permiso al pulsar “Activar notificaciones”.
- **Configuración y usuarios:** IGV, kerf, datos del taller, cuentas, rol y estado activo.

El menú se filtra por rol: `TESTER` tiene todos los permisos, `ADMIN` administra el taller y `OPERARIO` trabaja con producción e inventario. El backend repite cada control de autorización.

## Desarrollo

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

Sin Docker, Vite escucha en 5173 y usa `VITE_PROXY_TARGET` para `/api`. Para la URL única 8080 y la persistencia local, usa el Compose del proyecto. No se necesita ni modifica el archivo Excel fuente.

## Configuración

Compose interpola `Carpinteria/.env` (ejemplo en `.env.example`). El backend usa `JWT_SECRET` estable para conservar sesiones entre reinicios; si se omite en desarrollo, usa una clave efímera. Las notificaciones requieren `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`, y quedan apagadas si no están configuradas.

`compose.prod.yml` conserva el mismo puerto `127.0.0.1:8080`, sirve los archivos compilados desde nginx, exige `JWT_SECRET` y usa sus propios volúmenes persistentes. V1 sigue siendo local y no incluye despliegue cloud.
