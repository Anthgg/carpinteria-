import { Alert } from '@heroui/react/alert';
import { AppLink } from './ModuleTabs';
import { formatDimensions, stockQuantity } from '../dimensions';

export type UnplacedReason =
  | 'NO_PHYSICAL_STOCK' | 'STOCK_RESERVED' | 'NO_AVAILABLE_STOCK' | 'THICKNESS_MISMATCH'
  | 'DIMENSIONS_TOO_LARGE' | 'KERF_NO_FIT' | 'INSUFFICIENT_REMAINING_SPACE' | 'UNKNOWN';

type UnplacedGroup = {
  requirementId: string; label: string; materialId: string; materialName: string;
  lengthMm: number; widthMm: number; thicknessMm: number;
  requested: number; placed: number; pending: number; reason: UnplacedReason; reasonDetails: string;
};
type MaterialDiagnostic = {
  materialId: string; materialName: string; unit: string; looseStock: number;
  physicalPieces: number; availablePieces: number; reservedPieces: number;
  piecesByState: Record<string, number>; availableThicknessesMm: number[];
};
export type CuttingDiagnostics = {
  requestedParts: number; placedParts: number; unplacedParts: number;
  primaryReason: UnplacedReason | null; materials: MaterialDiagnostic[]; groups: UnplacedGroup[];
};
type LegacyUnplaced = { label: string; lengthMm: number; widthMm: number; thicknessMm: number };

const REASON_TITLES: Record<UnplacedReason, string> = {
  NO_PHYSICAL_STOCK: 'Sin tablas físicas registradas',
  STOCK_RESERVED: 'Las piezas físicas están reservadas',
  NO_AVAILABLE_STOCK: 'Ninguna pieza física disponible',
  THICKNESS_MISMATCH: 'El alto (espesor) no coincide',
  DIMENSIONS_TOO_LARGE: 'La pieza es más grande que las tablas',
  KERF_NO_FIT: 'No entra por el ancho del corte de sierra',
  INSUFFICIENT_REMAINING_SPACE: 'No queda espacio suficiente',
  UNKNOWN: 'Motivo no determinado',
};
const STATE_LABELS: Record<string, [string, string]> = {
  AVAILABLE: ['disponible', 'disponibles'], RESERVED: ['reservada', 'reservadas'], PENDING_DISPOSITION: ['por decidir', 'por decidir'],
  CONSUMED: ['consumida', 'consumidas'], DISCARDED: ['descartada', 'descartadas'],
};

type Action = { href: string; label: string };
/** Piezas que el operario puede corregir desde Materiales y piezas (resaltadas al llegar). */
const EDITABLE_REASONS: UnplacedReason[] = ['THICKNESS_MISMATCH', 'DIMENSIONS_TOO_LARGE'];
const reviewHref = (jobId: string, requirementIds: string[]) => `/produccion/${jobId}/materiales?piezas=${[...new Set(requirementIds)].join(',')}`;

