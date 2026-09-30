/**
 * Dimensiones físicas (V1). La interfaz muestra tres valores y el backend los guarda en milímetros enteros:
 *
 *   Largo -> lengthMm
 *   Ancho -> widthMm
 *   Alto  -> thicknessMm   (en tablas, retazos y piezas de corte, el alto es el espesor de la madera)
 *
 * No existe una cuarta dimensión "Espesor": el motor de corte compara el alto de la pieza con el de la tabla.
 */
import { unitLabel } from './units';

export type DimensionUnit = 'mm' | 'cm' | 'm';

export const formatDimensions = (lengthMm: number, widthMm: number, thicknessMm: number) => `${lengthMm} × ${widthMm} × ${thicknessMm} mm`;

export const fromMillimeters = (value: number, unit: DimensionUnit) => String(value / (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1));

/** "26 unidades", "1 unidad", "4 tablones": cantidad de stock con la etiqueta del catálogo de unidades. */
export const stockQuantity = (quantity: number, unit: string) => `${quantity} ${unitLabel(unit, quantity)}`;

export type PhysicalPiece = {
  id: string; code: string; kind: string; state: string; materialId: string;
  lengthMm: number; widthMm: number; thicknessMm: number;
};
