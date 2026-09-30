import { stockQuantity } from './dimensions';

/** Respuesta de GET /inventory/material-availability (resumen agregado, solo lectura). */
export type MaterialAvailability = {
  id: string; code: string; name: string; type: string; unit: string;
  stock: number; reservedQuantity: number; controlsStock: boolean; productionConsumable: boolean; requiresDimensions: boolean;
  piecesByState: Record<string, number>; physicalPieces: number; availablePieces: number; reservedPieces: number;
  availableThicknessesMm: number[];
  largestAvailablePiece: { code: string; kind: string; lengthMm: number; widthMm: number; thicknessMm: number } | null;
};
export type AvailabilityData = { lowStockThreshold: number; items: MaterialAvailability[] };

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
const heights = (values: number[]) => values.length === 1 ? `alto ${values[0]} mm` : `altos ${values.join(', ')} mm`;

/** Madera para corte: artículo MATERIAL dimensional. Solo MaterialPiece AVAILABLE es utilizable por el plano. */
export const isCuttingMaterial = (item: MaterialAvailability) => item.type === 'MATERIAL' && item.requiresDimensions;
/** Material de consumo: marcado como consumible de producción (la misma condición que exige el backend). */
export const isConsumable = (item: MaterialAvailability) => item.productionConsumable;

export type WoodStatus = 'AVAILABLE' | 'RESERVED' | 'LOOSE_ONLY' | 'NONE';
export const WOOD_GROUPS: Record<WoodStatus, string> = {
  AVAILABLE: 'Con piezas disponibles', RESERVED: 'Piezas reservadas', LOOSE_ONLY: 'Solo stock suelto', NONE: 'Sin disponibilidad',
};
const WOOD_ORDER: WoodStatus[] = ['AVAILABLE', 'RESERVED', 'LOOSE_ONLY', 'NONE'];

export function woodStatus(item: MaterialAvailability): WoodStatus {
  if (item.availablePieces > 0) return 'AVAILABLE';
  if (item.reservedPieces > 0) return 'RESERVED';
  if (item.stock > 0) return 'LOOSE_ONLY';
  return 'NONE';
}

/** Texto secundario de la opción: resumen, nunca la lista de piezas. */
export function woodDescription(item: MaterialAvailability) {
  switch (woodStatus(item)) {
    case 'AVAILABLE': return `${count(item.availablePieces, 'pieza disponible', 'piezas disponibles')} · ${heights(item.availableThicknessesMm)}${item.reservedPieces ? ` · ${count(item.reservedPieces, 'reservada', 'reservadas')}` : ''}`;
    case 'RESERVED': return `Sin piezas disponibles · ${count(item.reservedPieces, 'reservada', 'reservadas')}`;
    case 'LOOSE_ONLY': return `Sin piezas físicas dimensionales · ${stockQuantity(item.stock, item.unit)} en stock suelto`;
    default: return 'Sin piezas físicas ni stock';
  }
}

/** Búsqueda adicional por código, tipo y alto ("18 mm"). */
export const woodSearchText = (item: MaterialAvailability) => `${item.code} ${item.type} ${item.availableThicknessesMm.map((value) => `${value} mm`).join(' ')}`;

export const sortWoods = (items: MaterialAvailability[]) =>
  [...items].sort((a, b) => WOOD_ORDER.indexOf(woodStatus(a)) - WOOD_ORDER.indexOf(woodStatus(b)) || a.name.localeCompare(b.name, 'es'));

export type ConsumableStatus = 'OK' | 'LOW' | 'OUT' | 'UNTRACKED';
export function consumableStatus(item: MaterialAvailability, lowStockThreshold: number): ConsumableStatus {
  if (!item.controlsStock) return 'UNTRACKED';
  if (item.stock <= 0) return 'OUT';
  // Misma regla que el dashboard (ajuste low_stock_threshold); no se inventa un umbral propio.
  return item.stock <= lowStockThreshold ? 'LOW' : 'OK';
}

export function consumableDescription(item: MaterialAvailability, lowStockThreshold: number) {
  const reserved = item.reservedQuantity ? ` · ${stockQuantity(item.reservedQuantity, item.unit)} reservadas en producción` : '';
  switch (consumableStatus(item, lowStockThreshold)) {
    case 'UNTRACKED': return `No controla stock${reserved}`;
    case 'OUT': return `Sin stock${reserved}`;
    case 'LOW': return `${stockQuantity(item.stock, item.unit)} disponibles · stock bajo${reserved}`;
    default: return `${stockQuantity(item.stock, item.unit)} disponibles${reserved}`;
  }
}

export type Tone = 'ok' | 'warn' | 'error';
export type Compatibility = { tone: Tone; label: string; detail: string };

/** Prevalidación UX de una pieza: material y alto. El nesting (si caben) lo decide el backend al simular. */
export function pieceCompatibility(item: MaterialAvailability | undefined, thicknessMm: number): Compatibility {
  if (!item) return { tone: 'warn', label: 'Revisar material', detail: 'El material no está disponible como madera dimensional activa.' };
  if (!item.availablePieces) {
    if (item.reservedPieces) return { tone: 'warn', label: 'Stock reservado', detail: `Las piezas de ${item.name} están reservadas por otra producción.` };
    if (!item.physicalPieces && item.stock > 0) return { tone: 'error', label: 'Sin piezas físicas', detail: `${stockQuantity(item.stock, item.unit)} en stock suelto, sin piezas físicas dimensionales disponibles.` };
    return { tone: 'error', label: 'Sin piezas físicas', detail: `No hay piezas físicas disponibles de ${item.name} para corte.` };
  }
  if (thicknessMm > 0 && !item.availableThicknessesMm.includes(thicknessMm)) {
    return { tone: 'warn', label: 'Revisar alto', detail: `No hay madera disponible con alto ${thicknessMm} mm (hay ${item.availableThicknessesMm.join(' / ')} mm).` };
  }
  return { tone: 'ok', label: 'Compatible', detail: `Hay piezas físicas con alto ${thicknessMm || item.availableThicknessesMm.join(' / ')} mm. El plano de corte confirma si caben.` };
}

/** Prevalidación de consumible: necesario (por producto × unidades de la línea) frente a disponible. */
export function componentCompatibility(item: MaterialAvailability | undefined, needed: number): Compatibility {
  if (!item) return { tone: 'warn', label: 'Revisar material', detail: 'El artículo ya no es un consumible de producción activo.' };
  if (!item.controlsStock) return { tone: 'ok', label: 'Sin control de stock', detail: 'Este artículo no descuenta existencias.' };
  if (item.stock <= 0) return { tone: 'error', label: 'Sin stock', detail: `Necesitas ${stockQuantity(needed, item.unit)}; no hay existencias.` };
  if (needed > item.stock) return { tone: 'warn', label: `Faltan ${stockQuantity(Number((needed - item.stock).toFixed(3)), item.unit)}`, detail: `Necesitas ${stockQuantity(needed, item.unit)}; disponibles ${stockQuantity(item.stock, item.unit)}.` };
  return { tone: 'ok', label: 'Stock suficiente', detail: `Necesitas ${stockQuantity(needed, item.unit)}; disponibles ${stockQuantity(item.stock, item.unit)}.` };
}