function actionsFor(reason: UnplacedReason, materialId: string, jobId: string, canManage: boolean, canEdit: boolean, affected: string[]): Action[] {
  const inventory = { href: `/inventario/${materialId}`, label: 'Ver inventario del material' };
  const pieces = { href: '/inventario/piezas', label: 'Ver piezas y retazos' };
  const register = { href: `/inventario/piezas/nueva?material=${materialId}`, label: 'Registrar pieza física' };
  const materials = (label: string) => ({ href: reviewHref(jobId, affected), label });
  switch (reason) {
    case 'NO_PHYSICAL_STOCK': return [inventory, ...(canManage ? [register] : [])];
    case 'STOCK_RESERVED':
    case 'NO_AVAILABLE_STOCK': return [pieces, inventory];
    case 'THICKNESS_MISMATCH': return [...(canEdit ? [materials('Revisar material y alto')] : []), pieces];
    case 'DIMENSIONS_TOO_LARGE': return canEdit ? [materials('Revisar dimensiones')] : [pieces];
    case 'KERF_NO_FIT':
    case 'INSUFFICIENT_REMAINING_SPACE': return [pieces, ...(canManage ? [register] : [])];
    default: return [pieces];
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function CuttingDiagnosis({ diagnostics, legacyUnplaced, jobId, canManage, canEdit }: {
  diagnostics?: CuttingDiagnostics; legacyUnplaced: LegacyUnplaced[]; jobId: string; canManage: boolean; canEdit: boolean;
}) {
  if (!diagnostics) {
    // Planes guardados antes de que el backend devolviera diagnóstico: se agrupan y se pide recalcular.
    const groups = new Map<string, LegacyUnplaced & { pending: number }>();
    for (const piece of legacyUnplaced) {
      const key = `${piece.label}|${piece.lengthMm}|${piece.widthMm}|${piece.thicknessMm}`;
      groups.set(key, { ...piece, pending: (groups.get(key)?.pending ?? 0) + 1 });
    }
    return <Alert.Root status="warning" className="cut-diagnosis cut-diagnosis--warning">
      <Alert.Indicator className="cut-diagnosis__icon" />
      <Alert.Content className="cut-diagnosis__content">
        <Alert.Title className="cut-diagnosis__title">Plano de corte incompleto</Alert.Title>
        <Alert.Description className="cut-diagnosis__lead">Este plano se calculó antes del diagnóstico detallado. Pulsa «Calcular sugerencia» para ver el motivo de cada pieza.</Alert.Description>
        <ul className="cut-diagnosis__legacy">{[...groups.values()].map((group) => <li key={`${group.label}-${group.lengthMm}-${group.widthMm}-${group.thicknessMm}`}><b>{group.label}</b> {formatDimensions(group.lengthMm, group.widthMm, group.thicknessMm)} · {plural(group.pending, 'pendiente', 'pendientes')}</li>)}</ul>
      </Alert.Content>
    </Alert.Root>;
  }
  if (!diagnostics.unplacedParts) return null;

  const tone = diagnostics.placedParts === 0 ? 'error' : 'warning';
  const primary = diagnostics.primaryReason ?? 'UNKNOWN';
  const primaryGroup = diagnostics.groups.find((group) => group.reason === primary);
  const actions = new Map<string, Action>();
  for (const group of diagnostics.groups) {
    const affected = diagnostics.groups.filter((entry) => entry.reason === group.reason).map((entry) => entry.requirementId);
    for (const action of actionsFor(group.reason, group.materialId, jobId, canManage, canEdit, affected)) actions.set(action.label, action);
  }
  const canReview = (group: UnplacedGroup) => canEdit && EDITABLE_REASONS.includes(group.reason);

  return <Alert.Root status={tone === 'error' ? 'danger' : 'warning'} className={`cut-diagnosis cut-diagnosis--${tone}`} role="alert">
    <Alert.Indicator className="cut-diagnosis__icon" />
    <Alert.Content className="cut-diagnosis__content">
      <Alert.Title className="cut-diagnosis__title">{tone === 'error' ? 'No se pudo completar el plano de corte' : 'El plano de corte está incompleto'}</Alert.Title>
      <Alert.Description className="cut-diagnosis__lead">
        <span className="cut-diagnosis__reason-label">Motivo principal</span>
        <b>{REASON_TITLES[primary]}.</b> {primaryGroup?.reasonDetails}
      </Alert.Description>

      <dl className="cut-diagnosis__stats">
        <div><dt>Piezas requeridas</dt><dd>{diagnostics.requestedParts}</dd></div>
        <div><dt>Ubicadas</dt><dd>{diagnostics.placedParts}</dd></div>
        <div className="is-pending"><dt>Pendientes</dt><dd>{diagnostics.unplacedParts}</dd></div>
      </dl>

      <div className="cut-diagnosis__materials">{diagnostics.materials.map((material) => {
        const breakdown = Object.entries(material.piecesByState).filter(([, count]) => count).map(([state, count]) => `${count} ${STATE_LABELS[state]?.[count === 1 ? 0 : 1] ?? state.toLowerCase()}`).join(' · ');
        return <section className="cut-diagnosis__material" key={material.materialId} aria-label={`Stock de ${material.materialName}`}>
          <p className="eyebrow">MATERIAL</p>
          <h3>{material.materialName}</h3>
          <dl>
            <div><dt>Piezas físicas</dt><dd>{material.physicalPieces}{breakdown ? <small>{breakdown}</small> : null}</dd></div>
            <div><dt>Disponibles</dt><dd>{material.availablePieces}</dd></div>
            <div><dt>Alto disponible</dt><dd>{material.availableThicknessesMm.length ? `${material.availableThicknessesMm.join(' / ')} mm` : '—'}</dd></div>
            <div><dt>Stock suelto</dt><dd>{stockQuantity(material.looseStock, material.unit)} <small>sin medidas · no usable en el plano</small></dd></div>
          </dl>
        </section>;
      })}</div>

      <div className="cut-diagnosis__table table-wrap">
        <table>
          <thead><tr><th>Pieza</th><th>Largo × Ancho × Alto</th><th>Pendientes</th><th>Motivo</th>{diagnostics.groups.some(canReview) ? <th><span className="sr-only">Acción</span></th> : null}</tr></thead>
          <tbody>{diagnostics.groups.map((group) => <tr key={`${group.requirementId}-${group.reason}`}>
            <td data-label="Pieza"><b>{group.label}</b><small>{group.materialName}</small></td>
            <td data-label="Medida" className="mono">{formatDimensions(group.lengthMm, group.widthMm, group.thicknessMm)}</td>
            <td data-label="Pendientes"><b>{group.pending}</b><small>de {group.requested}{group.placed ? ` · ${group.placed} ubicadas` : ''}</small></td>
            <td data-label="Motivo"><span className={`cut-reason cut-reason--${group.reason.toLowerCase().replaceAll('_', '-')}`}>{REASON_TITLES[group.reason]}</span><small>{group.reasonDetails}</small></td>
            {diagnostics.groups.some(canReview) ? <td data-label="Acción">{canReview(group) ? <AppLink className="text-button" href={reviewHref(jobId, [group.requirementId])} aria-label={`Revisar la pieza ${group.label}`}>Revisar →</AppLink> : null}</td> : null}
          </tr>)}</tbody>
        </table>
      </div>

      {actions.size ? <div className="cut-diagnosis__actions">{[...actions.values()].map((action, index) => <AppLink key={action.href} className={`button button--small ${index === 0 ? 'button--primary' : 'button--quiet'}`} href={action.href}>{action.label}</AppLink>)}</div> : null}
    </Alert.Content>
  </Alert.Root>;
}
