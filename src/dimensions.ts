/**
 * Dimensiones físicas (V1). La interfaz muestra tres valores y el backend los guarda en milímetros enteros:
 *
 *   Largo -> lengthMm
 *   Ancho -> widthMm
 *   Alto  -> thicknessMm   (en tablas, retazos y piezas de corte, el alto es el espesor de la madera)
 *
 * No existe una cuarta dimensión "Espesor": el motor de corte compara el alto de la pieza con el de la tabla.
 */
export type DimensionUnit = 'mm' | 'cm' | 'm';

export const formatDimensions = (lengthMm: number, widthMm: number, thicknessMm: number) => `${lengthMm} × ${widthMm} × ${thicknessMm} mm`;

export const fromMillimeters = (value: number, unit: DimensionUnit) => String(value / (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1));

/** "26 unidades", "1 unidad", "4 tablon": unidad de stock suelto legible. */
export const stockQuantity = (quantity: number, unit: string) =>
  `${quantity} ${unit === 'UNIDAD' ? (quantity === 1 ? 'unidad' : 'unidades') : unit.toLowerCase()}`;

export type PhysicalPiece = {
  id: string; code: string; kind: string; state: string; materialId: string;
  lengthMm: number; widthMm: number; thicknessMm: number;
};

/** Resumen de las piezas físicas AVAILABLE de un material, agrupadas por alto (espesor). */
export function availableStock(pieces: PhysicalPiece[], materialId: string) {
  const available = pieces
    .filter((piece) => piece.materialId === materialId && piece.state === 'AVAILABLE')
    .sort((a, b) => b.lengthMm * b.widthMm - a.lengthMm * a.widthMm);
  const byThickness = new Map<number, PhysicalPiece[]>();
  for (const piece of available) byThickness.set(piece.thicknessMm, [...(byThickness.get(piece.thicknessMm) ?? []), piece]);
  const thicknesses = [...byThickness.keys()].sort((a, b) => a - b);
  return { available, byThickness, thicknesses };
}
