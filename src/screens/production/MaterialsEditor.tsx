import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Dropdown } from '@heroui/react/dropdown';
import { toMillimeters } from '../../api';
import { AppLink } from '../../components/ModuleTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ConsumableSummary, WoodSummary } from '../../components/MaterialSummary';
import { SelectField } from '../../components/SelectField';
import { formatDimensions, fromMillimeters, stockQuantity } from '../../dimensions';
import type { DimensionUnit, PhysicalPiece } from '../../dimensions';
import { Icon } from '../../components/Icon';
import {
  componentCompatibility, consumableDescription, isConsumable, isCuttingMaterial, pieceCompatibility,
  sortWoods, woodDescription, WOOD_GROUPS, woodSearchText, woodStatus,
} from '../../materialAvailability';
import type { AvailabilityData, Compatibility, MaterialAvailability, WoodStatus } from '../../materialAvailability';
import { navigateTo, setNavigationGuard } from '../../navigation';

export type EditorJob = {
  id: string; stage: string; status: string; progress: number;
  orderLine: { quantity: number };
  components: Array<{ id: string; label: string; quantity: string | number; unit: string; material: { id: string; name: string } }>;
  requirements: Array<{ id: string; label: string; lengthMm: number; widthMm: number; thicknessMm: number; quantity: number; material: { id: string; name: string } }>;
};
export type MaterialsPayload = {
  components: Array<{ label: string; materialId: string; quantity: number }>;
  pieces: Array<{ label: string; materialId: string; lengthMm: number; widthMm: number; thicknessMm: number; quantity: number }>;
};

type PieceRow = { key: string; sourceId?: string; label: string; materialId: string; materialName: string; lengthMm: number; widthMm: number; thicknessMm: number; quantity: number };
type ComponentRow = { key: string; sourceId?: string; label: string; materialId: string; materialName: string; quantity: number };
type PieceForm = { label: string; materialId: string; length: string; width: string; thickness: string; quantity: string; thicknessSuggested: boolean };
type ComponentForm = { label: string; materialId: string; quantity: string };
type Editing = { kind: 'piece' | 'component'; key: string; isNew: boolean };
type Confirm =
  | { type: 'delete-piece' | 'delete-component'; key: string; label: string }
  | { type: 'discard' }
  | { type: 'leave'; path: string };

const newKey = () => `new-${Math.random().toString(36).slice(2, 10)}`;
const piecesFromJob = (job: EditorJob): PieceRow[] => job.requirements.map((piece) => ({
  key: piece.id, sourceId: piece.id, label: piece.label, materialId: piece.material.id, materialName: piece.material.name,
  lengthMm: piece.lengthMm, widthMm: piece.widthMm, thicknessMm: piece.thicknessMm, quantity: piece.quantity,
}));
const componentsFromJob = (job: EditorJob): ComponentRow[] => job.components.map((component) => ({
  key: component.id, sourceId: component.id, label: component.label, materialId: component.material.id, materialName: component.material.name, quantity: Number(component.quantity),
}));
const pieceSignature = (rows: PieceRow[]) => JSON.stringify(rows.map((row) => [row.label, row.materialId, row.lengthMm, row.widthMm, row.thicknessMm, row.quantity]));
const componentSignature = (rows: ComponentRow[]) => JSON.stringify(rows.map((row) => [row.label, row.materialId, row.quantity]));
const pieceToForm = (row: PieceRow, unit: DimensionUnit): PieceForm => ({
  label: row.label, materialId: row.materialId, quantity: String(row.quantity), thicknessSuggested: false,
  length: row.lengthMm ? fromMillimeters(row.lengthMm, unit) : '', width: row.widthMm ? fromMillimeters(row.widthMm, unit) : '', thickness: row.thicknessMm ? fromMillimeters(row.thicknessMm, unit) : '',
});

