/**
 * Unidades de inventario: el catálogo controlado vive en el backend (GET /inventory/units) y se carga una vez por sesión.
 * El backend guarda códigos (UNIDAD, TABLON…); la interfaz muestra etiquetas (Unidad, Tablón…).
 * No confundir con la unidad dimensional (mm, cm, m), que solo indica cómo se escriben las medidas.
 */
export type UnitOption = { code: string; label: string; plural: string };

let catalog: UnitOption[] = [];

export function setUnitCatalog(next: UnitOption[]) { catalog = next; }
export function getUnitCatalog() { return catalog; }
export const isKnownUnit = (code: string) => catalog.some((unit) => unit.code === code);

/** "Tablón" / "tablones" según la cantidad; si el catálogo aún no cargó, el código en minúsculas. */
export function unitLabel(code: string, count = 1, capitalized = false) {
  const unit = catalog.find((entry) => entry.code === code);
  const text = unit ? (count === 1 ? unit.label : unit.plural) : code.toLowerCase();
  return capitalized ? text : text.toLowerCase();
}
