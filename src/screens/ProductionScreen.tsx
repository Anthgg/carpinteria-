import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api, dateTime, toMillimeters } from '../api';
import { CutPlan } from '../CutPlan';
import type { PlanBoard } from '../CutPlan';
import type { AppRoute, InventoryItem } from '../App';
import { AppLink, ModuleTabs } from '../components/ModuleTabs';
import { SelectField } from '../components/SelectField';
import { CuttingDiagnosis } from '../components/CuttingDiagnosis';
import { availableStock, formatDimensions, fromMillimeters, stockQuantity } from '../dimensions';
import type { DimensionUnit, PhysicalPiece } from '../dimensions';

type PieceRow = { label: string; materialId: string; length: string; width: string; thickness: string; quantity: string; thicknessAuto?: boolean };
const emptyPieceRow = (): PieceRow => ({ label: '', materialId: '', length: '', width: '', thickness: '', quantity: '1' });
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const STATE_LABELS: Record<string, [string, string]> = {
  RESERVED: ['reservada', 'reservadas'], CONSUMED: ['consumida', 'consumidas'], PENDING_DISPOSITION: ['por decidir', 'por decidir'], DISCARDED: ['descartada', 'descartadas'],
};

type Run = <T,>(action: () => Promise<T>, success: string) => Promise<T | undefined>;
type Job = {
  id: string; stage: string; status: string; progress: number; updatedAt: string; estimatedAt?: string | null;
  order: { id: string; code: string; status: string; customer: { name: string } };
  orderLine: { name: string; quantity: number; lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null };
  components: Array<{ id: string; label: string; quantity: string | number; unit: string; material: InventoryItem }>;
  requirements: Array<{ id: string; label: string; lengthMm: number; widthMm: number; thicknessMm: number; quantity: number; material: InventoryItem }>;
  stageHistory: Array<{ id: string; stage: string; progress: number; createdAt: string; note?: string | null; user?: { name: string } | null }>;
  notes: Array<{ id: string; visibility: string; content: string; createdAt: string; user?: { name: string } | null }>;
  incidents: Array<{ id: string; title: string; description: string; isOpen: boolean; createdAt: string }>;
  photos: Array<{ id: string; url: string; caption?: string | null; public: boolean; createdAt: string }>;
  cutPlans: Array<{ id: string; result: Record<string, any>; confirmedAt?: string | null; createdAt: string }>;
  pieceReservations: Array<{ id: string; status: string; piece: { code: string; state: string; lengthMm: number; widthMm: number; thicknessMm: number; material: { name: string } } }>;
};

const stages = [
  ['ORDER_RECEIVED', 'Pedido recibido', 0], ['MATERIALS_RESERVED', 'Materiales reservados', 15], ['CUTTING', 'Corte', 30],
  ['ASSEMBLY', 'Ensamblaje', 50], ['SANDING', 'Lijado', 65], ['FINISHING', 'Acabado', 80], ['QUALITY_CONTROL', 'Control de calidad', 90], ['READY', 'Listo', 100],
] as const;