function lockMessage(job: EditorJob) {
  if (job.stage === 'MATERIALS_RESERVED') return 'Los materiales ya fueron reservados. Libera la reserva en «Plano de corte» antes de modificar las piezas.';
  if (job.stage !== 'ORDER_RECEIVED' || job.progress > 0) return 'La producción ya pasó la reserva de materiales; las piezas quedan como registro de esta orden.';
  if (job.status === 'PAUSED') return 'La producción está pausada. Reanúdala para modificar materiales y piezas.';
  return 'Esta orden no admite cambios de materiales en su estado actual.';
}

function Badge({ compat }: { compat: Compatibility }) {
  return <span className={`badge badge--${compat.tone}`} title={compat.detail}><Icon name={compat.tone === 'ok' ? 'check' : 'warning'} size={16} />{compat.label}</span>;
}

function RowActions({ label, kind, disabled, onEdit, onDuplicate, onDelete }: { label: string; kind: string; disabled: boolean; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return <div className="row-actions-cell">
    <div className="row-actions-inline">
      <button type="button" className="text-button" disabled={disabled} onClick={onEdit} aria-label={`Editar ${kind} ${label}`} data-action="edit">Editar</button>
      <button type="button" className="text-button" disabled={disabled} onClick={onDuplicate} aria-label={`Duplicar ${kind} ${label}`}>Duplicar</button>
      <button type="button" className="text-button text-button--danger" disabled={disabled} onClick={onDelete} aria-label={`Eliminar ${kind} ${label}`}>Eliminar</button>
    </div>
    <Dropdown.Root>
      <Dropdown.Trigger className="row-menu__trigger" isDisabled={disabled} aria-label={`Acciones de ${kind} ${label}`}>•••</Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="row-menu">
        <Dropdown.Menu aria-label={`Acciones de ${kind} ${label}`} onAction={(key) => { if (key === 'edit') onEdit(); if (key === 'duplicate') onDuplicate(); if (key === 'delete') onDelete(); }}>
          <Dropdown.Item id="edit" textValue="Editar" className="row-menu__item">Editar</Dropdown.Item>
          <Dropdown.Item id="duplicate" textValue="Duplicar" className="row-menu__item">Duplicar</Dropdown.Item>
          <Dropdown.Item id="delete" textValue="Eliminar" className="row-menu__item row-menu__item--danger">Eliminar</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  </div>;
}

export function MaterialsEditor({ job, availability, pieces, busy, highlight, onSave }: {
  job: EditorJob; availability: AvailabilityData; pieces: PhysicalPiece[]; busy: boolean;
  highlight: { ids: string[]; token: number } | null; onSave: (payload: MaterialsPayload) => Promise<boolean>;
}) {
  const savedPieces = useMemo(() => piecesFromJob(job), [job]);
  const savedComponents = useMemo(() => componentsFromJob(job), [job]);
  const [pieceRows, setPieceRows] = useState(savedPieces);
  const [componentRows, setComponentRows] = useState(savedComponents);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pieceForm, setPieceForm] = useState<PieceForm | null>(null);
  const [componentForm, setComponentForm] = useState<ComponentForm | null>(null);
  const [formError, setFormError] = useState('');
  const [unit, setUnit] = useState<DimensionUnit>('mm');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const editable = job.stage === 'ORDER_RECEIVED' && job.status === 'ACTIVE' && job.progress === 0;
  const byId = useMemo(() => new Map(availability.items.map((item) => [item.id, item])), [availability]);
  const woods = useMemo(() => sortWoods(availability.items.filter(isCuttingMaterial)), [availability]);
  const consumables = useMemo(() => availability.items.filter(isConsumable), [availability]);
  const woodFor = (materialId: string) => { const item = byId.get(materialId); return item && isCuttingMaterial(item) ? item : undefined; };
  const consumableFor = (materialId: string) => { const item = byId.get(materialId); return item && isConsumable(item) ? item : undefined; };

  const reset = () => { setPieceRows(savedPieces); setComponentRows(savedComponents); setEditing(null); setPieceForm(null); setComponentForm(null); setFormError(''); };
  useEffect(reset, [savedPieces, savedComponents]);

  const editingRowPiece = editing?.kind === 'piece' ? pieceRows.find((row) => row.key === editing.key) : undefined;
  const editingRowComponent = editing?.kind === 'component' ? componentRows.find((row) => row.key === editing.key) : undefined;
  const formDirty = !!editing && (editing.isNew
    || (editingRowPiece && pieceForm && JSON.stringify({ ...pieceToForm(editingRowPiece, unit), thicknessSuggested: false }) !== JSON.stringify({ ...pieceForm, thicknessSuggested: false }))
    || (editingRowComponent && componentForm && JSON.stringify({ label: editingRowComponent.label, materialId: editingRowComponent.materialId, quantity: String(editingRowComponent.quantity) }) !== JSON.stringify(componentForm)));
  const listDirty = pieceSignature(pieceRows) !== pieceSignature(savedPieces) || componentSignature(componentRows) !== componentSignature(savedComponents);
  const dirty = listDirty || !!formDirty;

  // Cambios sin guardar: se confirma antes de salir de esta pestaña o de la página.
  useEffect(() => {
    if (!dirty) return;
    const release = setNavigationGuard((path) => {
      if (path.startsWith(`/produccion/${job.id}/materiales`)) return true;
      setConfirm({ type: 'leave', path });
      return false;
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { release(); window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, job.id]);

  // Resaltado desde el diagnóstico del plano: desplaza a la primera pieza afectada y enfoca su acción Editar.
  useEffect(() => {
    if (!highlight?.ids.length) return;
    setHighlighted(highlight.ids);
    const frame = requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(highlight.ids[0])}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.querySelector<HTMLButtonElement>('[data-action="edit"]')?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setHighlighted([]), 4000);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [highlight?.token]);

  const openPiece = (row: PieceRow, isNew: boolean) => { setEditing({ kind: 'piece', key: row.key, isNew }); setPieceForm(pieceToForm(row, unit)); setComponentForm(null); setFormError(''); };
  const openComponent = (row: ComponentRow, isNew: boolean) => { setEditing({ kind: 'component', key: row.key, isNew }); setComponentForm({ label: row.label, materialId: row.materialId, quantity: isNew && !row.quantity ? '1' : String(row.quantity) }); setPieceForm(null); setFormError(''); };
  const addPiece = () => { const row: PieceRow = { key: newKey(), label: '', materialId: '', materialName: '', lengthMm: 0, widthMm: 0, thicknessMm: 0, quantity: 1 }; setPieceRows((rows) => [...rows, row]); openPiece(row, true); };
  const duplicatePiece = (source: PieceRow) => {
    const row: PieceRow = { ...source, key: newKey(), sourceId: undefined, label: `${source.label} copia`.slice(0, 120) };
    setPieceRows((rows) => { const index = rows.findIndex((entry) => entry.key === source.key); return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)]; });
    openPiece(row, true);
  };
  const addComponent = () => { const row: ComponentRow = { key: newKey(), label: '', materialId: '', materialName: '', quantity: 0 }; setComponentRows((rows) => [...rows, row]); openComponent(row, true); };
  const duplicateComponent = (source: ComponentRow) => {
    const row: ComponentRow = { ...source, key: newKey(), sourceId: undefined, label: `${source.label} copia`.slice(0, 120) };
    setComponentRows((rows) => { const index = rows.findIndex((entry) => entry.key === source.key); return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)]; });
    openComponent(row, true);
  };
  const cancelEdit = () => {
    if (editing?.isNew) {
      if (editing.kind === 'piece') setPieceRows((rows) => rows.filter((row) => row.key !== editing.key));
      else setComponentRows((rows) => rows.filter((row) => row.key !== editing.key));
    }
    setEditing(null); setPieceForm(null); setComponentForm(null); setFormError('');
  };

  const choosePieceMaterial = (materialId: string) => setPieceForm((form) => {
    if (!form) return form;
    const thicknesses = woodFor(materialId)?.availableThicknessesMm ?? [];
    // Un único alto disponible: se sugiere si el campo está vacío o venía sugerido. Nunca se pisa un valor escrito por el operario.
    if (thicknesses.length === 1 && (!form.thickness || form.thicknessSuggested)) return { ...form, materialId, thickness: fromMillimeters(thicknesses[0], unit), thicknessSuggested: true };
    if (form.thicknessSuggested) return { ...form, materialId, thickness: '', thicknessSuggested: false };
    return { ...form, materialId };
  });

  const applyPiece = () => {
    if (!editing || !pieceForm) return;
    const values = { lengthMm: toMillimeters(pieceForm.length, unit), widthMm: toMillimeters(pieceForm.width, unit), thicknessMm: toMillimeters(pieceForm.thickness, unit), quantity: Number(pieceForm.quantity) };
    if (!pieceForm.label.trim()) return setFormError('Escribe el nombre de la pieza.');
    if (!pieceForm.materialId) return setFormError('Elige la madera de la pieza.');
    if (!pieceForm.length || !pieceForm.width || !pieceForm.thickness || [values.lengthMm, values.widthMm, values.thicknessMm].some((value) => !Number.isSafeInteger(value) || value <= 0)) return setFormError('Largo, ancho y alto deben ser mayores que cero (se guardan en milímetros enteros).');
    if (!Number.isSafeInteger(values.quantity) || values.quantity < 1 || values.quantity > 10000) return setFormError('La cantidad debe ser un número entero entre 1 y 10000.');
    const materialName = byId.get(pieceForm.materialId)?.name ?? pieceRows.find((row) => row.key === editing.key)?.materialName ?? '';
    setPieceRows((rows) => rows.map((row) => row.key === editing.key ? { ...row, label: pieceForm.label.trim(), materialId: pieceForm.materialId, materialName, ...values } : row));
    setEditing(null); setPieceForm(null); setFormError('');
  };
  const applyComponent = () => {
    if (!editing || !componentForm) return;
    const quantity = Number(componentForm.quantity);
    if (!componentForm.label.trim()) return setFormError('Escribe una descripción.');
    if (!componentForm.materialId) return setFormError('Elige el material de consumo.');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return setFormError('La cantidad debe ser mayor que cero.');
    const materialName = byId.get(componentForm.materialId)?.name ?? componentRows.find((row) => row.key === editing.key)?.materialName ?? '';
    setComponentRows((rows) => rows.map((row) => row.key === editing.key ? { ...row, label: componentForm.label.trim(), materialId: componentForm.materialId, materialName, quantity } : row));
    setEditing(null); setComponentForm(null); setFormError('');
  };

  const save = async () => {
    const ok = await onSave({
      components: componentRows.map((row) => ({ label: row.label, materialId: row.materialId, quantity: row.quantity })),
      pieces: pieceRows.map((row) => ({ label: row.label, materialId: row.materialId, lengthMm: row.lengthMm, widthMm: row.widthMm, thicknessMm: row.thicknessMm, quantity: row.quantity })),
    });
    if (ok) setEditing(null);
  };
  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.type === 'delete-piece') { setPieceRows((rows) => rows.filter((row) => row.key !== confirm.key)); if (editing?.key === confirm.key) cancelEdit(); }
    if (confirm.type === 'delete-component') { setComponentRows((rows) => rows.filter((row) => row.key !== confirm.key)); if (editing?.key === confirm.key) cancelEdit(); }
    if (confirm.type === 'discard') reset();
    if (confirm.type === 'leave') { reset(); navigateTo(confirm.path, { force: true }); }
    setConfirm(null);
  };

  const woodOptions = (selectedId: string, selectedName: string) => {
    const groups = new Map<WoodStatus, MaterialAvailability[]>();
    for (const item of woods) groups.set(woodStatus(item), [...(groups.get(woodStatus(item)) ?? []), item]);
    return <>
      {selectedId && !woodFor(selectedId) ? <optgroup label="Material actual"><option value={selectedId} data-description="No figura como madera dimensional activa">{selectedName || 'Material actual'}</option></optgroup> : null}
      {[...groups].map(([status, items]) => <optgroup key={status} label={WOOD_GROUPS[status]}>
        {items.map((item) => <option key={item.id} value={item.id} data-description={woodDescription(item)} data-search={woodSearchText(item)}>{item.name}</option>)}
      </optgroup>)}
    </>;
  };
  const consumableOptions = (selectedId: string, selectedName: string) => <>
    {selectedId && !consumableFor(selectedId) ? <option value={selectedId} data-description="Ya no es consumible de producción activo">{selectedName || 'Material actual'}</option> : null}
    {consumables.map((item) => <option key={item.id} value={item.id} data-description={consumableDescription(item, availability.lowStockThreshold)} data-search={`${item.code} ${item.type}`}>{item.name}</option>)}
  </>;

  const totalCuts = pieceRows.reduce((sum, row) => sum + row.quantity, 0) * job.orderLine.quantity;
  const actionsDisabled = !editable || !!editing || busy;

  const pieceEditor = (row: PieceRow): ReactNode => {
    if (!pieceForm || !editing) return null;
    const item = woodFor(pieceForm.materialId);
    const thicknessMm = pieceForm.thickness ? toMillimeters(pieceForm.thickness, unit) : 0;
    const thicknesses = item?.availableThicknessesMm ?? [];
    const compat = pieceForm.materialId ? pieceCompatibility(item, thicknessMm) : null;
    const quantity = Number(pieceForm.quantity) || 0;
    return <div className="edit-form" role="group" aria-label={editing.isNew ? 'Nueva pieza' : `Editar pieza ${row.label}`}>
      <p className="edit-form__title">{editing.isNew ? (row.label ? `Nueva pieza · copia de ${row.label.replace(/ copia$/, '')}` : 'Nueva pieza') : `Editar «${row.label}»`}</p>
      <div className="edit-form__grid">
        <label className="edit-form__wide">Pieza<input autoFocus value={pieceForm.label} maxLength={120} onChange={(event) => setPieceForm({ ...pieceForm, label: event.target.value })} placeholder="Ej. Cubierta" /></label>
        <label className="edit-form__wide">Material / madera<SelectField searchable value={pieceForm.materialId} placeholder="Busca la madera" searchPlaceholder="Buscar por nombre, código o alto (18 mm)…" emptyText={woods.length ? 'No encontramos materiales con ese nombre.' : 'No hay materiales dimensionales activos.'} onChange={(event) => choosePieceMaterial(event.target.value)}>{woodOptions(pieceForm.materialId, row.materialName)}</SelectField></label>
        <label>Largo<input type="number" inputMode="decimal" min="0" step="any" value={pieceForm.length} onChange={(event) => setPieceForm({ ...pieceForm, length: event.target.value })} /></label>
        <label>Ancho<input type="number" inputMode="decimal" min="0" step="any" value={pieceForm.width} onChange={(event) => setPieceForm({ ...pieceForm, width: event.target.value })} /></label>
        <label>Alto<input type="number" inputMode="decimal" min="0" step="any" value={pieceForm.thickness} onChange={(event) => setPieceForm({ ...pieceForm, thickness: event.target.value, thicknessSuggested: false })} />
          {pieceForm.thicknessSuggested ? <small className="edit-form__hint">Sugerido por las piezas disponibles.</small> : null}
        </label>
        <label>Cantidad<input type="number" inputMode="numeric" min="1" step="1" value={pieceForm.quantity} onChange={(event) => setPieceForm({ ...pieceForm, quantity: event.target.value })} /></label>
      </div>
      {thicknesses.length > 1 || (thicknesses.length === 1 && thicknessMm && thicknessMm !== thicknesses[0]) ? <div className="thickness-choice" role="group" aria-label="Altos disponibles">
        <span>{thicknesses.length > 1 ? 'Elige el alto de la variante:' : 'Alto disponible:'}</span>
        {thicknesses.map((value) => <button key={value} type="button" className={`thickness-chip${value === thicknessMm ? ' is-selected' : ''}`} aria-pressed={value === thicknessMm} onClick={() => setPieceForm({ ...pieceForm, thickness: fromMillimeters(value, unit), thicknessSuggested: false })}>{thicknesses.length === 1 ? `Usar ${value} mm` : `${value} mm`}</button>)}
      </div> : null}
      {item ? <WoodSummary item={item} pieces={pieces} /> : null}
      {compat ? <div className={`compat-note compat-note--${compat.tone}`} role="status">
        <span><Icon name={compat.tone === 'ok' ? 'check' : 'warning'} size={16} /> {thicknessMm && pieceForm.length && pieceForm.width ? <b>{formatDimensions(toMillimeters(pieceForm.length, unit), toMillimeters(pieceForm.width, unit), thicknessMm)} ×{quantity}. </b> : null}{compat.detail}</span>
        {compat.label === 'Sin piezas físicas' || compat.label === 'Stock reservado' ? <span className="compat-note__actions">
          <button type="button" className="text-button" onClick={(event) => (event.currentTarget.closest('.edit-form')?.querySelector<HTMLElement>('.select-field__trigger'))?.focus()}>Elegir otro material</button>
          <AppLink className="text-button" href={`/inventario/${pieceForm.materialId}`}>Ver inventario</AppLink>
        </span> : null}
      </div> : null}
      {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      <div className="edit-form__actions">
        <button type="button" className="button button--quiet button--small" onClick={cancelEdit}>Cancelar</button>
        <button type="button" className="button button--primary button--small" onClick={applyPiece}>{editing.isNew ? 'Agregar pieza' : 'Aplicar cambios'}</button>
      </div>
    </div>;
  };

  const componentEditor = (row: ComponentRow): ReactNode => {
    if (!componentForm || !editing) return null;
    const item = consumableFor(componentForm.materialId);
    const needed = (Number(componentForm.quantity) || 0) * job.orderLine.quantity;
    const compat = componentForm.materialId && needed > 0 ? componentCompatibility(item, needed) : null;
    return <div className="edit-form" role="group" aria-label={editing.isNew ? 'Nuevo material de consumo' : `Editar material ${row.label}`}>
      <p className="edit-form__title">{editing.isNew ? 'Nuevo material de consumo' : `Editar «${row.label}»`}</p>
      <div className="edit-form__grid edit-form__grid--component">
        <label>Descripción<input autoFocus value={componentForm.label} maxLength={120} onChange={(event) => setComponentForm({ ...componentForm, label: event.target.value })} placeholder="Ej. Tornillos de fijación" /></label>
        <label>Material<SelectField searchable value={componentForm.materialId} placeholder="Busca el consumible" searchPlaceholder="Buscar consumible por nombre o código…" emptyText={consumables.length ? 'No encontramos consumibles con ese nombre.' : 'No hay consumibles de producción activos.'} onChange={(event) => setComponentForm({ ...componentForm, materialId: event.target.value })}>{consumableOptions(componentForm.materialId, row.materialName)}</SelectField></label>
        <label>Cant. por producto<input type="number" inputMode="decimal" min="0.001" step="any" value={componentForm.quantity} onChange={(event) => setComponentForm({ ...componentForm, quantity: event.target.value })} /></label>
      </div>
      {item ? <ConsumableSummary item={item} lowStockThreshold={availability.lowStockThreshold} /> : null}
      {compat ? <div className={`compat-note compat-note--${compat.tone}`} role="status"><span><Icon name={compat.tone === 'ok' ? 'check' : 'warning'} size={16} /> <b>{compat.label}.</b> {compat.detail}{job.orderLine.quantity > 1 ? ` (${componentForm.quantity} por producto × ${job.orderLine.quantity})` : ''}</span></div> : null}
      {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      <div className="edit-form__actions">
        <button type="button" className="button button--quiet button--small" onClick={cancelEdit}>Cancelar</button>
        <button type="button" className="button button--primary button--small" onClick={applyComponent}>{editing.isNew ? 'Agregar material' : 'Aplicar cambios'}</button>
      </div>
    </div>;
  };

  return <div className="materials-editor" ref={tableRef}>
    {!editable ? <p className="editor-lock" role="note">{lockMessage(job)}</p> : null}

    <section className="editor-section" aria-labelledby="pieces-heading">
      <header className="editor-section__head">
        <div><h3 id="pieces-heading">Piezas para cortar</h3><p>{pieceRows.length} {pieceRows.length === 1 ? 'pieza' : 'piezas'} · {totalCuts} a cortar{job.orderLine.quantity > 1 ? ` (×${job.orderLine.quantity} productos)` : ''} · medidas en mm (Largo × Ancho × Alto)</p></div>
        {editable ? <div className="editor-section__tools">
          <label className="unit-inline">Editar en<SelectField value={unit} aria-label="Unidad de edición de medidas" onChange={(event) => setUnit(event.target.value as DimensionUnit)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></SelectField></label>
          <button type="button" className="button button--quiet button--small" disabled={actionsDisabled} onClick={addPiece}><Icon name="create" size={16} />Agregar pieza</button>
        </div> : null}
      </header>
      {pieceRows.length ? <div className="table-wrap editor-table"><table>
        <thead><tr><th>Pieza</th><th>Material</th><th className="numeric-cell">Largo</th><th className="numeric-cell">Ancho</th><th className="numeric-cell">Alto</th><th className="numeric-cell">Cantidad</th><th>Estado</th>{editable ? <th><span className="sr-only">Acciones</span></th> : null}</tr></thead>
        <tbody>{pieceRows.map((row) => editing?.kind === 'piece' && editing.key === row.key
          ? <tr key={row.key} className="editor-row is-editing"><td colSpan={editable ? 8 : 7}>{pieceEditor(row)}</td></tr>
          : <tr key={row.key} data-row-id={row.sourceId ?? row.key} className={`editor-row${highlighted.includes(row.sourceId ?? '') ? ' is-highlighted' : ''}`}>
            <td data-label="Pieza"><b>{row.label}</b><small>{formatDimensions(row.lengthMm, row.widthMm, row.thicknessMm)}</small></td>
            <td data-label="Material">{row.materialName}</td>
            <td data-label="Largo" className="numeric-cell">{row.lengthMm}</td>
            <td data-label="Ancho" className="numeric-cell">{row.widthMm}</td>
            <td data-label="Alto" className="numeric-cell">{row.thicknessMm}</td>
            <td data-label="Cantidad" className="numeric-cell">{row.quantity}</td>
            <td data-label="Estado">{editable ? <Badge compat={pieceCompatibility(woodFor(row.materialId), row.thicknessMm)} /> : <span className="muted">Registrada</span>}</td>
            {editable ? <td className="editor-row__actions"><RowActions kind="pieza" label={row.label} disabled={actionsDisabled} onEdit={() => openPiece(row, false)} onDuplicate={() => duplicatePiece(row)} onDelete={() => setConfirm({ type: 'delete-piece', key: row.key, label: row.label })} /></td> : null}
          </tr>)}</tbody>
      </table></div> : <div className="editor-empty"><b>Sin piezas para cortar</b><p>{editable ? 'Agrega las piezas que saldrán de la madera; el plano de corte las ubicará en las tablas disponibles.' : 'Esta orden no tiene piezas de corte registradas.'}</p></div>}
    </section>

    <section className="editor-section" aria-labelledby="components-heading">
      <header className="editor-section__head">
        <div><h3 id="components-heading">Materiales de consumo</h3><p>Tornillos, colas, barnices y otros consumibles de producción.</p></div>
        {editable ? <div className="editor-section__tools"><button type="button" className="button button--quiet button--small" disabled={actionsDisabled} onClick={addComponent}><Icon name="create" size={16} />Agregar material</button></div> : null}
      </header>
      {componentRows.length ? <div className="table-wrap editor-table editor-table--components"><table>
        <thead><tr><th>Descripción</th><th>Material</th><th className="numeric-cell">Por producto</th><th className="numeric-cell">Necesario</th><th>Estado</th>{editable ? <th><span className="sr-only">Acciones</span></th> : null}</tr></thead>
        <tbody>{componentRows.map((row) => {
          const item = consumableFor(row.materialId);
          const needed = row.quantity * job.orderLine.quantity;
          return editing?.kind === 'component' && editing.key === row.key
            ? <tr key={row.key} className="editor-row is-editing"><td colSpan={editable ? 6 : 5}>{componentEditor(row)}</td></tr>
            : <tr key={row.key} className="editor-row">
              <td data-label="Descripción"><b>{row.label}</b></td>
              <td data-label="Material">{row.materialName}</td>
              <td data-label="Por producto" className="numeric-cell">{row.quantity}</td>
              <td data-label="Necesario" className="numeric-cell">{item ? stockQuantity(needed, item.unit) : needed}</td>
              <td data-label="Estado">{editable ? <Badge compat={componentCompatibility(item, needed)} /> : <span className="muted">Registrado</span>}</td>
              {editable ? <td className="editor-row__actions"><RowActions kind="material" label={row.label} disabled={actionsDisabled} onEdit={() => openComponent(row, false)} onDuplicate={() => duplicateComponent(row)} onDelete={() => setConfirm({ type: 'delete-component', key: row.key, label: row.label })} /></td> : null}
            </tr>;
        })}</tbody>
      </table></div> : <div className="editor-empty"><b>Sin materiales de consumo</b><p>{editable ? 'Opcional: agrega los consumibles que se reservarán junto con las tablas.' : 'Esta orden no tiene consumibles registrados.'}</p></div>}
    </section>

    {editable ? <div className={`editor-savebar${dirty ? ' is-dirty' : ''}`} role="region" aria-label="Guardar materiales y piezas">
      <div className="editor-savebar__status">{dirty ? <><span className="dirty-dot" aria-hidden="true" /><b>Cambios sin guardar</b></> : <span>Sin cambios pendientes</span>}<small>{editing ? 'Aplica o cancela la fila en edición antes de guardar.' : 'Los cambios se aplicarán a esta orden de producción.'}</small></div>
      <div className="editor-savebar__actions">
        <button type="button" className="button button--quiet" disabled={!dirty || busy} onClick={() => setConfirm({ type: 'discard' })}>Descartar cambios</button>
        <button type="button" className="button button--primary" disabled={!listDirty || !!editing || busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar cambios de materiales y piezas'}</button>
      </div>
    </div> : null}

    <ConfirmDialog
      open={!!confirm}
      tone={confirm?.type === 'leave' || confirm?.type === 'discard' ? 'warning' : 'danger'}
      title={confirm?.type === 'delete-piece' ? `Eliminar «${confirm.label}»` : confirm?.type === 'delete-component' ? `Eliminar «${confirm.label}»` : confirm?.type === 'discard' ? 'Descartar cambios' : 'Tienes cambios sin guardar'}
      confirmLabel={confirm?.type === 'delete-piece' ? 'Eliminar pieza' : confirm?.type === 'delete-component' ? 'Eliminar material' : confirm?.type === 'discard' ? 'Descartar cambios' : 'Salir sin guardar'}
      cancelLabel={confirm?.type === 'leave' || confirm?.type === 'discard' ? 'Seguir editando' : 'Cancelar'}
      onConfirm={confirmAction}
      onCancel={() => setConfirm(null)}
    >
      {confirm?.type === 'delete-piece' ? <p>Esta pieza dejará de formar parte del plano de corte de esta orden cuando guardes los cambios.</p>
        : confirm?.type === 'delete-component' ? <p>Este material dejará de reservarse para esta orden cuando guardes los cambios.</p>
          : confirm?.type === 'discard' ? <p>Se restaurarán las piezas y materiales guardados de esta orden.</p>
            : <p>Si sales ahora, se perderán los cambios de materiales y piezas que todavía no guardaste.</p>}
    </ConfirmDialog>
  </div>;
}
