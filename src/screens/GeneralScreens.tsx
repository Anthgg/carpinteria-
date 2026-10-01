import { lazy, Suspense, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Tooltip } from '@heroui/react/tooltip';
import { EmptyState as SharedEmptyState } from '../components/feedback/Feedback';
import { BusyLabel } from '../components/feedback/Feedback';
import { api, dateTime, formatPEN } from '../api';
import type { DashboardPeriod, DashboardSummary } from '../api';
import type { AppPage, AppRoute, Customer, Order, Product, SettingValues } from '../App';
import { AppLink, ModuleTabs } from '../components/ModuleTabs';
import { SelectField } from '../components/SelectField';
import { navigateTo } from '../navigation';
import { Icon } from '../components/Icon';
import { unitLabel } from '../units';

type Run = <T,>(action: () => Promise<T>, success: string) => Promise<T | undefined>;
const OrdersTrendChart = lazy(() => import('../components/OrdersTrendChart').then((module) => ({ default: module.OrdersTrendChart })));
const documentKinds = ['DNI', 'RUC', 'CE', 'PASAPORTE', 'OTRO'];
const emptyCustomer = { documentType: 'DNI', documentNumber: '', name: '', phone: '', email: '', address: '', notes: '' };
const orderStatusLabels: Record<string, string> = { CONFIRMED: 'Confirmado', IN_PRODUCTION: 'En producción', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' };
const orderStatusLabel = (status: string) => orderStatusLabels[status] ?? status.replaceAll('_', ' ');

export function DashboardScreen({ data, period, onPeriodChange, onNavigate }: { data?: DashboardSummary; period: DashboardPeriod; onPeriodChange: (period: DashboardPeriod) => void; onNavigate: (page: AppPage) => void }) {
  if (!data) return <EmptyState title="No hay resumen disponible" detail="Comprueba la conexión y vuelve a cargar la página." />;
  const stageLabel: Record<string, string> = { ORDER_RECEIVED: 'Pedido recibido', MATERIALS_RESERVED: 'Materiales reservados', CUTTING: 'Corte', ASSEMBLY: 'Ensamblaje', SANDING: 'Lijado', FINISHING: 'Acabado', QUALITY_CONTROL: 'Control de calidad', READY: 'Listo' };
  const hasTrend = data.ordersTrend.points.some((point) => point.orderCount > 0 || point.totalCents > 0);
  const maxStageCount = Math.max(1, ...data.productionByStage.map((stage) => stage.count));
  const periodLabel = period === '7d' ? 'Últimos 7 días' : period === '30d' ? 'Últimos 30 días' : 'Este mes';
  return <>
    <PageHeading eyebrow="LUNES A VIERNES · ESTADO DEL TALLER" title="El taller, en orden." subtitle="Una vista clara de lo que está pasando hoy." />
    <div className="stat-grid">
      <StatCard label="PEDIDOS ACTIVOS" value={data.activeOrders} suffix="en curso" tone="forest" icon={<Icon name="orders" size={18} />} />
      <StatCard label="PEDIDOS LISTOS" value={data.readyOrders} suffix="para coordinar" tone="ochre" icon={<Icon name="success" size={18} />} />
      <StatCard label="INCIDENCIAS ABIERTAS" value={data.openIncidents} suffix="requieren atención" tone={data.openIncidents ? 'coral' : 'forest'} icon={<Icon name="incident" size={18} />} />
      <StatCard label="PEDIDOS DEL MES" value={data.period.orders} suffix={formatPEN(data.period.orderTotalCents)} tone="forest" icon={<Icon name="chart" size={18} />} />
    </div>
    <div className="dashboard-grid">
      <section className="card trend-card" aria-labelledby="orders-trend-title">
        <div className="card-heading">
          <div><p className="eyebrow">VENTAS Y PEDIDOS</p><h2 id="orders-trend-title">Actividad del taller</h2><p>Pedidos creados y venta no cancelada · {periodLabel}</p></div>
          <div className="trend-tools">
            <div className="trend-legend" aria-label="Series del gráfico"><span><i className="trend-legend__sales" />Ventas</span><span><i className="trend-legend__orders" />Pedidos</span></div>
            <Tooltip>
              <Tooltip.Trigger className="chart-help" aria-label="Acerca de este gráfico"><Icon name="help" size={16} /></Tooltip.Trigger>
              <Tooltip.Content placement="top">Importes en soles. Los pedidos cancelados quedan fuera de la serie.</Tooltip.Content>
            </Tooltip>
            <label className="trend-period">Periodo
              <SelectField value={period} onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)} aria-label="Periodo de actividad">
                <option value="7d">7 días</option><option value="30d">30 días</option><option value="month">Este mes</option>
              </SelectField>
            </label>
          </div>
        </div>
        <div className="trend-chart">
          {hasTrend ? <Suspense fallback={<div className="chart-loading" role="status" aria-label="Cargando gráfico" />}><OrdersTrendChart points={data.ordersTrend.points} /></Suspense> : <SharedEmptyState compact title="No hay ventas registradas en este periodo." detail="La actividad aparecerá aquí cuando se registren pedidos." />}
        </div>
        <p className="trend-note">Datos reales del taller · {data.ordersTrend.points.reduce((total, point) => total + point.orderCount, 0)} pedidos en el periodo</p>
      </section>
      <section className="card stage-card">
        <div className="card-heading"><div><p className="eyebrow">FLUJO DE TRABAJO</p><h2>Producción por etapa</h2></div><button type="button" className="text-button" onClick={() => onNavigate('production')}>Ver producción <span>→</span></button></div>
        {data.productionByStage.length ? <div className="stage-list">{data.productionByStage.map((stage) => <div className="stage-row" key={stage.stage}><span className="stage-marker" /><span className="stage-name">{stageLabel[stage.stage] ?? stage.stage}</span><div className="stage-track"><span style={{ width: `${Math.round(stage.count / maxStageCount * 100)}%` }} /></div><b>{stage.count}</b></div>)}</div> : <EmptyInline title="Sin producción en marcha" detail="Los trabajos activos aparecerán aquí." action="Ver producción" onAction={() => onNavigate('production')} />}
        <div className="month-note"><span>DESDE EL 1 DEL MES</span><b>{data.period.orders} pedidos <i>·</i> {formatPEN(data.period.orderTotalCents)}</b></div>
      </section>
      <section className="card stock-card">
        <div className="card-heading"><div><p className="eyebrow">MATERIALES Y HERRAMIENTAS</p><h2>Stock por revisar</h2></div><button type="button" className="round-arrow" aria-label="Abrir inventario" onClick={() => onNavigate('inventory')}><Icon name="outgoing" size={16} /></button></div>
        {data.lowStock.length ? <div className="low-stock-list">{data.lowStock.slice(0, 6).map((item) => <div className="low-stock-row" key={item.id}><span className="material-chip">{item.name.slice(0, 1)}</span><div><b>{item.name}</b><small>{item.type.toLowerCase()}</small></div><strong>{item.stock + item.availablePieces}<small> {unitLabel(item.unit, item.stock + item.availablePieces)}</small></strong></div>)}</div> : <EmptyInline title="Stock al día" detail="Los artículos con pocas existencias aparecerán aquí." />}
      </section>
      <section className="card movements-card">
        <div className="card-heading"><div><p className="eyebrow">REGISTRO EN VIVO</p><h2>Últimos movimientos</h2></div><button type="button" className="text-button" onClick={() => onNavigate('inventory')}>Ver inventario <span>→</span></button></div>
        {data.recentMovements.length ? <div className="movement-list">{data.recentMovements.slice(0, 7).map((movement) => { const movementIcon = movement.action.includes('CONSUMED') ? 'incoming' : movement.action.includes('CREATED') ? 'material' : 'outgoing'; return <div className="movement-row" key={movement.id}><span className="movement-icon"><Icon name={movementIcon} size={16} /></span><div><b>{movement.itemName}</b><small>{movement.note || movement.action.replaceAll('_', ' ').toLowerCase()}</small></div><time>{dateTime(movement.createdAt)}</time></div>; })}</div> : <EmptyInline title="Aún no hay movimientos" detail="Las entradas, reservas y consumos se registrarán aquí." />}
      </section>
      <section className="card workshop-card"><div className="workshop-graphic" aria-hidden="true"><span /><span /><span /></div><p className="eyebrow">EL SIGUIENTE PASO</p><h2>Todo empieza<br />con un buen pedido.</h2><p>Organiza el trabajo desde la cotización hasta la entrega.</p><button type="button" className="button button--light icon-motion icon-motion--nudge" onClick={() => onNavigate('orders')}>Crear un pedido <Icon name="next" size={16} /></button></section>
    </div>
  </>;
}

