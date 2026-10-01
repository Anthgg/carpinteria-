import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { ReactNode } from 'react';
import { api, dateTime, download, formatPEN, toMillimeters } from '../../api';
import type { AppRoute, Customer, InventoryItem, Order, Product, SettingValues } from '../../App';
import { AppLink, ModuleTabs } from '../../components/ModuleTabs';
import { SelectField, SearchSelect } from '../../components/SelectField';
import { navigateTo } from '../../navigation';
import { Toast } from '@heroui/react/toast';
import { BusyLabel, EmptyState as SharedEmptyState, WaitingState } from '../../components/feedback/Feedback';
import { Icon } from '../../components/Icon';
import { unitLabel } from '../../units';

type DraftLine = { type: string; productId: string; itemId: string; name: string; description: string; quantity: number; unitPrice: string; discount: string; length: string; width: string; height: string; unit: string };
type Run = <T,>(action: () => Promise<T>, success: string) => Promise<T | undefined>;
const emptyLine = (): DraftLine => ({ type: 'CATALOG', productId: '', itemId: '', name: '', description: '', quantity: 1, unitPrice: '', discount: '', length: '', width: '', height: '', unit: 'cm' });
const orderLabel: Record<string, string> = { CONFIRMED: 'Confirmado', IN_PRODUCTION: 'En producción', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' };
const paymentLabel: Record<string, string> = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagado' };
const label = (value: string, labels: Record<string, string>) => labels[value] ?? value.replaceAll('_', ' ');

export function OrdersScreen({ data, busy, run, route }: { data: { orders?: Order[]; customers?: Customer[]; products?: Product[]; inventory?: InventoryItem[]; settings?: SettingValues }; busy: boolean; run: Run; route: AppRoute }) {
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [customerId, setCustomerId] = useState('');
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState({ amount: '', method: 'Efectivo', observation: '' });
  const [initialPayment, setInitialPayment] = useState({ amount: '', method: 'Efectivo', observation: '' });
  const [formError, setFormError] = useState('');
  const orders = data.orders ?? [];
  const customers = data.customers ?? [];
  const products = data.products ?? [];
  const inventory = data.inventory ?? [];
  const selected = orders.find((order) => order.id === route.id || order.code === route.id);
  const visible = orders.filter((order) => `${order.code} ${order.customer.name}`.toLowerCase().includes(search.toLowerCase()));
  const filteredProducts = products.filter((product) => product.active);
  const sellableMaterials = inventory.filter((item) => item.sellable && item.active !== false);
  const quote = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    const discount = lines.reduce((sum, line) => sum + Number(line.discount || 0), 0);
    const tax = Math.round(Math.max(0, subtotal - discount) * (data.settings?.taxRate ?? 18)) / 100;
    return { subtotal, discount, tax, total: Math.max(0, subtotal - discount) + tax };
  }, [lines, data.settings?.taxRate]);
  const outstanding = orders.filter((order) => order.totalCents > order.paidCents);
  const outstandingCents = outstanding.reduce((sum, order) => sum + order.totalCents - order.paidCents, 0);
  const receivedCents = orders.reduce((sum, order) => sum + order.paidCents, 0);
  const recentPayments = orders.flatMap((order) => (order.payments ?? []).map((entry) => ({ ...entry, order }))).sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (step === 0) {
      if (!customerId) { setFormError('Selecciona un cliente para continuar.'); return; }
      setStep(1); return;
    }
    if (step === 1) {
      const missingLine = lines.some((line) => (line.type === 'CATALOG' && !line.productId) || (line.type === 'MATERIAL' && !line.itemId) || (line.type === 'CUSTOM' && !line.name.trim()));
      if (missingLine) { setFormError('Completa el producto o material de cada línea.'); return; }
      setStep(2); return;
    }
    if (!customerId || !lines.length) return;
    const payload = { customerId, lines: lines.map((line) => ({
      type: line.type, productId: line.type === 'CATALOG' ? line.productId : undefined, itemId: line.type === 'MATERIAL' ? line.itemId : undefined,
      name: line.name, description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discount: Number(line.discount || 0),
      lengthMm: line.length ? toMillimeters(line.length, line.unit as 'mm' | 'cm' | 'm') : undefined,
      widthMm: line.width ? toMillimeters(line.width, line.unit as 'mm' | 'cm' | 'm') : undefined,
      heightMm: line.height ? toMillimeters(line.height, line.unit as 'mm' | 'cm' | 'm') : undefined,
    })) };
    const created = await run(() => api<Order>('/orders', { method: 'POST', body: JSON.stringify(payload) }), 'Pedido creado.');
    if (!created) return;
    if (Number(initialPayment.amount) > 0) await run(() => api(`/orders/${created.id}/payments`, { method: 'POST', body: JSON.stringify(initialPayment) }), 'Pago inicial registrado.');
    navigateTo(`/pedidos/${created.id}`);
  };
  const savePayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const result = await run(() => api(`/orders/${selected.id}/payments`, { method: 'POST', body: JSON.stringify(payment) }), 'Pago registrado.');
    if (result) setPayment({ amount: '', method: 'Efectivo', observation: '' });
  };
  const updateStatus = async (status: string) => {
    if (!selected) return;
    await run(() => api(`/orders/${selected.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }), 'Estado del pedido actualizado.');
  };
  const share = (order: Order) => {
    // wa.me exige formato internacional: un celular peruano de 9 dígitos (9xxxxxxxx) recibe el prefijo 51.
    const digits = order.customer.phone?.replace(/\D/g, '') ?? '';
    const phone = /^9\d{8}$/.test(digits) ? `51${digits}` : digits;
    const url = `${window.location.origin}/seguimiento/${order.trackingToken}`;
    const message = `Hola ${order.customer.name}, te compartimos el avance de tu pedido ${order.code}. Estado: ${label(order.status, orderLabel)}. Seguimiento: ${url}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async (order: Order) => {
    setPdfBusy(true);
    try { await download(`/orders/${order.id}/pdf`, `${order.code}.pdf`); Toast.toast.success('Ficha PDF descargada.', { timeout: 3200 }); }
    catch (reason) { Toast.toast.danger(reason instanceof Error ? reason.message : 'No se pudo generar la ficha PDF.', { timeout: 5200 }); }
    finally { setPdfBusy(false); }
  };
  const copyTrackingLink = async (order: Order) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/seguimiento/${order.trackingToken}`); Toast.toast.success('Enlace de seguimiento copiado.', { timeout: 3200 }); }
    catch { Toast.toast.danger('No se pudo copiar el enlace. Ábrelo desde «Ver seguimiento público».', { timeout: 5200 }); }
  };
  const tabHref = route.view === 'payments' ? '/pedidos/cobros' : '/pedidos';
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const lineName = (line: DraftLine) => line.type === 'CATALOG' ? products.find((product) => product.id === line.productId)?.name : line.type === 'MATERIAL' ? inventory.find((item) => item.id === line.itemId)?.name : line.name;
  const formatOrderLine = (line: Order['lines'][number]) => `${line.quantity} × ${line.name}`;

  return <>
    <ModuleTabs label="Pedidos y ventas" activeHref={tabHref} tabs={[{ label: 'Pedidos', href: '/pedidos' }, { label: 'Cobros', href: '/pedidos/cobros' }, { label: 'Clientes', href: '/clientes' }, { label: 'Productos', href: '/productos' }]} />
    {route.view === 'list' ? <>
      <PageHeading title="Pedidos." eyebrow="VENTAS Y TRABAJOS" subtitle="Busca pedidos y abre su ficha comercial o de producción." actions={<button type="button" className="button button--primary" onClick={() => navigateTo('/pedidos/nuevo')}><Icon name="create" size={16} />Crear pedido</button>} />
      <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">PEDIDOS DEL TALLER</p><h2>{visible.length} pedidos</h2></div><div className="search-box search-box--small"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pedido o cliente" aria-label="Buscar pedidos" /></div></div>{visible.length ? <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Importe</th><th>Cobro</th><th></th></tr></thead><tbody>{visible.map((order) => <tr key={order.id}><td><AppLink href={`/pedidos/${order.id}`} className="table-row-link">{order.code}</AppLink><small>{order.lines.length} líneas</small></td><td>{order.customer.name}</td><td>{dateTime(order.createdAt)}</td><td><span className={`pill ${order.status === 'READY' ? 'pill--success' : 'pill--neutral'}`}>{label(order.status, orderLabel)}</span></td><td className="numeric-cell">{formatPEN(order.totalCents)}</td><td><span className={`pill ${order.paymentStatus === 'PAID' ? 'pill--success' : order.paymentStatus === 'PARTIAL' ? 'pill--warning' : 'pill--neutral'}`}>{label(order.paymentStatus, paymentLabel)}</span></td><td><AppLink className="text-button" href={`/pedidos/${order.id}`}>Abrir ficha →</AppLink></td></tr>)}</tbody></table></div> : (orders.length ? <EmptyInline variant="no-results" title="No encontramos pedidos con esa búsqueda." detail="Prueba con el código del pedido o el nombre del cliente." /> : <EmptyInline title="Aún no hay pedidos." detail="Crea un pedido para organizar la fabricación y el cobro." action="Crear pedido" onAction={() => navigateTo('/pedidos/nuevo')} />)}</section>
    </> : null}

    {route.view === 'payments' ? <>
      <PageHeading title="Cobros." eyebrow="SALDOS Y PAGOS" subtitle="Revisa saldos pendientes y el historial de pagos registrados." />
      <div className="module-summary-grid"><div className="module-summary-card"><span>Pedidos con saldo</span><strong>{outstanding.length}</strong></div><div className="module-summary-card module-summary-card--balance"><span>Saldo pendiente</span><strong>{formatPEN(outstandingCents)}</strong></div><div className="module-summary-card"><span>Pagos recibidos</span><strong>{formatPEN(receivedCents)}</strong></div></div>
      <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">CUENTAS PENDIENTES</p><h2>Pedidos por cobrar</h2></div></div>{outstanding.length ? <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Estado de pago</th><th>Total</th><th>Pagado</th><th>Saldo</th><th></th></tr></thead><tbody>{outstanding.map((order) => <tr key={order.id}><td><AppLink href={`/pedidos/${order.id}/cobros`} className="table-row-link">{order.code}</AppLink></td><td>{order.customer.name}</td><td>{label(order.paymentStatus, paymentLabel)}</td><td className="numeric-cell">{formatPEN(order.totalCents)}</td><td className="numeric-cell">{formatPEN(order.paidCents)}</td><td className="numeric-cell"><b>{formatPEN(order.totalCents - order.paidCents)}</b></td><td><AppLink href={`/pedidos/${order.id}/cobros`} className="text-button">Ver cobros →</AppLink></td></tr>)}</tbody></table></div> : <EmptyInline title="No hay saldos pendientes" detail="Los pagos parciales o pendientes aparecerán aquí." />}</section>
      <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">HISTORIAL DE PAGOS</p><h2>{recentPayments.length} pagos registrados</h2></div></div>{recentPayments.length ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Método</th><th>Observación</th><th>Monto</th></tr></thead><tbody>{recentPayments.map((entry) => <tr key={entry.id}><td>{dateTime(entry.paidAt)}</td><td><AppLink href={`/pedidos/${entry.order.id}/cobros`} className="table-row-link">{entry.order.code}</AppLink></td><td>{entry.order.customer.name}</td><td>{entry.method}</td><td>{entry.observation || '—'}</td><td className="numeric-cell"><b>{formatPEN(entry.amountCents)}</b></td></tr>)}</tbody></table></div> : <EmptyInline title="Todavía no hay pagos" detail="Los pagos guardados en una ficha se reunirán en este historial." />}</section>
    </> : null}

    {route.view === 'create' ? <>
      <PageHeading eyebrow="NUEVO ENCARGO" title="Crear pedido." subtitle="Completa los tres pasos para registrar el pedido y su pago inicial opcional." />
      <a className="route-back-link" href="/pedidos" onClick={(event) => { event.preventDefault(); navigateTo('/pedidos'); }}>← Volver a Pedidos</a>
      <div className="order-create-layout">
      <section className="card form-card order-form"><div className="order-wizard" aria-label="Progreso del nuevo pedido">{['Cliente', 'Productos', 'Revisión y pago inicial'].map((name, index) => <div key={name} className={`order-wizard__step${index === step ? ' is-active' : ''}${index < step ? ' is-complete' : ''}`} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Icon name="check" size={16} /> : `0${index + 1}`}</span><b>{name}</b></div>)}</div>
        <form onSubmit={createOrder}>
          {step === 0 ? <div className="order-wizard-panel"><p className="order-wizard-panel__intro">¿Para quién preparamos este trabajo?</p><div className="form-grid"><label className="span-2">Cliente<SearchSelect value={customerId} onChange={(event) => setCustomerId(event.target.value)} required placeholder="Busca por nombre o documento">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.documentNumber ? ` · ${customer.documentNumber}` : ''}</option>)}</SearchSelect></label>{selectedCustomer ? <dl className="order-customer-card span-2"><div><dt>Documento</dt><dd>{selectedCustomer.documentNumber ? `${selectedCustomer.documentType} ${selectedCustomer.documentNumber}` : 'Sin documento'}</dd></div><div><dt>Teléfono</dt><dd>{selectedCustomer.phone || '—'}</dd></div><div><dt>Correo</dt><dd>{selectedCustomer.email || '—'}</dd></div><div><dt>Dirección</dt><dd>{selectedCustomer.address || '—'}</dd></div></dl> : <p className="order-customer-card order-customer-card--empty span-2">Al elegir un cliente verás aquí sus datos de contacto.</p>}</div></div> : null}
          {step === 1 ? <div className="order-wizard-panel"><p className="order-wizard-panel__intro">Agrega productos del catálogo, trabajos a medida o materiales vendibles.</p>{lines.map((line, index) => <div className="order-line-editor" key={index}><div className="order-line-editor__top"><b>Línea {String(index + 1).padStart(2, '0')}</b>{lines.length > 1 ? <button type="button" className="text-button text-button--danger" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Icon name="delete" size={16} />Quitar</button> : null}</div><div className="form-grid"><label>Tipo<SelectField value={line.type} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, type: event.target.value, productId: '', itemId: '' } : current))}><option value="CATALOG">Producto de catálogo</option><option value="CUSTOM">Producto personalizado</option><option value="MATERIAL">Material vendido</option></SelectField></label>{line.type === 'CATALOG' ? <label>Producto<SearchSelect value={line.productId} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, productId: event.target.value } : current))} required placeholder="Busca producto">{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</SearchSelect></label> : line.type === 'MATERIAL' ? <label>Material vendible<SearchSelect value={line.itemId} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, itemId: event.target.value } : current))} required placeholder="Busca material">{sellableMaterials.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel(item.unit, 1, true)}</option>)}</SearchSelect></label> : <label>Nombre del mueble<input value={line.name} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, name: event.target.value } : current))} required /></label>}<label>Cantidad<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, quantity: Number(event.target.value) } : current))} required /></label><label>Precio unitario (S/)<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, unitPrice: event.target.value } : current))} required /></label><label>Descuento de línea (S/)<input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, discount: event.target.value } : current))} /></label>{line.type === 'CUSTOM' ? <><label>Unidad<SelectField value={line.unit} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, unit: event.target.value } : current))}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></SelectField></label><label>Largo<input type="number" min="0" step="0.1" value={line.length} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, length: event.target.value } : current))} /></label><label>Ancho<input type="number" min="0" step="0.1" value={line.width} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, width: event.target.value } : current))} /></label><label>Alto<input type="number" min="0" step="0.1" value={line.height} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, height: event.target.value } : current))} /></label></> : null}<label className="span-2">Descripción / observaciones<textarea rows={2} value={line.description} onChange={(event) => setLines(lines.map((current, i) => i === index ? { ...current, description: event.target.value } : current))} /></label></div></div>)}<button type="button" className="button button--quiet order-add-line" onClick={() => setLines([...lines, emptyLine()])}><Icon name="create" size={16} />Agregar otra línea</button></div> : null}
          {step === 2 ? <div className="order-review"><section className="order-review__customer"><p className="eyebrow">CLIENTE</p><h3>{customers.find((customer) => customer.id === customerId)?.name ?? 'Cliente'}</h3><span>{customers.find((customer) => customer.id === customerId)?.phone ?? 'Sin teléfono registrado'}</span></section><section className="order-review__lines"><div className="order-review__heading"><h3>Resumen del pedido</h3><button type="button" className="text-button" onClick={() => setStep(1)}>Editar productos</button></div>{lines.map((line, index) => { const name = line.type === 'CATALOG' ? products.find((product) => product.id === line.productId)?.name : line.type === 'MATERIAL' ? inventory.find((item) => item.id === line.itemId)?.name : line.name; return <div className="order-review__line" key={index}><span>{line.quantity} × {name || 'Producto'}</span><b>{formatPEN(Math.round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100))}</b></div>; })}</section><div className="quote-preview"><span>Subtotal estimado <b>{formatPEN(Math.round(quote.subtotal * 100))}</b></span><span>Descuento <b>− {formatPEN(Math.round(quote.discount * 100))}</b></span><span>IGV ({data.settings?.taxRate ?? 18}%) <b>{formatPEN(Math.round(quote.tax * 100))}</b></span><strong>Total estimado <b>{formatPEN(Math.round(quote.total * 100))}</b></strong><small>El backend confirmará los importes finales al guardar.</small></div><section className="initial-payment"><div><p className="eyebrow">AL CREAR EL PEDIDO</p><h3>Pago inicial <span>Opcional</span></h3><p>Si recibiste un adelanto, puedes dejarlo registrado ahora.</p></div><div className="form-grid"><label>Monto (S/)<input type="number" min="0" step="0.01" value={initialPayment.amount} onChange={(event) => setInitialPayment({ ...initialPayment, amount: event.target.value })} /></label><label>Método<SelectField value={initialPayment.method} onChange={(event) => setInitialPayment({ ...initialPayment, method: event.target.value })}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></SelectField></label><label className="span-2">Observación<input value={initialPayment.observation} onChange={(event) => setInitialPayment({ ...initialPayment, observation: event.target.value })} /></label></div></section></div> : null}
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="form-actions order-wizard__actions"><button type="button" className="button button--quiet" onClick={() => navigateTo('/pedidos')}>Cancelar</button>{step > 0 ? <button type="button" className="button button--quiet" onClick={() => setStep((current) => current - 1)}>Atrás</button> : null}{step < 2 ? <button type="submit" className="button button--primary">Continuar <span>→</span></button> : <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Crear pedido'} <span>↗</span></button>}</div>
        </form>
      </section>
      <aside className="card order-summary-card" aria-label="Resumen del nuevo pedido">
        <p className="eyebrow">RESUMEN</p>
        <h2>{selectedCustomer?.name ?? 'Cliente por elegir'}</h2>
        <div className="order-summary-card__lines">{lines.map((line, index) => <div key={index}><span>{line.quantity} × {lineName(line) || `Línea ${String(index + 1).padStart(2, '0')}`}</span><b>{formatPEN(Math.round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100))}</b></div>)}</div>
        <div className="order-summary-card__totals"><span>Subtotal <b>{formatPEN(Math.round(quote.subtotal * 100))}</b></span><span>Descuento <b>− {formatPEN(Math.round(quote.discount * 100))}</b></span><span>IGV ({data.settings?.taxRate ?? 18}%) <b>{formatPEN(Math.round(quote.tax * 100))}</b></span><strong>Total estimado <b>{formatPEN(Math.round(quote.total * 100))}</b></strong></div>
        <small>Paso {step + 1} de 3 · el backend confirma los importes al guardar.</small>
      </aside>
      </div>
    </> : null}

    {route.view === 'detail' ? selected ? <>
      <PageHeading eyebrow={`FICHA COMERCIAL · ${selected.customer.name} · ${dateTime(selected.createdAt)}`} title={`${selected.code}.`} subtitle={`Estado: ${label(selected.status, orderLabel)} · Cliente: ${selected.customer.name}`} actions={<><button type="button" className="button button--quiet icon-motion icon-motion--drop" disabled={pdfBusy} onClick={() => void downloadPdf(selected)}><BusyLabel busy={pdfBusy} busyText="Preparando la ficha PDF…"><Icon name="pdf" size={16} />Descargar ficha PDF + QR</BusyLabel></button><button type="button" className="button button--quiet" onClick={() => share(selected)}><Icon name="whatsapp" size={16} />Enviar por WhatsApp</button><button type="button" className="button button--quiet" onClick={() => void copyTrackingLink(selected)}><Icon name="link" size={16} />Copiar enlace público</button></>} />
      {pdfBusy ? <WaitingState variant="document" title="Preparando la ficha PDF…" detail="Generamos el documento con el código QR del seguimiento." /> : null}
      <ModuleTabs label={`Ficha ${selected.code}`} activeHref={`/pedidos/${selected.id}${route.tab && route.tab !== 'resumen' ? `/${route.tab}` : ''}`} tabs={[{ label: 'Resumen', href: `/pedidos/${selected.id}` }, { label: 'Cobros', href: `/pedidos/${selected.id}/cobros` }, { label: 'Producción', href: `/pedidos/${selected.id}/produccion` }, { label: 'Historial', href: `/pedidos/${selected.id}/historial` }]} />
      {route.tab === 'resumen' ? <section className="card order-detail-card"><div className="order-detail-grid"><div><h2>Productos y fabricación</h2>{selected.lines.map((line) => <div className="order-detail-line" key={line.id}><span>{formatOrderLine(line)}</span><b>{formatPEN(line.lineSubtotalCents)}</b>{line.job ? <AppLink className="text-button" href={`/produccion/${line.job.id}/materiales`}>Abrir orden de producción ↗</AppLink> : null}</div>)}</div><div className="order-totals"><span>Subtotal <b>{formatPEN(selected.subtotalCents)}</b></span><span>Descuento <b>− {formatPEN(selected.discountCents)}</b></span><span>IGV ({(selected.taxRateBasisPoints / 100).toFixed(2)}%) <b>{formatPEN(selected.taxCents)}</b></span><strong>Total <b>{formatPEN(selected.totalCents)}</b></strong><span>Pagado <b>{formatPEN(selected.paidCents)}</b></span><span>Saldo <b>{formatPEN(selected.totalCents - selected.paidCents)}</b></span><span className="pill pill--neutral">Cobro {label(selected.paymentStatus, paymentLabel)}</span></div></div><div className="order-detail-actions"><label className="status-select">Estado<SelectField value={selected.status} onChange={(event) => void updateStatus(event.target.value)}><option value={selected.status}>{label(selected.status, orderLabel)}</option>{['CONFIRMED', 'IN_PRODUCTION'].includes(selected.status) ? <><option value="READY">Listo</option><option value="CANCELLED">Cancelado</option></> : selected.status === 'READY' ? <option value="DELIVERED">Entregado</option> : null}</SelectField></label><AppLink className="button button--quiet" href={`/seguimiento/${selected.trackingToken}`}>Ver seguimiento público</AppLink></div></section> : null}
      {route.tab === 'cobros' ? <><div className="module-summary-grid"><div className="module-summary-card"><span>Total del pedido</span><strong>{formatPEN(selected.totalCents)}</strong></div><div className="module-summary-card"><span>Pagado</span><strong>{formatPEN(selected.paidCents)}</strong></div><div className="module-summary-card module-summary-card--balance"><span>Saldo</span><strong>{formatPEN(selected.totalCents - selected.paidCents)}</strong></div></div><section className="card table-card"><div className="card-heading"><div><p className="eyebrow">HISTORIAL</p><h2>{selected.payments?.length ?? 0} pagos registrados</h2></div></div>{selected.payments?.length ? <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Método</th><th>Observación</th><th>Monto</th></tr></thead><tbody>{selected.payments.map((entry) => <tr key={entry.id}><td>{dateTime(entry.paidAt)}</td><td>{entry.method}</td><td>{entry.observation || '—'}</td><td className="numeric-cell">{formatPEN(entry.amountCents)}</td></tr>)}</tbody></table></div> : <p className="field-hint">Aún no hay pagos registrados.</p>}</section><section className="card form-card payment-form-card"><div className="card-heading"><div><p className="eyebrow">NUEVO MOVIMIENTO</p><h2>Registrar pago</h2></div></div><form className="form-grid" onSubmit={savePayment}><label>Monto (S/)<input type="number" min="0.01" max={(selected.totalCents - selected.paidCents) / 100} step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} required disabled={selected.paymentStatus === 'PAID'} /></label><label>Método<SelectField value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></SelectField></label><label className="span-2">Observación<input value={payment.observation} onChange={(event) => setPayment({ ...payment, observation: event.target.value })} /></label><div className="route-form__actions span-2"><button className="button button--primary" type="submit" disabled={busy || selected.paymentStatus === 'PAID'}>{busy ? 'Guardando…' : 'Guardar pago'}</button></div></form></section></> : null}
      {route.tab === 'produccion' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">FABRICACIÓN</p><h2>Órdenes relacionadas</h2></div></div>{selected.lines.some((line) => line.job) ? <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Producto</th><th>Estado</th><th>Avance</th><th></th></tr></thead><tbody>{selected.lines.filter((line) => line.job).map((line) => <tr key={line.id}><td className="mono">OP {line.job?.id.slice(0, 8).toUpperCase()}</td><td>{line.name}</td><td>{label(line.job?.stage ?? '', {})}</td><td>{line.job?.progress ?? 0}%</td><td><AppLink className="text-button" href={`/produccion/${line.job?.id}/materiales`}>Abrir orden →</AppLink></td></tr>)}</tbody></table></div> : <EmptyInline title="Sin órdenes de producción" detail="Las órdenes de fabricación relacionadas aparecerán aquí." />}</section> : null}
      {route.tab === 'historial' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">ACTIVIDAD COMERCIAL</p><h2>Historial del pedido</h2></div></div><div className="timeline-list"><div className="timeline-entry"><span className="timeline-dot" /><div><b>Pedido creado</b><p>{formatPEN(selected.totalCents)} · {label(selected.status, orderLabel)}</p><time>{dateTime(selected.createdAt)}</time></div></div>{(selected.payments ?? []).map((entry) => <div className="timeline-entry" key={entry.id}><span className="timeline-dot" /><div><b>Pago recibido · {formatPEN(entry.amountCents)}</b><p>{entry.method}{entry.observation ? ` · ${entry.observation}` : ''}</p><time>{dateTime(entry.paidAt)}</time></div></div>)}</div></section> : null}
    </> : <EmptyState title="Pedido no encontrado" detail="Vuelve al listado y abre un pedido existente." action="Volver a Pedidos" onAction={() => navigateTo('/pedidos')} /> : null}
  </>;
}

function PageHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 tabIndex={-1}>{title}</h1><p>{subtitle}</p></div>{actions ? <div className="page-heading__actions">{actions}</div> : null}</div>;
}

function EmptyInline({ title, detail, action, onAction, variant }: { title: string; detail: string; action?: string; onAction?: () => void; variant?: 'empty' | 'no-results' }) {
  return <SharedEmptyState compact variant={variant} title={title} detail={detail} action={action && onAction ? <button className="button button--quiet button--small" type="button" onClick={onAction}>{action}</button> : undefined} />;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <SharedEmptyState variant="no-results" title={title} detail={detail} action={action && onAction ? <button className="button button--quiet" type="button" onClick={onAction}>{action}</button> : undefined} />;
}
