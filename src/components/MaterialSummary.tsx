import { Popover } from '@heroui/react/popover';
import { Button } from '@heroui/react/button';
import { AppLink } from './ModuleTabs';
import { formatDimensions, stockQuantity } from '../dimensions';
import type { PhysicalPiece } from '../dimensions';
import type { MaterialAvailability } from '../materialAvailability';

const STATE_LABELS: Record<string, string> = { AVAILABLE: 'Disponible', RESERVED: 'Reservada' };

/** Resumen de una madera ya elegida + popover con sus piezas físicas utilizables o reservadas. */
export function WoodSummary({ item, pieces }: { item: MaterialAvailability; pieces: PhysicalPiece[] }) {
  const listed = pieces
    .filter((piece) => piece.materialId === item.id && (piece.state === 'AVAILABLE' || piece.state === 'RESERVED'))
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'AVAILABLE' ? -1 : 1) || b.lengthMm * b.widthMm - a.lengthMm * a.widthMm);
  const largest = item.largestAvailablePiece;
  return <div className="material-summary" aria-label={`Disponibilidad de ${item.name}`}>
    <dl className="material-summary__facts">
      <div><dt>Disponibles</dt><dd>{item.availablePieces} <small>{item.availablePieces === 1 ? 'pieza física' : 'piezas físicas'}</small></dd></div>
      <div><dt>Reservadas</dt><dd>{item.reservedPieces}</dd></div>
      <div><dt>Alto disponible</dt><dd>{item.availableThicknessesMm.length ? `${item.availableThicknessesMm.join(' / ')} mm` : '—'}</dd></div>
      <div><dt>Pieza mayor</dt><dd>{largest ? <>{formatDimensions(largest.lengthMm, largest.widthMm, largest.thicknessMm)} <small>{largest.code}</small></> : '—'}</dd></div>
      {item.stock > 0 ? <div><dt>Stock suelto</dt><dd>{stockQuantity(item.stock, item.unit)} <small>sin medidas · no usable en el plano</small></dd></div> : null}
    </dl>
    {listed.length ? <Popover.Root>
      <Button variant="ghost" className="text-button material-summary__more">Ver piezas disponibles ({item.availablePieces})</Button>
      <Popover.Content placement="bottom start" offset={4} className="pieces-popover">
        <Popover.Dialog className="pieces-popover__dialog" aria-label={`Piezas físicas de ${item.name}`}>
          <Popover.Heading className="pieces-popover__title">{item.name}</Popover.Heading>
          <div className="pieces-popover__list table-wrap"><table>
            <thead><tr><th>Código</th><th>Tipo</th><th>Largo × Ancho × Alto</th><th>Estado</th></tr></thead>
            <tbody>{listed.map((piece) => <tr key={piece.id}>
              <td className="mono">{piece.code}</td>
              <td>{piece.kind === 'OFFCUT' ? 'Retazo' : 'Tabla'}</td>
              <td className="mono">{formatDimensions(piece.lengthMm, piece.widthMm, piece.thicknessMm)}</td>
              <td><span className={`badge badge--${piece.state === 'AVAILABLE' ? 'ok' : 'warn'}`}>{STATE_LABELS[piece.state] ?? piece.state}</span></td>
            </tr>)}</tbody>
          </table></div>
          <AppLink className="text-button" href="/inventario/piezas">Ir a inventario →</AppLink>
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root> : null}
  </div>;
}

export function ConsumableSummary({ item, lowStockThreshold }: { item: MaterialAvailability; lowStockThreshold: number }) {
  return <div className="material-summary" aria-label={`Disponibilidad de ${item.name}`}>
    <dl className="material-summary__facts">
      <div><dt>Disponible</dt><dd>{item.controlsStock ? stockQuantity(item.stock, item.unit) : 'Sin control de stock'}{item.controlsStock && item.stock > 0 && item.stock <= lowStockThreshold ? <small>stock bajo (umbral {lowStockThreshold})</small> : null}</dd></div>
      {item.reservedQuantity ? <div><dt>Reservado en producción</dt><dd>{stockQuantity(item.reservedQuantity, item.unit)}</dd></div> : null}
      <div><dt>Código</dt><dd className="mono">{item.code}</dd></div>
    </dl>
  </div>;
}