export function DashboardSkeleton() {
  return <div className="page-content dashboard-skeleton" role="status" aria-label="Cargando resumen">
    <div className="page-heading"><div><span className="skeleton-line skeleton-line--eyebrow" /><span className="skeleton-line skeleton-line--title" /><span className="skeleton-line skeleton-line--subtitle" /></div></div>
    <div className="stat-grid">{Array.from({ length: 4 }, (_, index) => <div className="stat-card skeleton-block" key={index}><span className="skeleton-line" /><span className="skeleton-line skeleton-line--number" /><span className="skeleton-line skeleton-line--short" /></div>)}</div>
    <div className="dashboard-grid"><div className="card skeleton-block skeleton-block--trend" /><div className="card skeleton-block" /><div className="card skeleton-block" /><div className="card skeleton-block" /></div>
  </div>;
}

export function CustomersScreen({ customers, orders = [], busy, run, route }: { customers: Customer[]; orders?: Order[]; busy: boolean; run: Run; route: AppRoute }) {
  const [form, setForm] = useState(emptyCustomer);
  const [search, setSearch] = useState('');
  const selected = customers.find((customer) => customer.id === route.id);
  const editing = route.view === 'edit';
  useEffect(() => {
    if (editing && selected) setForm({ documentType: selected.documentType, documentNumber: selected.documentNumber ?? '', name: selected.name, phone: selected.phone ?? '', email: selected.email ?? '', address: selected.address ?? '', notes: selected.notes ?? '' });
    else if (route.view === 'create') setForm(emptyCustomer);
  }, [editing, route.id, route.view, selected?.id]);
  const visible = customers.filter((customer) => `${customer.name} ${customer.documentNumber ?? ''} ${customer.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const customerOrders = selected ? orders.filter((order) => order.customer.id === selected.id) : [];
  const orderTotals = customerOrders.reduce((total, order) => ({ count: total.count + 1, amount: total.amount + order.totalCents, balance: total.balance + order.totalCents - order.paidCents }), { count: 0, amount: 0, balance: 0 });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => api(`/customers${editing ? `/${route.id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) }), editing ? 'Datos del cliente actualizados.' : 'Cliente agregado.');
    if (result) navigateTo('/clientes');
  };
  const activeHref = route.view === 'create' ? '/clientes' : '/clientes';
  const formView = route.view === 'create' || route.view === 'edit';
  return <>
    <ModuleTabs label="Pedidos y ventas" activeHref={activeHref} tabs={[{ label: 'Pedidos', href: '/pedidos' }, { label: 'Cobros', href: '/pedidos/cobros' }, { label: 'Clientes', href: '/clientes' }, { label: 'Productos', href: '/productos' }]} />
    <PageHeading eyebrow={formView ? 'RELACIONES Y CONTACTOS' : 'DIRECTORIO DE CLIENTES'} title={route.view === 'create' ? 'Nuevo cliente.' : editing ? 'Editar cliente.' : route.view === 'detail' ? `${selected?.name ?? 'Cliente'}.` : 'Clientes.'} subtitle={formView ? 'Registra la información de contacto de quien solicita un trabajo.' : 'La información de contacto de quienes confían en el taller.'} actions={route.view === 'list' ? <button type="button" className="button button--primary" onClick={() => navigateTo('/clientes/nuevo')}><Icon name="create" size={16} />Nuevo cliente</button> : route.view === 'detail' ? <button type="button" className="button button--primary" onClick={() => navigateTo(`/clientes/${route.id}/editar`)}>Editar cliente</button> : null} />
    {route.view === 'list' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">DIRECTORIO</p><h2>{customers.length} clientes</h2></div><div className="search-box search-box--small"><Icon name="search" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /></div></div>{visible.length ? <div className="customer-list">{visible.map((customer) => <AppLink className="customer-row customer-row--link" key={customer.id} href={`/clientes/${customer.id}`}><div className="avatar avatar--soft">{customer.name.slice(0, 1).toUpperCase()}</div><div className="customer-row__main"><b>{customer.name}</b><small>{customer.documentType}{customer.documentNumber ? ` · ${customer.documentNumber}` : ''}</small><span>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo'}</span></div><span className="row-affordance"><Icon name="chevron" size={16} /></span></AppLink>)}</div> : search.trim() ? <EmptyInline variant="no-results" title="No encontramos clientes con esa búsqueda." detail="Prueba con otra parte del nombre, el documento o el teléfono." /> : <EmptyInline title="Aún no hay clientes" detail="Registra a quien solicitará un trabajo." action="Nuevo cliente" onAction={() => navigateTo('/clientes/nuevo')} />}</section> : null}
    {route.view === 'detail' ? selected ? <section className="card detail-card"><div className="detail-card__header"><div className="avatar avatar--soft">{selected.name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">FICHA DEL CLIENTE</p><h2>{selected.name}</h2><p>{selected.documentType}{selected.documentNumber ? ` · ${selected.documentNumber}` : ''}</p></div></div><div className="detail-grid"><span>Teléfono<b>{selected.phone || 'No registrado'}</b></span><span>Correo<b>{selected.email || 'No registrado'}</b></span><span>Dirección<b>{selected.address || 'No registrada'}</b></span><span>Notas<b>{selected.notes || 'Sin notas'}</b></span></div><div className="module-summary-grid"><div className="module-summary-card"><span>Pedidos registrados</span><strong>{orderTotals.count}</strong></div><div className="module-summary-card"><span>Importe acumulado</span><strong>{formatPEN(orderTotals.amount)}</strong></div><div className="module-summary-card module-summary-card--balance"><span>Saldo acumulado</span><strong>{formatPEN(orderTotals.balance)}</strong></div></div><h3>Pedidos recientes</h3>{customerOrders.length ? <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Importe</th><th>Saldo</th></tr></thead><tbody>{customerOrders.map((order) => <tr key={order.id}><td><AppLink href={`/pedidos/${order.id}`} className="table-row-link">{order.code}</AppLink></td><td>{dateTime(order.createdAt)}</td><td>{orderStatusLabel(order.status)}</td><td>{formatPEN(order.totalCents)}</td><td>{formatPEN(order.totalCents - order.paidCents)}</td></tr>)}</tbody></table></div> : <p className="field-hint">Este cliente todavía no tiene pedidos registrados.</p>}</section> : <EmptyState title="Cliente no encontrado" detail="Vuelve al directorio y abre un cliente existente." action="Volver a clientes" onAction={() => navigateTo('/clientes')} /> : null}
    {formView ? <section className="card form-card route-form"><div className="card-heading"><div><p className="eyebrow">{editing ? 'ACTUALIZAR FICHA' : 'ALTA DE CONTACTO'}</p><h2>{editing ? form.name : 'Datos del cliente'}</h2></div></div><form className="form-grid" onSubmit={submit}><label className="span-2">Nombre o razón social<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Tipo de documento<SelectField value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>{documentKinds.map((kind) => <option key={kind}>{kind}</option>)}</SelectField></label><label>Número<input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></label><label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label className="span-2">Dirección<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label><label className="span-2">Notas<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><div className="route-form__actions span-2"><button type="button" className="button button--quiet" onClick={() => navigateTo(editing ? `/clientes/${route.id}` : '/clientes')}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cliente'}</button></div></form></section> : null}
  </>;
}

export function ProductsScreen({ products, busy, run, route }: { products: Product[]; busy: boolean; run: Run; route: AppRoute }) {
  const emptyForm = { code: '', name: '', description: '', defaultProduct: false };
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const selected = products.find((product) => product.id === route.id);
  const editing = route.view === 'edit';
  useEffect(() => {
    if (editing && selected) setForm({ code: selected.code ?? '', name: selected.name, description: selected.description ?? '', defaultProduct: selected.defaultProduct });
    else if (route.view === 'create') setForm(emptyForm);
  }, [editing, route.id, route.view, selected?.id]);
  const visibleProducts = products.filter((product) => `${product.name} ${product.code ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const submit = async (event: FormEvent) => { event.preventDefault(); const result = await run(() => api(`/products${editing ? `/${route.id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) }), editing ? 'Producto actualizado.' : 'Producto creado.'); if (result) navigateTo('/productos'); };
  const formView = route.view === 'create' || editing;
  return <>
    <ModuleTabs label="Pedidos y ventas" activeHref="/productos" tabs={[{ label: 'Pedidos', href: '/pedidos' }, { label: 'Cobros', href: '/pedidos/cobros' }, { label: 'Clientes', href: '/clientes' }, { label: 'Productos', href: '/productos' }]} />
    <PageHeading eyebrow="CATÁLOGO · A MEDIDA" title={route.view === 'create' ? 'Nuevo producto.' : editing ? 'Editar producto.' : route.view === 'detail' ? `${selected?.name ?? 'Producto'}.` : 'Productos.'} subtitle={formView ? 'Define los datos de referencia del producto.' : 'Muebles de referencia y líneas personalizadas. El material se elige por pedido.'} actions={route.view === 'list' ? <button type="button" className="button button--primary" onClick={() => navigateTo('/productos/nuevo')}><Icon name="create" size={16} />Nuevo producto</button> : route.view === 'detail' ? <button type="button" className="button button--primary" onClick={() => navigateTo(`/productos/${route.id}/editar`)}>Editar producto</button> : null} />
    {route.view === 'list' ? <><div className="inventory-toolbar"><div className="search-box"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en el catálogo" aria-label="Buscar productos" /></div><span className="muted">{visibleProducts.length} productos</span></div><section className="catalog-grid">{visibleProducts.map((product, index) => <AppLink href={`/productos/${product.id}`} className="catalog-card catalog-card--link" key={product.id}><div className={`catalog-card__art catalog-card__art--${index % 4}`}><span>{product.defaultProduct ? 'DE CATÁLOGO' : 'A MEDIDA'}</span><i aria-hidden="true"><Icon name={(['wood', 'material', 'stock', 'cut'] as const)[index % 4]} size={40} /></i></div><div className="catalog-card__body"><small>{product.code || 'PRODUCTO'}</small><h2>{product.name}</h2><p>{product.description || 'Sin descripción adicional.'}</p><span className="text-button">Abrir ficha <span>→</span></span></div></AppLink>)}{!visibleProducts.length && search.trim() ? <EmptyInline variant="no-results" title="No encontramos productos con esa búsqueda." detail="Prueba con otra parte del nombre o la descripción." /> : null}{!visibleProducts.length && !search.trim() ? <EmptyInline title="Catálogo vacío" detail="Agrega mesas, sillas y otros muebles de referencia." action="Nuevo producto" onAction={() => navigateTo('/productos/nuevo')} /> : null}</section></> : null}
    {route.view === 'detail' ? selected ? <section className="card detail-card"><p className="eyebrow">FICHA DE PRODUCTO · {selected.code || 'SIN CÓDIGO'}</p><h2>{selected.name}</h2><p>{selected.description || 'Sin descripción adicional.'}</p><div className="detail-grid"><span>Tipo<b>{selected.defaultProduct ? 'Producto predeterminado' : 'Producto a medida'}</b></span><span>Estado<b>{selected.active ? 'Activo' : 'Inactivo'}</b></span></div><p className="field-hint">Las dimensiones, materiales y cantidades de producción se definen para cada pedido.</p></section> : <EmptyState title="Producto no encontrado" detail="Vuelve al catálogo y abre un producto existente." action="Volver a productos" onAction={() => navigateTo('/productos')} /> : null}
    {formView ? <section className="card form-card route-form"><div className="card-heading"><div><p className="eyebrow">{editing ? 'ACTUALIZAR FICHA' : 'CATÁLOGO DEL TALLER'}</p><h2>{editing ? form.name : 'Datos del producto'}</h2></div></div><form className="form-grid" onSubmit={submit}><label className="span-2">Nombre<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Mesa auxiliar" /></label><label>Código (opcional)<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label><label className="span-2">Descripción<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="check-label span-2"><input type="checkbox" checked={form.defaultProduct} onChange={(e) => setForm({ ...form, defaultProduct: e.target.checked })} /> Producto predeterminado</label><p className="field-hint span-2">Las dimensiones y los materiales se definen para cada pedido.</p><div className="route-form__actions span-2"><button type="button" className="button button--quiet" onClick={() => navigateTo(editing ? `/productos/${route.id}` : '/productos')}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}</button></div></form></section> : null}
  </>;
}

export function SettingsScreen({ settings, busy, run, route }: { settings?: SettingValues; busy: boolean; run: Run; route: AppRoute }) {
  const [form, setForm] = useState<SettingValues | null>(null);
  const values = form ?? settings;
  const section = ['taller', 'cotizacion', 'corte'].includes(route.section) ? route.section : 'taller';
  if (!values) return <EmptyState title="No se pudo cargar la configuración" detail="Vuelve a intentarlo en unos segundos." />;
  const updateNumericSetting = (field: 'taxRate' | 'kerfMm', rawValue: string) => {
    const value = rawValue === '' ? 0 : Number(rawValue);
    if (!Number.isFinite(value)) return;
    setForm({ ...values, [field]: value });
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); const result = await run(() => api('/settings', { method: 'PUT', body: JSON.stringify(values) }), 'Configuración del taller guardada.'); if (result) setForm(null); };
  return <><ModuleTabs label="Configuración" activeHref={`/configuracion/${section}`} tabs={[{ label: 'Taller', href: '/configuracion/taller' }, { label: 'Cotización', href: '/configuracion/cotizacion' }, { label: 'Corte', href: '/configuracion/corte' }]} /><PageHeading eyebrow="VALORES DEL SERVIDOR" title={`${section === 'taller' ? 'Datos del taller' : section === 'cotizacion' ? 'Cotización' : 'Corte'}.`} subtitle="Se muestran solo las opciones que expone la configuración actual del backend." />
    <form className="page-section settings-section" onSubmit={submit}>
      <div className="settings-section__intro">
        <span className="section-icon"><Icon name={section === 'taller' ? 'dashboard' : section === 'cotizacion' ? 'receipt' : 'cut'} size={24} /></span>
        <p className="eyebrow">{section === 'taller' ? 'TALLER' : section === 'cotizacion' ? 'REGLAS COMERCIALES' : 'PLANO DE CORTE'}</p>
        <h2>{section === 'taller' ? 'Datos de contacto' : section === 'cotizacion' ? 'Impuestos' : 'Pérdida de sierra (kerf)'}</h2>
        <p>{section === 'taller' ? 'Aparecen en la ficha PDF y en el seguimiento que recibe el cliente.' : section === 'cotizacion' ? 'El servidor aplica esta tasa a los pedidos nuevos y conserva la tasa aplicada en cada pedido.' : 'Ancho que se pierde en cada corte de sierra. Se considera durante la simulación; el inventario cambia solo al confirmar un corte real.'}</p>
      </div>
      <div className="form-grid settings-section__fields">
        {section === 'taller' ? <><label className="span-2">Nombre del taller<input value={values.companyName} onChange={(event) => setForm({ ...values, companyName: event.target.value })} /></label><label className="span-2">Teléfono de contacto<input value={values.companyPhone} onChange={(event) => setForm({ ...values, companyPhone: event.target.value })} placeholder="Para comunicación comercial" /></label></> : null}
        {section === 'cotizacion' ? <label>IGV (%)<input type="number" min="0" max="100" step="0.01" value={values.taxRate} onChange={(event) => updateNumericSetting('taxRate', event.target.value)} /></label> : null}
        {section === 'corte' ? <label>Kerf (mm, de 0 a 100)<input type="number" min="0" max="100" step="1" value={values.kerfMm} onChange={(event) => updateNumericSetting('kerfMm', event.target.value)} /></label> : null}
      </div>
      <div className="action-bar"><button type="submit" className="button button--primary" disabled={busy}><BusyLabel busy={busy} busyText="Guardando…"><Icon name="save" size={16} />Guardar configuración</BusyLabel></button></div>
    </form>
    {section === 'taller' ? <WebPushSettings /> : null}
  </>;
}

type WebPushTarget = { id: string; orderCode: string; products: string[]; createdAt: string };

function WebPushSettings() {
  const [configured, setConfigured] = useState(false);
  const [targets, setTargets] = useState<WebPushTarget[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadTargets = async () => {
    setLoading(true);
    try {
      const result = await api<{ configured: boolean; targets: WebPushTarget[] }>('/production/notifications/test-targets');
      setConfigured(result.configured);
      setTargets(result.targets);
      setSelectedId((current) => result.targets.some((target) => target.id === current) ? current : result.targets[0]?.id ?? '');
    } catch {
      setMessage('No se pudo consultar la configuración de Web Push.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTargets(); }, []);

  const sendTest = async () => {
    if (!selectedId) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ sent: boolean; orderCode: string }>('/production/notifications/test', {
        method: 'POST', body: JSON.stringify({ subscriptionId: selectedId }),
      });
      setMessage(`Aviso de prueba enviado solo a ${result.orderCode}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo enviar el aviso de prueba.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="page-section settings-section push-admin-section" aria-labelledby="push-admin-title">
    <div className="settings-section__intro">
      <span className="section-icon"><Icon name="notify" size={24} /></span>
      <p className="eyebrow">AVISOS AL CLIENTE</p>
      <h2 id="push-admin-title">Notificaciones Web Push</h2>
      <p>{configured ? 'Configurado para el entorno local. La prueba solo envía a una suscripción QA seleccionada.' : 'Configura VAPID en el .env local del backend para activar los avisos.'}</p>
    </div>
    <div className="push-admin__controls">
      <div className={`push-admin__status ${configured ? 'is-ready' : ''}`} role="status"><span className="status-dot" />{loading ? 'Comprobando estado…' : configured ? 'Web Push configurado' : 'Avisos no disponibles'}</div>
      {targets.length ? <label>Destino QA
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
          {targets.map((target) => <option key={target.id} value={target.id}>{target.orderCode} · {target.products.join(', ') || 'Pedido QA'} · {dateTime(target.createdAt)}</option>)}
        </select>
      </label> : <p className="field-hint">{configured ? 'Activa avisos en el seguimiento de PED-00007 o PED-00008 para registrar una suscripción QA.' : 'Las claves VAPID permanecen en el .env ignorado del backend.'}</p>}
      {configured && targets.length ? <button type="button" className="button button--primary" onClick={() => void sendTest()} disabled={busy || loading || !selectedId}>{busy ? 'Enviando…' : 'Enviar aviso de prueba'}</button> : null}
      <button type="button" className="button button--quiet" onClick={() => void loadTargets()} disabled={loading || busy}>Actualizar estado</button>
      {message ? <p className="push-admin__message" role="status">{message}</p> : null}
    </div>
  </section>;
}

export function UsersScreen({ users, busy, run, route }: { users: any[]; busy: boolean; run: Run; route: AppRoute }) {
  const emptyForm = { name: '', email: '', role: 'OPERARIO', password: '', active: true };
  const [form, setForm] = useState(emptyForm);
  const editing = route.view === 'edit';
  const selected = users.find((user) => user.id === route.id);
  useEffect(() => {
    if (editing && selected) setForm({ name: selected.name, email: selected.email, role: selected.role, password: '', active: selected.active });
    else if (route.view === 'create') setForm(emptyForm);
  }, [editing, route.id, route.view, selected?.id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = { name: form.name, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}), ...(editing ? { active: form.active } : {}) };
    const result = await run(() => api('/users' + (editing ? '/' + route.id : ''), { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }), editing ? 'Cuenta actualizada.' : 'Cuenta local creada.');
    if (result) navigateTo('/usuarios');
  };
  const formView = route.view === 'create' || editing;
  return <>
    <PageHeading eyebrow="CUENTAS LOCALES" title={formView ? editing ? 'Editar usuario.' : 'Nuevo usuario.' : 'Usuarios.'} subtitle={formView ? 'Administra la cuenta y el rol que utiliza en el sistema local.' : 'Cuentas, roles y estado de acceso del equipo.'} actions={route.view === 'list' ? <button type="button" className="button button--primary" onClick={() => navigateTo('/usuarios/nuevo')}><Icon name="create" size={16} />Crear usuario</button> : null} />
    {route.view === 'list' ? <section className="card table-card"><div className="card-heading"><div><p className="eyebrow">PERSONAL CON ACCESO</p><h2>{users.length} cuentas</h2></div></div><div className="table-wrap"><table className="users-table"><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
      <td><div className="person-cell"><span className="avatar avatar--soft">{user.name.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>{user.email}</small></span></div></td>
      <td>{user.role === 'ADMIN' ? 'Administración' : user.role === 'OPERARIO' ? 'Producción' : 'Pruebas'}<small>{user.role}</small></td>
      <td><span className={`badge ${user.active ? 'badge--ok' : 'badge--error'}`}>{user.active ? 'Activa' : 'Inactiva'}</span></td>
      <td className="numeric-cell"><button type="button" className="text-button icon-motion" onClick={() => navigateTo(`/usuarios/${user.id}/editar`)} aria-label={'Editar ' + user.name}><Icon name="edit" size={16} />Editar</button></td>
    </tr>)}</tbody></table></div></section> : null}
    {formView && (!editing || selected) ? <section className="card form-card route-form"><div className="card-heading"><div><p className="eyebrow">{editing ? 'GESTIÓN DE CUENTA' : 'ALTA LOCAL'}</p><h2>{editing ? selected?.name : 'Datos de acceso'}</h2></div></div><form className="form-grid" onSubmit={submit}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></label>
          <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Rol<SelectField value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="ADMIN">ADMIN · Administración</option><option value="OPERARIO">OPERARIO · Producción</option><option value="TESTER">TESTER · Pruebas y validación</option></SelectField></label>
          <label>Contraseña{editing ? ' nueva (opcional)' : ''}<input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={12} required={!editing} placeholder="Al menos 12 caracteres" /></label>
          {editing ? <label className="check-label"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Cuenta activa</label> : null}
          <p className="field-hint">Las contraseñas se guardan como hash seguro. No compartas cuentas productivas.</p>
          <div className="route-form__actions span-2"><button type="button" className="button button--quiet" onClick={() => navigateTo('/usuarios')}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}</button></div>
        </form></section> : null}
    {editing && !selected ? <EmptyState title="Usuario no encontrado" detail="Vuelve al listado para seleccionar una cuenta existente." action="Volver a usuarios" onAction={() => navigateTo('/usuarios')} /> : null}
  </>;
}
function PageHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 tabIndex={-1}>{title}</h1><p>{subtitle}</p></div>{actions ? <div className="page-heading__actions">{actions}</div> : null}</div>;
}

function StatCard({ label, value, suffix, tone, icon }: { label: string; value: string | number; suffix: string; tone: string; icon: ReactNode }) {
  return <article className={`stat-card stat-card--${tone}`}><div className="stat-card__top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{suffix}</small><span className="stat-card__line" /></article>;
}

function EmptyInline({ title, detail, action, onAction, variant }: { title: string; detail: string; action?: string; onAction?: () => void; variant?: 'empty' | 'no-results' }) {
  return <SharedEmptyState compact variant={variant} title={title} detail={detail} action={action && onAction ? <button type="button" className="text-button" onClick={onAction}>{action} →</button> : undefined} />;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <SharedEmptyState title={title} detail={detail} action={action && onAction ? <button type="button" className="button button--quiet" onClick={onAction}>{action}</button> : undefined} />;
}