export function ProductionScreen({ jobs, inventory, pieces, canManage, busy, run, route }: { jobs: Job[]; inventory: InventoryItem[]; pieces: PhysicalPiece[]; canManage: boolean; busy: boolean; run: Run; route: AppRoute }) {
  const selectedId = route.view === 'detail' ? route.id ?? '' : '';
  const routeTabs: Record<string, string> = { materiales: 'materials', corte: 'cutting', bitacora: 'log', incidencias: 'issues' };
  const activeTab = routeTabs[route.tab ?? 'materiales'] ?? 'materials';
  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshJob, setRefreshJob] = useState(0);
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>('mm');
  const [strategy, setStrategy] = useState('OFFCUTS_FIRST');
  const [plan, setPlan] = useState<any>(null);
  const [componentRows, setComponentRows] = useState([{ label: '', materialId: '', quantity: '1' }]);
  const [pieceRows, setPieceRows] = useState<PieceRow[]>([emptyPieceRow()]);
  const [note, setNote] = useState({ content: '', visibility: 'INTERNAL' });
  const [incident, setIncident] = useState({ title: '', description: '' });
  const [incidentOpen, setIncidentOpen] = useState(false);
  const incidentDialog = useRef<HTMLDialogElement>(null);
  const [publicPhoto, setPublicPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [nextStage, setNextStage] = useState('');
  const [stageNote, setStageNote] = useState('');
  const materials = inventory.filter((item) => item.type === 'MATERIAL' && item.active !== false);
  const visibleJobs = useMemo(() => jobs.filter((entry) => `${entry.order.code} ${entry.orderLine.name} ${entry.order.customer.name}`.toLowerCase().includes(search.toLowerCase())), [jobs, search]);

  useEffect(() => {
    if (!selectedId) { setJob(null); setPlan(null); setLoadingJob(false); return; }
    let active = true;
    setJob(null);
    setPlan(null);
    setLoadingJob(true);
    api<Job>(`/production/${selectedId}`).then((value) => { if (active) { setJob(value); setPlan(null); } }).catch(() => { if (active) setJob(null); }).finally(() => { if (active) setLoadingJob(false); });
    return () => { active = false; };
  }, [selectedId, refreshJob]);
  useEffect(() => {
    const dialog = incidentDialog.current;
    if (!dialog) return;
    if (incidentOpen && !dialog.open) dialog.showModal();
    if (!incidentOpen && dialog.open) dialog.close();
  }, [incidentOpen]);
  const refresh = () => setRefreshJob((value) => value + 1);
  const runThenRefresh = async <T,>(action: () => Promise<T>, success: string) => { const result = await run(action, success); if (result !== undefined) refresh(); return result; };
  const currentPlan = plan ?? job?.cutPlans?.[0];
  const planResult = currentPlan?.boards ? currentPlan : currentPlan?.result;
  const saveMaterials = async (event: FormEvent) => {
    event.preventDefault(); if (!job) return;
    const result = await runThenRefresh(() => api(`/production/${job.id}/materials`, { method: 'PUT', body: JSON.stringify({
      components: componentRows.filter((row) => row.materialId).map((row) => ({ label: row.label, materialId: row.materialId, quantity: Number(row.quantity) })),
      pieces: pieceRows.filter((row) => row.materialId).map((row) => ({ label: row.label, materialId: row.materialId, lengthMm: toMillimeters(row.length, dimensionUnit), widthMm: toMillimeters(row.width, dimensionUnit), thicknessMm: toMillimeters(row.thickness, dimensionUnit), quantity: Number(row.quantity) })),
    }) }), 'Materiales y piezas de fabricación guardados.');
    if (result) { setComponentRows([{ label: '', materialId: '', quantity: '1' }]); setPieceRows([emptyPieceRow()]); }
  };
  const updatePiece = (index: number, patch: Partial<PieceRow>) => setPieceRows((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  // El alto se hereda solo si todas las piezas disponibles del material tienen el mismo; con varios altos, el operario elige.
  const choosePieceMaterial = (index: number, materialId: string) => {
    const { thicknesses } = availableStock(pieces, materialId);
    setPieceRows((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      if (thicknesses.length === 1 && (!row.thickness || row.thicknessAuto)) return { ...row, materialId, thickness: fromMillimeters(thicknesses[0], dimensionUnit), thicknessAuto: true };
      return row.thicknessAuto ? { ...row, materialId, thickness: '', thicknessAuto: false } : { ...row, materialId };
    }));
  };
  const materialDescription = (item: InventoryItem) => {
    const { available, thicknesses } = availableStock(pieces, item.id);
    if (available.length) return `${plural(available.length, 'pieza física disponible', 'piezas físicas disponibles')} · alto ${thicknesses.join(' / ')} mm`;
    return Number(item.stock) > 0 ? `Sin piezas físicas · ${stockQuantity(Number(item.stock), item.unit)} en stock suelto` : 'Sin piezas físicas disponibles';
  };
  const loadDefinedPieces = () => {
    if (!job) return;
    setDimensionUnit('mm');
    setPieceRows(job.requirements.length ? job.requirements.map((piece) => ({ label: piece.label, materialId: piece.material.id, length: String(piece.lengthMm), width: String(piece.widthMm), thickness: String(piece.thicknessMm), quantity: String(piece.quantity) })) : [emptyPieceRow()]);
    setComponentRows(job.components.length ? job.components.map((component) => ({ label: component.label, materialId: component.material.id, quantity: String(Number(component.quantity)) })) : [{ label: '', materialId: '', quantity: '1' }]);
  };
  const simulate = async () => {
    if (!job) return;
    const result = await run(() => api<any>(`/production/${job.id}/cutting/simulate`, { method: 'POST', body: JSON.stringify({ strategy }) }), 'Simulación lista. El inventario no se modificó.');
    if (result) { setPlan(result); refresh(); }
  };
  const reserve = async () => {
    if (!job || !currentPlan) return;
    await runThenRefresh(() => api(`/production/${job.id}/cutting/${currentPlan.id}/confirm`, { method: 'POST' }), 'Plan confirmado. Las piezas seleccionadas quedaron reservadas.');
  };
  const confirmCut = async () => { if (job) await runThenRefresh(() => api(`/production/${job.id}/cutting/complete`, { method: 'POST' }), 'Corte real confirmado. Los retazos esperan decisión del operario.'); };
  const saveNote = async (event: FormEvent) => { event.preventDefault(); if (!job) return; const result = await runThenRefresh(() => api(`/production/${job.id}/notes`, { method: 'POST', body: JSON.stringify(note) }), note.visibility === 'PUBLIC' ? 'Actualización pública guardada y enviada.' : 'Nota interna guardada.'); if (result) setNote({ content: '', visibility: 'INTERNAL' }); };
  const saveIncident = async (event: FormEvent) => { event.preventDefault(); if (!job) return; const result = await runThenRefresh(() => api(`/production/${job.id}/incidents`, { method: 'POST', body: JSON.stringify(incident) }), 'Incidencia registrada.'); if (result) { setIncident({ title: '', description: '' }); setIncidentOpen(false); } };
  const uploadPhoto = async (event: FormEvent) => {
    event.preventDefault(); if (!job || !photoFile) return;
    const body = new FormData(); body.set('photo', photoFile); body.set('caption', photoCaption); body.set('public', String(publicPhoto));
    const result = await runThenRefresh(() => api(`/production/${job.id}/photos`, { method: 'POST', body }), publicPhoto ? 'Fotografía pública agregada al seguimiento.' : 'Fotografía interna guardada.');
    if (result) { setPhotoFile(null); setPhotoCaption(''); setPublicPhoto(false); const input = document.getElementById('production-photo') as HTMLInputElement | null; if (input) input.value = ''; }
  };
  const advance = async (event: FormEvent) => { event.preventDefault(); if (!job || !nextStage) return; const result = await runThenRefresh(() => api(`/production/${job.id}/stage`, { method: 'POST', body: JSON.stringify({ stage: nextStage, note: stageNote }) }), `Etapa actualizada: ${stages.find(([value]) => value === nextStage)?.[1]}.`); if (result) { setNextStage(''); setStageNote(''); } };
  const progressIndex = job ? stages.findIndex(([stage]) => stage === job.stage) : 0;

  return <>
    <ModuleTabs label="Producción" activeHref={route.view === 'orders' || route.view === 'detail' ? '/produccion/ordenes' : '/produccion'} tabs={[{ label: 'Tablero', href: '/produccion' }, { label: 'Órdenes', href: '/produccion/ordenes' }]} />
    <div className="page-heading"><div><p className="eyebrow">ORDEN DE TRABAJO · OPERACIÓN DEL TALLER</p><h1 tabIndex={-1}>{route.view === 'board' ? 'Tablero de producción.' : route.view === 'orders' ? 'Órdenes de producción.' : job?.orderLine.name ?? 'Orden de producción.'}</h1><p>{route.view === 'board' ? 'Vista rápida de los trabajos por etapa.' : route.view === 'orders' ? 'Busca una orden y abre su ficha independiente.' : job ? `${job.order.code} · ${job.order.customer.name} · ${job.status === 'ACTIVE' ? `${job.progress}% en proceso` : job.status}` : 'Prepara materiales, revisa el plano y documenta cada etapa.'}</p></div><div className="page-heading__actions"><span className="production-count"><b>{jobs.filter((entry) => entry.status !== 'COMPLETED').length}</b> trabajos activos</span></div></div>
    {route.view === 'orders' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">PRODUCCIÓN</p><h2>{jobs.length} órdenes</h2></div><div className="search-box search-box--small"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Orden, pedido, producto o cliente" aria-label="Buscar órdenes de producción" /></div></div>{visibleJobs.length ? <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Pedido</th><th>Producto</th><th>Cliente</th><th>Etapa</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>{visibleJobs.map((entry) => <tr key={entry.id}><td className="mono">OP {entry.id.slice(0, 8).toUpperCase()}</td><td><AppLink className="table-row-link" href={`/pedidos/${entry.order.id}`}>{entry.order.code}</AppLink></td><td>{entry.orderLine.name}</td><td>{entry.order.customer.name}</td><td>{stages.find(([stage]) => stage === entry.stage)?.[1] ?? entry.stage}</td><td>{entry.progress}%</td><td>{entry.status === 'PAUSED' ? 'Pausada' : entry.status === 'COMPLETED' ? 'Terminada' : 'Activa'}</td><td><AppLink className="text-button" href={`/produccion/${entry.id}/materiales`}>Abrir orden →</AppLink></td></tr>)}</tbody></table></div> : <div className="empty-inline"><b>Sin órdenes de producción</b><p>Las órdenes aparecen cuando un pedido tiene una línea de fabricación.</p></div>}</section> : null}
    <div className="production-layout">{route.view === 'board' ? <aside className="card job-list-card"><div className="card-heading"><div><p className="eyebrow">COLA DEL TALLER</p><h2>Trabajos por etapa</h2></div><span className="queue-count">{jobs.length}</span></div><div className="search-box search-box--small"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar trabajo" aria-label="Buscar trabajo" /></div><div className="job-list production-board production-board--full">
          {stages.map(([stage, label]) => {
            const stageJobs = visibleJobs.filter((entry) => entry.stage === stage);
            return <section className="production-stage-column" key={stage} aria-label={label}>
              <header className="production-stage-column__heading"><span className="stage-marker" /><h3>{label}</h3><b>{stageJobs.length}</b></header>
              <div className="production-stage-column__cards">{stageJobs.map((entry) => <AppLink href={`/produccion/${entry.id}/materiales`} key={entry.id} className="job-list-item production-kanban-card">
                <div className="job-list-item__top"><b className="mono">{entry.order.code}</b>{entry.status === 'PAUSED' ? <span className="job-status--paused">Pausada</span> : entry.status === 'COMPLETED' ? <span className="pill pill--success">Terminada</span> : null}</div>
                <strong>{entry.orderLine.name}</strong><small>{entry.order.customer.name} · ×{entry.orderLine.quantity}</small>
                <div className="mini-progress"><span style={{ width: `${entry.progress}%` }} /></div>
                <span className="job-list-item__stage"><span>{label}</span><b>{entry.progress}%</b></span>
                <span className="production-kanban-card__note">Incidencias y fotos · abrir ficha</span>
              </AppLink>)}{stageJobs.length === 0 ? <div className="production-stage-empty">Sin órdenes en esta etapa</div> : null}</div>
            </section>;
          })}
        </div></aside> : null}{route.view === 'detail' ? <section className="production-workspace">{loadingJob ? <div className="card loading-state"><span className="spinner" />Cargando orden de trabajo…</div> : !job ? <div className="card empty-state"><span className="empty-symbol">⌑</span><h2>Orden no encontrada</h2><p>Vuelve a Órdenes y selecciona un trabajo existente.</p><AppLink className="button button--quiet" href="/produccion/ordenes">Ver órdenes</AppLink></div> : <>
        <article className="card job-overview"><div className="job-overview__top"><div><p className="eyebrow"><span className="mono">OP {job.id.slice(0, 8).toUpperCase()}</span> <i>·</i> {job.order.code} <i>·</i> {job.order.customer.name}</p><h2>{job.orderLine.name}</h2><p>Cantidad {job.orderLine.quantity}{job.orderLine.lengthMm ? ` · ${job.orderLine.lengthMm} × ${job.orderLine.widthMm} × ${job.orderLine.heightMm} mm` : ''}</p></div><div className="job-overview__state"><b>{job.status === 'PAUSED' ? 'Pausada' : job.status === 'COMPLETED' ? 'Completada' : 'En marcha'}</b><small>Actualizado {dateTime(job.updatedAt)}</small></div></div><div className="progress-large"><div className="progress-large__heading"><span>Avance de fabricación</span><b>{job.progress}%</b></div><div className="progress-large__track"><span style={{ width: `${job.progress}%` }} /></div></div><div className="stage-trackline">{stages.map(([value, label], index) => <div className={`stage-point ${index <= progressIndex ? 'is-done' : ''} ${value === job.stage ? 'is-current' : ''}`} key={value}><span>{index < progressIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><small>{label}</small></div>)}</div><div className="job-overview__actions">{job.status === 'PAUSED' ? <button type="button" className="button button--primary" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/resume`, { method: 'POST', body: JSON.stringify({ note: 'Reanudación desde el panel' }) }), 'Producción reanudada.')}>▶ Reanudar</button> : job.status !== 'COMPLETED' ? <button type="button" className="button button--quiet" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/pause`, { method: 'POST', body: JSON.stringify({ note: 'Pausa desde el panel' }) }), 'Producción pausada.')}>Ⅱ Pausar</button> : <span className="pill pill--success">Trabajo completado</span>}{job.stage === 'MATERIALS_RESERVED' && job.status === 'ACTIVE' ? <button type="button" className="button button--primary" onClick={() => void confirmCut()}>✓ Confirmar corte real</button> : null}</div></article>
        <ModuleTabs label={`Orden ${job.order.code}`} activeHref={`/produccion/${job.id}/${route.tab ?? 'materiales'}`} tabs={[{ label: 'Materiales y piezas', href: `/produccion/${job.id}/materiales` }, { label: 'Plano de corte', href: `/produccion/${job.id}/corte` }, { label: 'Bitácora', href: `/produccion/${job.id}/bitacora` }, { label: 'Incidencias y fotos', href: `/produccion/${job.id}/incidencias` }]} /><div className="production-columns production-columns--tabs"><section className={'card form-card production-tab-panel' + (activeTab === 'materials' ? '' : ' is-hidden')}>
  <div className="card-heading"><div><p className="eyebrow">DISEÑO DEL OPERARIO</p><h2>Materiales y piezas</h2><p>El material se elige para este pedido y cada pieza se define manualmente.</p></div><span className="settings-icon">▱</span></div><DefinedMaterials job={job} canEdit={job.stage === 'ORDER_RECEIVED'} onEdit={loadDefinedPieces} /><form onSubmit={saveMaterials} className="materials-form"><div className="form-subhead"><b>Materiales de consumo</b><button type="button" className="text-button" onClick={() => setComponentRows([...componentRows, { label: '', materialId: '', quantity: '1' }])}>＋ Agregar material</button></div>{componentRows.map((row, index) => <div className="repeat-row repeat-row--component" key={`c-${index}`}><label>Descripción<input value={row.label} onChange={(e) => setComponentRows(componentRows.map((value, i) => i === index ? { ...value, label: e.target.value } : value))} placeholder="Ej. Tornillos" /></label><label>Material<SelectField searchable value={row.materialId} onChange={(e) => setComponentRows(componentRows.map((value, i) => i === index ? { ...value, materialId: e.target.value } : value))}><option value="">Seleccionar</option>{inventory.filter((item) => item.active && item.productionConsumable).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</SelectField></label><label>Cant. por producto<input type="number" min="0.001" step="0.001" value={row.quantity} onChange={(e) => setComponentRows(componentRows.map((value, i) => i === index ? { ...value, quantity: e.target.value } : value))} /></label>{componentRows.length > 1 ? <button type="button" className="icon-button" aria-label="Quitar material" onClick={() => setComponentRows(componentRows.filter((_, i) => i !== index))}>×</button> : null}</div>)}<div className="form-subhead form-subhead--spaced"><b>Piezas para cortar</b><div className="form-subhead__tools"><label className="unit-inline">Unidad<SelectField value={dimensionUnit} aria-label="Unidad de las medidas" onChange={(e) => setDimensionUnit(e.target.value as DimensionUnit)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></SelectField></label><button type="button" className="text-button" onClick={() => setPieceRows([...pieceRows, emptyPieceRow()])}>＋ Agregar pieza</button></div></div><p className="field-hint materials-form__legend">Tres medidas por pieza: <b>Largo × Ancho × Alto</b>. En tablas y retazos de madera, el alto es el espesor. Se guardan en milímetros.</p>{pieceRows.map((row, index) => { const material = materials.find((item) => item.id === row.materialId); return <div className="piece-editor" key={`p-${index}`}><div className="piece-editor__top"><b>Pieza {String(index + 1).padStart(2, '0')}</b>{pieceRows.length > 1 ? <button type="button" className="text-button text-button--danger" onClick={() => setPieceRows(pieceRows.filter((_, i) => i !== index))}>Quitar ×</button> : null}</div><div className="piece-editor__grid"><label className="piece-editor__name">Pieza<input value={row.label} onChange={(e) => updatePiece(index, { label: e.target.value })} placeholder="Ej. Cubierta" /></label><label className="piece-editor__material">Material / madera<SelectField searchable value={row.materialId} placeholder="Busca la madera" onChange={(e) => choosePieceMaterial(index, e.target.value)}><option value="">Seleccionar</option>{materials.map((item) => <option key={item.id} value={item.id} data-description={materialDescription(item)}>{item.name}</option>)}</SelectField></label><label>Largo<input type="number" min="0.1" step="0.1" inputMode="decimal" value={row.length} onChange={(e) => updatePiece(index, { length: e.target.value })} /></label><label>Ancho<input type="number" min="0.1" step="0.1" inputMode="decimal" value={row.width} onChange={(e) => updatePiece(index, { width: e.target.value })} /></label><label>Alto<input type="number" min="0.1" step="0.1" inputMode="decimal" value={row.thickness} onChange={(e) => updatePiece(index, { thickness: e.target.value, thicknessAuto: false })} /></label><label>Cantidad<input type="number" min="1" step="1" value={row.quantity} onChange={(e) => updatePiece(index, { quantity: e.target.value })} /></label></div>{material ? <MaterialStockHint item={material} pieces={pieces} thicknessMm={row.thickness ? toMillimeters(row.thickness, dimensionUnit) : 0} auto={!!row.thicknessAuto} canManage={canManage} onPickThickness={(value) => updatePiece(index, { thickness: fromMillimeters(value, dimensionUnit), thicknessAuto: false })} /> : null}</div>; })}<div className="materials-form__submit"><button type="submit" className="button button--primary" disabled={busy || job.stage !== 'ORDER_RECEIVED'}>Guardar selección de materiales</button><small>Guardar reemplaza los materiales y piezas definidos para esta orden.</small></div></form></section>
          <section className={'card cut-card production-tab-panel' + (activeTab === 'cutting' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">SIMULACIÓN · SIN CAMBIOS DE STOCK</p><h2>Plano de corte</h2><p>Una sugerencia para revisar antes de reservar las tablas.</p></div><span className="settings-icon">⌁</span></div><div className="cut-controls"><label>Estrategia<SelectField value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="OFFCUTS_FIRST">Usar retazos primero</option><option value="FULL_BOARDS_FIRST">Usar tablas completas</option></SelectField></label><button type="button" className="button button--primary" disabled={busy || !job.requirements.length || job.stage !== 'ORDER_RECEIVED'} onClick={() => void simulate()}>⟳ Calcular sugerencia</button></div>{planResult ? <><div className="cut-summary"><div><b>{planResult.summary.placedParts}/{planResult.summary.requestedParts}</b><small>piezas ubicadas</small></div><div><b>{planResult.summary.boardsUsed}</b><small>tablas sugeridas</small></div><div><b>{planResult.summary.cutsEstimated}</b><small>cortes estimados</small></div><div><b>{planResult.summary.utilizationPercent}%</b><small>aprovechamiento</small></div></div>{planResult.unplaced?.length ? <CuttingDiagnosis diagnostics={planResult.diagnostics} legacyUnplaced={planResult.unplaced} jobId={job.id} canManage={canManage} canEdit={job.stage === 'ORDER_RECEIVED' && job.status === 'ACTIVE'} /> : null}<div className="cut-board-list">{(planResult.boards as PlanBoard[]).map((board) => <CutPlan key={board.id} board={board} />)}</div>{planResult.unplaced?.length ? null : <div className="cut-actions"><button type="button" className="button button--primary" disabled={busy || job.stage !== 'ORDER_RECEIVED' || !!currentPlan?.confirmedAt} onClick={() => void reserve()}>▣ Confirmar plan y reservar</button><span>Esta operación cambia las tablas disponibles a reservadas.</span></div>}</> : <div className="cut-empty"><span>⌁</span><b>El plano aparecerá aquí</b><p>Define piezas y materiales; después ejecuta una simulación. El resultado no cambia existencias.</p></div>}
            {job.pieceReservations.length ? <div className="reservation-list"><b>Piezas reservadas</b>{job.pieceReservations.map((reservation) => <span key={reservation.id}>{reservation.piece.code} · {reservation.piece.material.name} · {reservation.status}</span>)}{job.stage === 'MATERIALS_RESERVED' ? <button type="button" className="text-button text-button--danger" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/reservations/release`, { method: 'POST' }), 'Reservas liberadas.')}>Liberar reservas</button> : null}</div> : null}
          </section></div>
        <div className="production-columns production-columns--lower production-columns--tabs"><section className={'card activity-card production-tab-panel' + (activeTab === 'log' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">BITÁCORA</p><h2>Etapas y notas</h2></div></div><div className="timeline-list">{job.stageHistory.map((entry) => <div className="timeline-entry" key={entry.id}><span className="timeline-dot" /><div><b>{stages.find(([stage]) => stage === entry.stage)?.[1] ?? entry.stage}<small>{entry.progress}%</small></b><p>{entry.note || 'Actualización de etapa'}</p><time>{dateTime(entry.createdAt)}{entry.user?.name ? ` · ${entry.user.name}` : ''}</time></div></div>)}</div><div className="notes-list">{job.notes.map((entry) => <div className={`note-card note-card--${entry.visibility.toLowerCase()}`} key={entry.id}><span>{entry.visibility === 'PUBLIC' ? 'VISIBLE AL CLIENTE' : 'SOLO INTERNO'}</span><p>{entry.content}</p><time>{dateTime(entry.createdAt)}</time></div>)}</div><form className="note-form" onSubmit={saveNote}><label>Agregar actualización<textarea rows={2} value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} required placeholder="Describe el avance o una observación" /></label><div className="note-form__bottom"><SelectField value={note.visibility} aria-label="Visibilidad de la nota" onChange={(e) => setNote({ ...note, visibility: e.target.value })}><option value="INTERNAL">Nota interna</option><option value="PUBLIC">Compartir con el cliente</option></SelectField><button type="submit" className="button button--primary button--small" disabled={busy}>Guardar nota</button></div></form>
          <form className="stage-form" onSubmit={advance}><div className="form-subhead"><b>Avanzar etapa</b></div><div className="form-grid form-grid--inline"><label>Siguiente etapa<SelectField value={nextStage} onChange={(e) => setNextStage(e.target.value)} disabled={job.status !== 'ACTIVE'}><option value="">Selecciona la siguiente</option>{stages.slice(progressIndex + 1).map(([stage, label]) => <option value={stage} key={stage}>{label}</option>)}</SelectField></label><label>Nota obligatoria (1–500 caracteres)<input value={stageNote} onChange={(e) => setStageNote(e.target.value)} required maxLength={500} /></label><button type="submit" className="button button--quiet" disabled={busy || !nextStage || job.status !== 'ACTIVE'}>Actualizar etapa →</button></div><small>El progreso avanza con cada etapa y no disminuye por incidencias.</small></form></section>
          <section className={'card incident-card production-tab-panel' + (activeTab === 'issues' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">CALIDAD Y REGISTRO</p><h2>Incidencias y fotos</h2></div></div><div className="incident-list">{job.incidents.filter((entry) => entry.isOpen).map((entry) => <article className="incident-item" key={entry.id}><span className="incident-bang">!</span><div><b>{entry.title}</b><p>{entry.description}</p><small>{dateTime(entry.createdAt)}</small></div><button type="button" className="text-button" onClick={() => { if (window.confirm(`¿Resolver la incidencia "${entry.title}"?`)) void runThenRefresh(() => api(`/production/incidents/${entry.id}/resolve`, { method: 'PATCH' }), 'Incidencia resuelta.'); }}>Resolver</button></article>)}{!job.incidents.some((entry) => entry.isOpen) ? <p className="field-hint">No hay incidencias abiertas en esta orden.</p> : null}</div><div className="incident-section"><b>Registro de calidad</b><p>Las incidencias abiertas y las fotografías se organizan en esta sección.</p><button type="button" className="button button--quiet" onClick={() => setIncidentOpen(true)}>＋ Registrar incidencia</button></div><dialog ref={incidentDialog} className="form-dialog" aria-labelledby="incident-dialog-title" onClose={() => setIncidentOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setIncidentOpen(false); }}><div className="form-dialog__content"><p className="eyebrow">CALIDAD Y REGISTRO</p><h2 id="incident-dialog-title">Registrar incidencia</h2><form className="form-stack" onSubmit={saveIncident}><label>Título<input value={incident.title} onChange={(event) => setIncident({ ...incident, title: event.target.value })} required maxLength={120} placeholder="Ej. Medida por verificar" /></label><label>Detalle<textarea rows={3} value={incident.description} onChange={(event) => setIncident({ ...incident, description: event.target.value })} required maxLength={1000} /></label><div className="route-form__actions"><button type="button" className="button button--quiet" onClick={() => setIncidentOpen(false)}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar incidencia'}</button></div></form></div></dialog><div className="photo-panel"><b>Fotografías de producción</b><div className="photo-grid">{job.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || `Registro de producción ${job.order.code}`} /><figcaption>{photo.caption || 'Registro de taller'}{photo.public ? <small>· pública</small> : <small>· interna</small>}</figcaption></figure>)}</div><form className="photo-form" onSubmit={uploadPhoto}><label>Subir imagen<input id="production-photo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Subir imagen" onChange={(e: ChangeEvent<HTMLInputElement>) => setPhotoFile(e.target.files?.[0] ?? null)} required /></label><label>Descripción<input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Opcional" /></label><label className="check-label"><input type="checkbox" checked={publicPhoto} onChange={(e) => setPublicPhoto(e.target.checked)} /> Visible al cliente</label><button type="submit" className="button button--quiet" disabled={busy || !photoFile}>Guardar fotografía</button></form></div></section></div>
      </>}</section> : null}
    </div>
  </>;
}

function DefinedMaterials({ job, canEdit, onEdit }: { job: Job; canEdit: boolean; onEdit: () => void }) {
  if (!job.components.length && !job.requirements.length) return <p className="field-hint defined-materials__empty">Aún no hay materiales ni piezas definidos para esta orden.</p>;
  return <div className="defined-materials">
    {job.requirements.length ? <section aria-label="Piezas definidas">
      <div className="form-subhead"><b>Piezas definidas · {job.requirements.reduce((sum, piece) => sum + piece.quantity, 0) * job.orderLine.quantity} a cortar</b>{canEdit ? <button type="button" className="text-button" onClick={onEdit}>Editar estas piezas ↓</button> : null}</div>
      <div className="table-wrap defined-materials__table"><table>
        <thead><tr><th>Pieza</th><th>Material</th><th className="numeric-cell">Largo</th><th className="numeric-cell">Ancho</th><th className="numeric-cell">Alto</th><th className="numeric-cell">Cantidad</th></tr></thead>
        <tbody>{job.requirements.map((piece) => <tr key={piece.id}>
          <td><b>{piece.label}</b><small>{formatDimensions(piece.lengthMm, piece.widthMm, piece.thicknessMm)}</small></td>
          <td>{piece.material.name}</td>
          <td className="numeric-cell">{piece.lengthMm}</td><td className="numeric-cell">{piece.widthMm}</td><td className="numeric-cell">{piece.thicknessMm}</td>
          <td className="numeric-cell">{piece.quantity}{job.orderLine.quantity > 1 ? <small>× {job.orderLine.quantity} productos</small> : null}</td>
        </tr>)}</tbody>
      </table></div>
      <small className="field-hint">Medidas en milímetros: Largo × Ancho × Alto.</small>
    </section> : null}
    {job.components.length ? <section aria-label="Materiales de consumo definidos">
      <div className="form-subhead"><b>Materiales de consumo</b>{canEdit && !job.requirements.length ? <button type="button" className="text-button" onClick={onEdit}>Editar ↓</button> : null}</div>
      <div className="table-wrap defined-materials__table"><table>
        <thead><tr><th>Descripción</th><th>Material</th><th className="numeric-cell">Cant. por producto</th></tr></thead>
        <tbody>{job.components.map((component) => <tr key={component.id}><td><b>{component.label}</b></td><td>{component.material.name}</td><td className="numeric-cell">{Number(component.quantity)} <small>{component.unit}</small></td></tr>)}</tbody>
      </table></div>
    </section> : null}
  </div>;
}

function MaterialStockHint({ item, pieces, thicknessMm, auto, canManage, onPickThickness }: {
  item: InventoryItem; pieces: PhysicalPiece[]; thicknessMm: number; auto: boolean; canManage: boolean; onPickThickness: (thicknessMm: number) => void;
}) {
  const { available, byThickness, thicknesses } = availableStock(pieces, item.id);
  if (!available.length) {
    const others = Object.entries(item.pieceCounts ?? {}).filter(([state, count]) => state !== 'AVAILABLE' && count).map(([state, count]) => `${count} ${STATE_LABELS[state]?.[count === 1 ? 0 : 1] ?? state.toLowerCase()}`);
    const loose = Number(item.stock);
    return <div className="stock-hint stock-hint--warning" role="status">
      <b>{item.name} no tiene piezas físicas disponibles.</b>
      <span>{others.length ? `Registradas: ${others.join(', ')}. ` : 'No hay tablas ni retazos registrados. '}{loose > 0 ? `Hay ${stockQuantity(loose, item.unit)} en stock suelto, pero sin medidas registradas el plano de corte no puede usarlas.` : ''}</span>
      {canManage ? <AppLink className="text-button" href={`/inventario/piezas/nueva?material=${item.id}`}>Registrar pieza física →</AppLink> : null}
    </div>;
  }
  const mismatch = thicknessMm > 0 && !thicknesses.includes(thicknessMm);
  return <div className={`stock-hint${mismatch ? ' stock-hint--warning' : ''}`} role="status">
    <b>{plural(available.length, 'pieza física disponible', 'piezas físicas disponibles')}</b>
    <div className="stock-hint__groups">{thicknesses.map((thickness) => {
      const group = byThickness.get(thickness) ?? [];
      return <div className="stock-hint__group" key={thickness}>
        {thicknesses.length > 1
          ? <button type="button" className={`stock-hint__thickness${thickness === thicknessMm ? ' is-selected' : ''}`} aria-pressed={thickness === thicknessMm} onClick={() => onPickThickness(thickness)}>Alto {thickness} mm</button>
          : <span className="stock-hint__thickness is-selected">Alto {thickness} mm</span>}
        <span className="stock-hint__pieces">{group.slice(0, 4).map((piece) => `${piece.code} · ${piece.lengthMm} × ${piece.widthMm}`).join('  ·  ')}{group.length > 4 ? `  ·  +${group.length - 4} más` : ''}</span>
      </div>;
    })}</div>
    {mismatch ? <span className="stock-hint__note">Ninguna pieza disponible tiene {thicknessMm} mm de alto; el plano de corte no podrá ubicar esta pieza.</span>
      : thicknesses.length > 1 ? <span className="stock-hint__note">Este material tiene varios altos: elige la variante que vas a usar.</span>
        : auto ? <span className="stock-hint__note">Alto tomado de las piezas disponibles. Puedes cambiarlo.</span> : null}
  </div>;
}
