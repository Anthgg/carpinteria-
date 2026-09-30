import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api, dateTime } from '../api';
import { CutPlan } from '../CutPlan';
import type { PlanBoard } from '../CutPlan';
import type { AppRoute, InventoryItem } from '../App';
import { AppLink, ModuleTabs } from '../components/ModuleTabs';
import { SelectField } from '../components/SelectField';
import { CuttingDiagnosis } from '../components/CuttingDiagnosis';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BusyLabel, DetailSkeleton, EmptyState, WaitingState } from '../components/feedback/Feedback';
import type { PhysicalPiece } from '../dimensions';
import type { AvailabilityData } from '../materialAvailability';
import { MaterialsEditor } from './production/MaterialsEditor';
import type { MaterialsPayload } from './production/MaterialsEditor';
import { Icon } from '../components/Icon';

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

export function ProductionScreen({ jobs, availability, pieces, canManage, busy, run, route }: { jobs: Job[]; availability: AvailabilityData; pieces: PhysicalPiece[]; canManage: boolean; busy: boolean; run: Run; route: AppRoute }) {
  const selectedId = route.view === 'detail' ? route.id ?? '' : '';
  const routeTabs: Record<string, string> = { materiales: 'materials', corte: 'cutting', bitacora: 'log', incidencias: 'issues' };
  const activeTab = routeTabs[route.tab ?? 'materiales'] ?? 'materials';
  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshJob, setRefreshJob] = useState(0);
  const [strategy, setStrategy] = useState('OFFCUTS_FIRST');
  const [plan, setPlan] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [highlight, setHighlight] = useState<{ ids: string[]; token: number } | null>(null);
  const [resolvingIncident, setResolvingIncident] = useState<{ id: string; title: string } | null>(null);
  const [note, setNote] = useState({ content: '', visibility: 'INTERNAL' });
  const [incident, setIncident] = useState({ title: '', description: '' });
  const [incidentOpen, setIncidentOpen] = useState(false);
  const incidentDialog = useRef<HTMLDialogElement>(null);
  const [publicPhoto, setPublicPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [nextStage, setNextStage] = useState('');
  const [stageNote, setStageNote] = useState('');
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
  // Lista completa editada localmente → un solo PUT; el backend reemplaza la configuración en una transacción.
  const saveMaterials = async (payload: MaterialsPayload) => {
    if (!job) return false;
    const result = await runThenRefresh(() => api(`/production/${job.id}/materials`, { method: 'PUT', body: JSON.stringify(payload) }), 'Materiales y piezas actualizados.');
    return result !== undefined;
  };
  // El diagnóstico del plano enlaza a /materiales?piezas=<id,id>: se resaltan esas piezas y se limpia la URL.
  useEffect(() => {
    if (activeTab !== 'materials' || !job) return;
    const ids = new URLSearchParams(window.location.search).get('piezas')?.split(',').filter(Boolean) ?? [];
    if (!ids.length) return;
    setHighlight({ ids, token: Date.now() });
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [activeTab, job]);
  const simulate = async () => {
    if (!job) return;
    setSimulating(true);
    try {
      const result = await run(() => api<any>(`/production/${job.id}/cutting/simulate`, { method: 'POST', body: JSON.stringify({ strategy }) }), 'Simulación lista. El inventario no se modificó.');
      if (result) { setPlan(result); refresh(); }
    } finally { setSimulating(false); }
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
    setUploading(true);
    const result = await runThenRefresh(() => api(`/production/${job.id}/photos`, { method: 'POST', body }), publicPhoto ? 'Fotografía pública agregada al seguimiento.' : 'Fotografía interna guardada.');
    setUploading(false);
    if (result) { setPhotoFile(null); setPhotoCaption(''); setPublicPhoto(false); const input = document.getElementById('production-photo') as HTMLInputElement | null; if (input) input.value = ''; }
  };
  const advance = async (event: FormEvent) => { event.preventDefault(); if (!job || !nextStage) return; const result = await runThenRefresh(() => api(`/production/${job.id}/stage`, { method: 'POST', body: JSON.stringify({ stage: nextStage, note: stageNote }) }), `Etapa actualizada: ${stages.find(([value]) => value === nextStage)?.[1]}.`); if (result) { setNextStage(''); setStageNote(''); } };
  const progressIndex = job ? stages.findIndex(([stage]) => stage === job.stage) : 0;

  return <>
    <ModuleTabs label="Producción" activeHref={route.view === 'orders' || route.view === 'detail' ? '/produccion/ordenes' : '/produccion'} tabs={[{ label: 'Tablero', href: '/produccion' }, { label: 'Órdenes', href: '/produccion/ordenes' }]} />
    <div className="page-heading"><div><p className="eyebrow">ORDEN DE TRABAJO · OPERACIÓN DEL TALLER</p><h1 tabIndex={-1}>{route.view === 'board' ? 'Tablero de producción.' : route.view === 'orders' ? 'Órdenes de producción.' : job?.orderLine.name ?? 'Orden de producción.'}</h1><p>{route.view === 'board' ? 'Vista rápida de los trabajos por etapa.' : route.view === 'orders' ? 'Busca una orden y abre su ficha independiente.' : job ? `${job.order.code} · ${job.order.customer.name} · ${job.status === 'ACTIVE' ? `${job.progress}% en proceso` : job.status}` : 'Prepara materiales, revisa el plano y documenta cada etapa.'}</p></div><div className="page-heading__actions"><span className="production-count"><b>{jobs.filter((entry) => entry.status !== 'COMPLETED').length}</b> trabajos activos</span></div></div>
    {route.view === 'orders' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">PRODUCCIÓN</p><h2>{jobs.length} órdenes</h2></div><div className="search-box search-box--small"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Orden, pedido, producto o cliente" aria-label="Buscar órdenes de producción" /></div></div>{visibleJobs.length ? <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Pedido</th><th>Producto</th><th>Cliente</th><th>Etapa</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>{visibleJobs.map((entry) => <tr key={entry.id}><td className="mono">OP {entry.id.slice(0, 8).toUpperCase()}</td><td><AppLink className="table-row-link" href={`/pedidos/${entry.order.id}`}>{entry.order.code}</AppLink></td><td>{entry.orderLine.name}</td><td>{entry.order.customer.name}</td><td>{stages.find(([stage]) => stage === entry.stage)?.[1] ?? entry.stage}</td><td>{entry.progress}%</td><td>{entry.status === 'PAUSED' ? 'Pausada' : entry.status === 'COMPLETED' ? 'Terminada' : 'Activa'}</td><td><AppLink className="text-button" href={`/produccion/${entry.id}/materiales`}>Abrir orden →</AppLink></td></tr>)}</tbody></table></div> : <div className="empty-inline"><b>Sin órdenes de producción</b><p>Las órdenes aparecen cuando un pedido tiene una línea de fabricación.</p></div>}</section> : null}
    <div className="production-layout">{route.view === 'board' ? <aside className="card job-list-card"><div className="card-heading"><div><p className="eyebrow">COLA DEL TALLER</p><h2>Trabajos por etapa</h2></div><span className="queue-count">{jobs.length}</span></div><div className="search-box search-box--small"><Icon name="search" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar trabajo" aria-label="Buscar trabajo" /></div><div className="job-list production-board production-board--full">
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
        </div></aside> : null}{route.view === 'detail' ? <section className="production-workspace">{loadingJob ? <DetailSkeleton label="Cargando orden de trabajo" /> : !job ? <EmptyState variant="no-results" title="Orden no encontrada" detail="Vuelve a Órdenes y selecciona un trabajo existente." action={<AppLink className="button button--quiet" href="/produccion/ordenes">Ver órdenes</AppLink>} /> : <>
        <article className="card job-overview"><div className="job-overview__top"><div><p className="eyebrow"><span className="mono">OP {job.id.slice(0, 8).toUpperCase()}</span> <i>·</i> {job.order.code} <i>·</i> {job.order.customer.name}</p><h2>{job.orderLine.name}</h2><p>Cantidad {job.orderLine.quantity}{job.orderLine.lengthMm ? ` · ${job.orderLine.lengthMm} × ${job.orderLine.widthMm} × ${job.orderLine.heightMm} mm` : ''}</p></div><div className="job-overview__state"><b>{job.status === 'PAUSED' ? 'Pausada' : job.status === 'COMPLETED' ? 'Completada' : 'En marcha'}</b><small>Actualizado {dateTime(job.updatedAt)}</small></div></div><div className="progress-large"><div className="progress-large__heading"><span>Avance de fabricación</span><b>{job.progress}%</b></div><div className="progress-large__track"><span style={{ width: `${job.progress}%` }} /></div></div><div className="stage-trackline">{stages.map(([value, label], index) => <div className={`stage-point ${index <= progressIndex ? 'is-done' : ''} ${value === job.stage ? 'is-current' : ''}`} key={value}><span>{index < progressIndex ? <Icon name="check" size={16} /> : String(index + 1).padStart(2, '0')}</span><small>{label}</small></div>)}</div><div className="job-overview__actions">{job.status === 'PAUSED' ? <button type="button" className="button button--primary" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/resume`, { method: 'POST', body: JSON.stringify({ note: 'Reanudación desde el panel' }) }), 'Producción reanudada.')}><Icon name="play" size={16} />Reanudar</button> : job.status !== 'COMPLETED' ? <button type="button" className="button button--quiet" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/pause`, { method: 'POST', body: JSON.stringify({ note: 'Pausa desde el panel' }) }), 'Producción pausada.')}><Icon name="pause" size={16} />Pausar</button> : <span className="pill pill--success">Trabajo completado</span>}{job.stage === 'MATERIALS_RESERVED' && job.status === 'ACTIVE' ? <button type="button" className="button button--primary" onClick={() => void confirmCut()}><Icon name="cut" size={16} />Confirmar corte real</button> : null}</div></article>
        <ModuleTabs label={`Orden ${job.order.code}`} activeHref={`/produccion/${job.id}/${route.tab ?? 'materiales'}`} tabs={[{ label: 'Materiales y piezas', href: `/produccion/${job.id}/materiales` }, { label: 'Plano de corte', href: `/produccion/${job.id}/corte` }, { label: 'Bitácora', href: `/produccion/${job.id}/bitacora` }, { label: 'Incidencias y fotos', href: `/produccion/${job.id}/incidencias` }]} /><div className="production-columns production-columns--tabs"><section className={'card form-card production-tab-panel' + (activeTab === 'materials' ? '' : ' is-hidden')}>
  <div className="card-heading"><div><p className="eyebrow">DISEÑO DEL OPERARIO</p><h2>Materiales y piezas</h2><p>El material se elige para este pedido y cada pieza se define manualmente.</p></div><span className="settings-icon"><Icon name="material" size={18} /></span></div><MaterialsEditor job={job} availability={availability} pieces={pieces} busy={busy} highlight={highlight} onSave={saveMaterials} /></section>
          <section className={'card cut-card production-tab-panel' + (activeTab === 'cutting' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">SIMULACIÓN · SIN CAMBIOS DE STOCK</p><h2>Plano de corte</h2><p>Una sugerencia para revisar antes de reservar las tablas.</p></div><span className="settings-icon"><Icon name="cut" size={18} /></span></div><div className="cut-controls"><label>Estrategia<SelectField value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="OFFCUTS_FIRST">Usar retazos primero</option><option value="FULL_BOARDS_FIRST">Usar tablas completas</option></SelectField></label><button type="button" className="button button--primary" disabled={busy || !job.requirements.length || job.stage !== 'ORDER_RECEIVED'} onClick={() => void simulate()}><BusyLabel busy={simulating} busyText="Calculando…"><Icon name="refresh" size={16} />Calcular sugerencia</BusyLabel></button></div>{simulating ? <WaitingState variant="cutting" title="Calculando la mejor distribución…" detail="El motor prueba las piezas en las tablas y retazos disponibles. El inventario no cambia." /> : planResult ? <><div className="cut-summary"><div><b>{planResult.summary.placedParts}/{planResult.summary.requestedParts}</b><small>piezas ubicadas</small></div><div><b>{planResult.summary.boardsUsed}</b><small>tablas sugeridas</small></div><div><b>{planResult.summary.cutsEstimated}</b><small>cortes estimados</small></div><div><b>{planResult.summary.utilizationPercent}%</b><small>aprovechamiento</small></div></div>{planResult.unplaced?.length ? <CuttingDiagnosis diagnostics={planResult.diagnostics} legacyUnplaced={planResult.unplaced} jobId={job.id} canManage={canManage} canEdit={job.stage === 'ORDER_RECEIVED' && job.status === 'ACTIVE'} /> : null}<div className="cut-board-list">{(planResult.boards as PlanBoard[]).map((board) => <CutPlan key={board.id} board={board} />)}</div>{planResult.unplaced?.length ? null : <div className="cut-actions"><button type="button" className="button button--primary" disabled={busy || job.stage !== 'ORDER_RECEIVED' || !!currentPlan?.confirmedAt} onClick={() => void reserve()}><Icon name="reserve" size={16} />Confirmar plan y reservar</button><span>Esta operación cambia las tablas disponibles a reservadas.</span></div>}</> : <EmptyState title="El plano aparecerá aquí" detail="Define piezas y materiales; después ejecuta una simulación. El resultado no cambia existencias." />}
            {job.pieceReservations.length ? <div className="reservation-list"><b>Piezas reservadas</b>{job.pieceReservations.map((reservation) => <span key={reservation.id}>{reservation.piece.code} · {reservation.piece.material.name} · {reservation.status}</span>)}{job.stage === 'MATERIALS_RESERVED' ? <button type="button" className="text-button text-button--danger" onClick={() => void runThenRefresh(() => api(`/production/${job.id}/reservations/release`, { method: 'POST' }), 'Reservas liberadas.')}>Liberar reservas</button> : null}</div> : null}
          </section></div>
        <div className="production-columns production-columns--lower production-columns--tabs"><section className={'card activity-card production-tab-panel' + (activeTab === 'log' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">BITÁCORA</p><h2>Etapas y notas</h2></div></div><div className="timeline-list">{job.stageHistory.map((entry) => <div className="timeline-entry" key={entry.id}><span className="timeline-dot" /><div><b>{stages.find(([stage]) => stage === entry.stage)?.[1] ?? entry.stage}<small>{entry.progress}%</small></b><p>{entry.note || 'Actualización de etapa'}</p><time>{dateTime(entry.createdAt)}{entry.user?.name ? ` · ${entry.user.name}` : ''}</time></div></div>)}</div><div className="notes-list">{job.notes.map((entry) => <div className={`note-card note-card--${entry.visibility.toLowerCase()}`} key={entry.id}><span>{entry.visibility === 'PUBLIC' ? 'VISIBLE AL CLIENTE' : 'SOLO INTERNO'}</span><p>{entry.content}</p><time>{dateTime(entry.createdAt)}</time></div>)}</div><form className="note-form" onSubmit={saveNote}><label>Agregar actualización<textarea rows={2} value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} required placeholder="Describe el avance o una observación" /></label><div className="note-form__bottom"><SelectField value={note.visibility} aria-label="Visibilidad de la nota" onChange={(e) => setNote({ ...note, visibility: e.target.value })}><option value="INTERNAL">Nota interna</option><option value="PUBLIC">Compartir con el cliente</option></SelectField><button type="submit" className="button button--primary button--small" disabled={busy}>Guardar nota</button></div></form>
          <form className="stage-form" onSubmit={advance}><div className="form-subhead"><b>Avanzar etapa</b></div><div className="form-grid form-grid--inline"><label>Siguiente etapa<SelectField value={nextStage} onChange={(e) => setNextStage(e.target.value)} disabled={job.status !== 'ACTIVE'}><option value="">Selecciona la siguiente</option>{stages.slice(progressIndex + 1).map(([stage, label]) => <option value={stage} key={stage}>{label}</option>)}</SelectField></label><label>Nota obligatoria (1–500 caracteres)<input value={stageNote} onChange={(e) => setStageNote(e.target.value)} required maxLength={500} /></label><button type="submit" className="button button--quiet" disabled={busy || !nextStage || job.status !== 'ACTIVE'}>Actualizar etapa →</button></div><small>El progreso avanza con cada etapa y no disminuye por incidencias.</small></form></section>
          <section className={'card incident-card production-tab-panel' + (activeTab === 'issues' ? '' : ' is-hidden')}><div className="card-heading"><div><p className="eyebrow">CALIDAD Y REGISTRO</p><h2>Incidencias y fotos</h2></div></div><div className="incident-list">{job.incidents.filter((entry) => entry.isOpen).map((entry) => <article className="incident-item" key={entry.id}><span className="incident-bang">!</span><div><b>{entry.title}</b><p>{entry.description}</p><small>{dateTime(entry.createdAt)}</small></div><button type="button" className="text-button" aria-label={`Resolver incidencia ${entry.title}`} onClick={() => setResolvingIncident({ id: entry.id, title: entry.title })}>Resolver</button></article>)}{!job.incidents.some((entry) => entry.isOpen) ? <EmptyState compact title="No hay incidencias abiertas." detail="Cuando algo requiera atención en esta orden, regístralo aquí." /> : null}</div><div className="incident-section"><b>Registro de calidad</b><p>Las incidencias abiertas y las fotografías se organizan en esta sección.</p><button type="button" className="button button--quiet" onClick={() => setIncidentOpen(true)}><Icon name="create" size={16} />Registrar incidencia</button></div><dialog ref={incidentDialog} className="form-dialog" aria-labelledby="incident-dialog-title" onClose={() => setIncidentOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setIncidentOpen(false); }}><div className="form-dialog__content"><p className="eyebrow">CALIDAD Y REGISTRO</p><h2 id="incident-dialog-title">Registrar incidencia</h2><form className="form-stack" onSubmit={saveIncident}><label>Título<input value={incident.title} onChange={(event) => setIncident({ ...incident, title: event.target.value })} required maxLength={120} placeholder="Ej. Medida por verificar" /></label><label>Detalle<textarea rows={3} value={incident.description} onChange={(event) => setIncident({ ...incident, description: event.target.value })} required maxLength={1000} /></label><div className="route-form__actions"><button type="button" className="button button--quiet" onClick={() => setIncidentOpen(false)}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar incidencia'}</button></div></form></div></dialog><div className="photo-panel"><b>Fotografías de producción</b>{job.photos.length ? <div className="photo-grid">{job.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || `Registro de producción ${job.order.code}`} loading="lazy" /><figcaption>{photo.caption || 'Registro de taller'}{photo.public ? <small>· pública</small> : <small>· interna</small>}</figcaption></figure>)}</div> : <EmptyState compact variant="photos" title="Todavía no hay fotografías." detail="Las fotos del avance quedan como registro interno o visibles para el cliente." />}<form className="photo-form" onSubmit={uploadPhoto}><label>Subir imagen<input id="production-photo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Subir imagen" onChange={(e: ChangeEvent<HTMLInputElement>) => setPhotoFile(e.target.files?.[0] ?? null)} required /></label><label>Descripción<input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Opcional" /></label><label className="check-label"><input type="checkbox" checked={publicPhoto} onChange={(e) => setPublicPhoto(e.target.checked)} /> Visible al cliente</label><button type="submit" className="button button--quiet" disabled={busy || uploading || !photoFile}><BusyLabel busy={uploading} busyText="Subiendo fotografía…"><Icon name="photo" size={16} />Guardar fotografía</BusyLabel></button></form></div></section></div>
      </>}</section> : null}
    </div>
    <ConfirmDialog open={!!resolvingIncident} tone="warning" title={`Resolver «${resolvingIncident?.title ?? ''}»`} confirmLabel="Resolver incidencia"
      onCancel={() => setResolvingIncident(null)}
      onConfirm={() => { const target = resolvingIncident; setResolvingIncident(null); if (target) void runThenRefresh(() => api(`/production/incidents/${target.id}/resolve`, { method: 'PATCH' }), 'Incidencia resuelta.'); }}>
      <p>La incidencia dejará de figurar como abierta en esta orden.</p>
    </ConfirmDialog>
  </>;
}
