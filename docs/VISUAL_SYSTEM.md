# Sistema visual — Carpintería Ordenada 360° (A014.6)

Referencia para quien toque la interfaz. La identidad no cambia: logo, verde bosque, crema, madera/dorado, Fraunces (serif) e IBM Plex Sans/Mono. Esta fase solo reorganiza la presentación; no toca reglas de negocio.

## A. Problemas encontrados

- 11 de 20 pantallas encerraban toda la vista en una sola `.card` (pedidos, clientes, inventario, movimientos, producción y usuarios). Configuración y los formularios de alta eran tarjetas centradas de 980 px con medio monitor vacío.
- La ficha de producción apilaba tarjeta sobre tarjeta (cabecera, pestaña, formulario, tabla).
- Iconos mezclados: `@untitledui/icons` en el menú y caracteres tipográficos (＋ ⌕ ⟳ ▣ Ⅱ ▶ ⌂ ⌁ ▱ ⌑ ✓ ⚠) en botones y estados.
- Estados sin sistema: un spinner genérico para cualquier carga, errores con el texto técnico del servidor, vacíos distintos en cada pantalla, sin espera visible al simular el corte o generar el PDF.

## B. Layout

- **El workspace es la página.** `.page-content` ocupa todo el ancho junto al menú (límite de 1680 px solo para monitores muy anchos).
- Patrón de página: encabezado (eyebrow, H1, descripción, meta y acciones, sin tarjeta) → pestañas → secciones abiertas separadas por un divisor cálido (`--line`).
- Formularios a ancho completo con grid de 4 columnas en escritorio, 2 en tablet y 1 en móvil.

## C. Cards

Se conservan solo para piezas acotadas: KPI, widgets del dashboard, tarjetas del catálogo, resúmenes (totales del pedido, resumen lateral del nuevo pedido, disponibilidad de material), el tablero de corte, las columnas del kanban y el seguimiento público (vista de cliente). Las tablas, formularios, fichas y paneles de producción pasan a secciones abiertas.

## D. Motion

Tokens: `--motion-fast` 140 ms (hover, press), `--motion-base` 200 ms (popovers, cambio de contenido, entrada de página) y `--motion-slow` 240 ms (modales); curva `cubic-bezier(.2,.7,.2,1)`. La entrada de ruta usa fade y 4 px de desplazamiento vertical. Los iconos se mueven solo al interactuar (hover o press), nunca en bucle. `prefers-reduced-motion` desactiva todo movimiento no esencial.

## E. Loading

Un solo juego de componentes (`src/components/feedback`): `Spinner`, `InlineLoader`, `BusyLabel` (botones), `PageLoader` (marca), esqueletos con la forma real (`TableSkeleton`, `DetailSkeleton`, `FormSkeleton` y el del dashboard) y `WaitingState` para procesos con nombre: simular el plano, generar el PDF, subir una foto e importar el Excel. No se muestran porcentajes que el backend no informa.

## F. Errores, vacíos y éxito

`ErrorState` (texto humano y botón «Reintentar»), `EmptyState` (variantes: vacío, sin resultados, fotografías) y `SuccessState` (check que se dibuja). Seis ilustraciones SVG propias en línea que usan los tokens de la marca. Los mensajes técnicos («Failed to fetch», «500») se traducen a lenguaje del taller. Los avisos de éxito siguen en el Toast de HeroUI.

## G. Iconografía

Una sola colección: **Gravity UI Icons** (`@gravity-ui/icons`, MIT), la misma que usan los ejemplos de HeroUI v3. Se centraliza en `src/components/Icon.tsx` con nombres semánticos y una escala fija: 16 en línea, 18 en controles, 20 en el menú, 24 en estados y encabezados, 40 o más en estados vacíos. Color: texto o verde por defecto, madera para advertencia, arcilla para error y verde para éxito.

## H. HeroUI

Se mantienen Autocomplete, Select, ListBox, Drawer, Toast, Tooltip, Alert, AlertDialog, Dropdown y Popover, y se añade Skeleton. Todos consumen los tokens de la marca (`--accent`, `--focus`, `--danger`, etc.), sin azules ni violetas por defecto. No se migran componentes que ya funcionan bien, como los botones con la clase propia `.button`.
