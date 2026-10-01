# Assets y dependencias visuales de terceros

Registro de lo que la interfaz incluye de terceros y bajo qué licencia. No se enlazan assets externos (hotlink): todo se sirve desde el bundle o desde `public/`.

| Asset | Origen | Licencia | Uso en la app |
| --- | --- | --- | --- |
| Gravity UI Icons 2.22.0 (`@gravity-ui/icons`) | https://github.com/gravity-ui/icons | MIT | Única colección de iconos de la interfaz (menú, acciones, estados). Centralizada en `src/components/Icon.tsx`; solo se empaquetan los iconos importados. |
| HeroUI 3 (`@heroui/react`, `@heroui/styles`) | https://github.com/heroui-inc/heroui | MIT | Componentes accesibles: Autocomplete, Select, ListBox, Drawer, Toast, Tooltip, Alert, AlertDialog, Dropdown, Popover y Skeleton. Tematizados con los tokens de `src/index.css`. |
| uPlot (`uplot`) | https://github.com/leeoniya/uPlot | MIT | Gráfico de actividad del dashboard (se carga solo al abrir el Resumen). |
| React Kawaii 1.6.0 (`react-kawaii`) | https://github.com/elizabetdev/react-kawaii | MIT, Copyright Elizabet aka Miuki Miu | Ilustración SVG `Backpack` usada por la mascota contextual Nudo en estados de espera, vacío y recuperación. Solo se importa el componente necesario. Aviso MIT incluido en `THIRD_PARTY_LICENSES/react-kawaii-MIT.md`. |

## Assets propios (sin terceros)

- **Ilustraciones de estado** (`src/components/feedback/Illustrations.tsx`): vacío, sin resultados, error, éxito, corte en espera y documento en espera. SVG originales de este proyecto, animados con CSS y coloreados con los tokens de la marca. No requieren atribución.
- **Mascota contextual Nudo** (`src/components/feedback/WorkshopGuide.tsx`): componente `Backpack` de React Kawaii con verde bosque, texto estático y animación de entrada breve. No usa chat, servicios externos ni movimiento en bucle.
- **Spinner y cargador de marca** (mismo archivo): SVG originales. No se copió código de terceros; se evaluó `svg-spinners` (MIT) pero no hizo falta.
- **Logo** (`public/brand/carpinteria-360-logo.png`): propiedad de Carpintería Ordenada 360°.

## Tipografías

La interfaz declara Fraunces, IBM Plex Sans e IBM Plex Mono (SIL Open Font License 1.1) con alternativas del sistema (Georgia, system-ui y Consolas). El repositorio no empaqueta ni descarga archivos de fuente: si están instaladas se usan y, si no, se usa la alternativa.

## Criterios para añadir un asset

Solo licencias MIT, ISC, Apache-2.0 o CC0. Se guarda localmente solo lo que se usa, se registra en esta tabla con su origen y se cumple la atribución cuando la licencia la exige. Nada de GIF, Lottie ni vídeo para estados de carga o error.
