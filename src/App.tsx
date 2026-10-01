import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Drawer } from '@heroui/react/drawer';
import { Toast } from '@heroui/react/toast';
import { api } from './api';
import { getUnitCatalog, setUnitCatalog } from './units';
import type { UnitOption } from './units';
import type { DashboardPeriod, DashboardSummary } from './api';
import { AppLink } from './components/ModuleTabs';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { DetailSkeleton, ErrorState, FormSkeleton, PageLoader, TableSkeleton } from './components/feedback/Feedback';
import { WorkshopMascot } from './components/feedback/WorkshopMascot';
import type { WorkshopGuideContext, WorkshopGuideFacts } from './components/feedback/workshop-guide';

// Cada módulo se descarga al abrirlo: el arranque no paga gráficos, producción ni inventario.
const general = () => import('./screens/GeneralScreens');
const DashboardScreen = lazy(() => general().then((module) => ({ default: module.DashboardScreen })));
const DashboardSkeleton = lazy(() => general().then((module) => ({ default: module.DashboardSkeleton })));
const CustomersScreen = lazy(() => general().then((module) => ({ default: module.CustomersScreen })));
const ProductsScreen = lazy(() => general().then((module) => ({ default: module.ProductsScreen })));
const SettingsScreen = lazy(() => general().then((module) => ({ default: module.SettingsScreen })));
const UsersScreen = lazy(() => general().then((module) => ({ default: module.UsersScreen })));
const OrdersScreen = lazy(() => import('./modules/orders/OrdersScreen').then((module) => ({ default: module.OrdersScreen })));
const InventoryScreen = lazy(() => import('./modules/inventory/InventoryScreen').then((module) => ({ default: module.InventoryScreen })));
const ProductionScreen = lazy(() => import('./screens/ProductionScreen').then((module) => ({ default: module.ProductionScreen })));
const TrackingScreen = lazy(() => import('./screens/TrackingScreen').then((module) => ({ default: module.TrackingScreen })));
import { APP_NAVIGATION_EVENT, navigateTo } from './navigation';

export type Role = 'TESTER' | 'ADMIN' | 'OPERARIO';
export type User = { id: string; name: string; email: string; role: Role };
export type InventoryItem = {
  id: string; code: string; legacyId?: string | null; name: string; description?: string | null; type: string; unit: string; stock: number | string;
  unitPriceCents: number; sellable: boolean; controlsStock: boolean; productionConsumable: boolean;
  requiresDimensions: boolean; lengthMm?: number | null; widthMm?: number | null; thicknessMm?: number | null;
  active?: boolean;
  pieceCounts?: Record<string, number>;
};
export type Customer = { id: string; name: string; documentType: string; documentNumber?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null };
export type Product = { id: string; code?: string | null; name: string; description?: string | null; defaultProduct: boolean; active: boolean };
export type Order = {
  id: string; code: string; customer: Customer; status: string; subtotalCents: number; discountCents: number;
  taxRateBasisPoints: number; taxCents: number; totalCents: number; paidCents: number; paymentStatus: string;
  trackingToken: string; createdAt: string; lines: Array<{ id: string; name: string; type: string; quantity: number; unitPriceCents: number; lineSubtotalCents: number; job?: { id: string; stage: string; status: string; progress: number } | null }>;
  payments?: Array<{ id: string; amountCents: number; method: string; observation?: string | null; paidAt: string }>;
};
export type SettingValues = { taxRate: number; kerfMm: number; companyName: string; companyPhone: string };
export type AppPage = 'dashboard' | 'inventory' | 'customers' | 'products' | 'orders' | 'production' | 'settings' | 'users';
export type AppRoute = { page: AppPage; view: string; section: string; id?: string; tab?: string };

const nav = [
  { id: 'dashboard', label: 'Resumen', icon: 'dashboard', roles: ['ADMIN', 'TESTER'] },
  { id: 'orders', label: 'Pedidos', icon: 'orders', roles: ['ADMIN', 'TESTER'] },
  { id: 'production', label: 'Producción', icon: 'production', roles: ['ADMIN', 'TESTER', 'OPERARIO'] },
  { id: 'inventory', label: 'Inventario', icon: 'inventory', roles: ['ADMIN', 'TESTER', 'OPERARIO'] },
  { id: 'settings', label: 'Configuración', icon: 'settings', roles: ['ADMIN', 'TESTER'] },
  { id: 'users', label: 'Usuarios', icon: 'users', roles: ['ADMIN', 'TESTER'] },
] satisfies Array<{ id: AppPage; label: string; icon: IconName; roles: Role[] }>;

export function resolveRoute(path: string): AppRoute {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const [root, first, second] = parts;
  if (!root || root === 'dashboard') return { page: 'dashboard', view: 'dashboard', section: 'resumen' };
  if (root === 'pedidos') {
    if (!first) return { page: 'orders', view: 'list', section: 'pedidos' };
    if (first === 'nuevo') return { page: 'orders', view: 'create', section: 'pedidos' };
    if (first === 'cobros') return { page: 'orders', view: 'payments', section: 'cobros' };
    const tab = ['cobros', 'produccion', 'historial'].includes(second) ? second : 'resumen';
    return { page: 'orders', view: 'detail', section: 'pedidos', id: first, tab };
  }
  if (root === 'clientes') {
    if (!first) return { page: 'customers', view: 'list', section: 'clientes' };
    if (first === 'nuevo') return { page: 'customers', view: 'create', section: 'clientes' };
    return { page: 'customers', view: second === 'editar' ? 'edit' : 'detail', section: 'clientes', id: first };
  }
  if (root === 'productos') {
    if (!first) return { page: 'products', view: 'list', section: 'productos' };
    if (first === 'nuevo') return { page: 'products', view: 'create', section: 'productos' };
    return { page: 'products', view: second === 'editar' ? 'edit' : 'detail', section: 'productos', id: first };
  }
  if (root === 'inventario') {
    if (!first) return { page: 'inventory', view: 'list', section: 'articulos' };
    if (first === 'nuevo') return { page: 'inventory', view: 'create', section: 'articulos' };
    if (first === 'piezas') return { page: 'inventory', view: second === 'nueva' ? 'newPiece' : 'pieces', section: 'piezas' };
    if (first === 'movimientos') return { page: 'inventory', view: 'movements', section: 'movimientos' };
    if (first === 'importar') return { page: 'inventory', view: 'import', section: 'articulos' };
    return { page: 'inventory', view: second === 'editar' ? 'edit' : second === 'stock' ? 'stock' : 'detail', section: 'articulos', id: first };
  }
  if (root === 'produccion') {
    if (first === 'ordenes') return { page: 'production', view: 'orders', section: 'ordenes' };
    if (!first) return { page: 'production', view: 'board', section: 'tablero' };
    return { page: 'production', view: 'detail', section: 'ordenes', id: first, tab: second ?? 'materiales' };
  }
  if (root === 'configuracion') return { page: 'settings', view: 'settings', section: first ?? 'taller' };
  if (root === 'usuarios') {
    if (!first) return { page: 'users', view: 'list', section: 'usuarios' };
    if (first === 'nuevo') return { page: 'users', view: 'create', section: 'usuarios' };
    return { page: 'users', view: 'edit', section: 'usuarios', id: first };
  }
  return { page: 'dashboard', view: 'dashboard', section: 'resumen' };
}

const pagePaths: Record<AppPage, string> = { dashboard: '/', orders: '/pedidos', production: '/produccion', inventory: '/inventario', customers: '/clientes', products: '/productos', settings: '/configuracion/taller', users: '/usuarios' };

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
      onLogin(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.');
    } finally { setBusy(false); }
  };
  return (
    <main className="login-page">
      <section className="login-visual" aria-label="Carpintería y producción ordenada">
        <div className="login-brand"><img className="brand-logo brand-logo--login" src="/brand/carpinteria-360-logo-192.png" width={192} height={192} alt="Logo Carpintería Ordenada 360°" /><span>CARPINTERÍA<br /><b>ORDENADA 360°</b></span></div>
        <div className="login-story">
          <p className="eyebrow eyebrow--light">TALLER · PEDIDOS · PRODUCCIÓN</p>
          <h1>De la primera<br />medida al último<br /><em>acabado.</em></h1>
          <p>Todo el taller, trabajando en la misma dirección.</p>
        </div>
        <div className="woodcut" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div className="login-foot"><span>HECHO PARA EL TRABAJO BIEN HECHO</span><span>LOCAL · V1</span></div>
      </section>
      <section className="login-panel">
        <div className="login-panel__inner">
          <span className="login-kicker">Bienvenido al taller</span>
          <h2>Iniciar sesión</h2>
          <p>Ingresa con tu cuenta local para continuar.</p>
          <form onSubmit={submit} className="form-stack">
            <label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Contraseña<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /><button className="password-toggle" type="button" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button type="submit" className="button button--primary button--wide" disabled={busy}>{busy ? 'Verificando…' : 'Entrar al taller'} <span aria-hidden="true">↗</span></button>
          </form>
          <div className="login-note"><span className="status-dot status-dot--green" /> Sesión local protegida</div>
        </div>
        <footer className="login-panel__foot">Carpintería Ordenada 360° <span>·</span> Control de taller</footer>
      </section>
    </main>
  );
}

const todayDateFormatter = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const defaultPath = user.role === 'OPERARIO' ? '/produccion' : '/';
  const [pathname, setPathname] = useState(() => window.location.pathname === '/' && user.role === 'OPERARIO' ? defaultPath : window.location.pathname);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('month');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mobileDrawer = useMemo(() => ({
    isOpen: drawerOpen,
    setOpen: setDrawerOpen,
    open: () => setDrawerOpen(true),
    close: () => setDrawerOpen(false),
    toggle: () => setDrawerOpen((open) => !open),
  }), [drawerOpen]);
  const mainRef = useRef<HTMLElement>(null);
  const lastFocusedPath = useRef('');
  const route = useMemo(() => resolveRoute(pathname), [pathname]);
  const page = route.page;
  const allowedNav = useMemo(() => nav.filter((item) => item.roles.some((role) => role === user.role)), [user.role]);

  useEffect(() => {
    const changeRoute = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (!target || !target.startsWith('/')) return;
      setPathname(target.split('?')[0]);
      setError(''); mobileDrawer.close();
    };
    const restoreRoute = () => { setPathname(window.location.pathname); setError(''); mobileDrawer.close(); };
    window.addEventListener(APP_NAVIGATION_EVENT, changeRoute);
    window.addEventListener('popstate', restoreRoute);
    return () => { window.removeEventListener(APP_NAVIGATION_EVENT, changeRoute); window.removeEventListener('popstate', restoreRoute); };
  }, [mobileDrawer.close]);
  useEffect(() => {
    const canOpen = allowedNav.some((item) => item.id === page) || (['customers', 'products'].includes(page) && user.role !== 'OPERARIO');
    if (!canOpen) navigateTo(defaultPath);
  }, [allowedNav, defaultPath, page, user.role]);
  useEffect(() => {
    if (lastFocusedPath.current === pathname) return;
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (loading || lastFocusedPath.current === pathname) return;
    lastFocusedPath.current = pathname;
    const frame = requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector<HTMLElement>('.page-content h1');
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, loading]);

  const pageAllowed = allowedNav.some((item) => item.id === page) || (['customers', 'products'].includes(page) && user.role !== 'OPERARIO');
  const load = useCallback(async () => {
    // Una página fuera del rol se redirige; no se piden datos que el backend negará (403).
    if (!pageAllowed) return;
    setLoading(true); setError('');
    try {
      // Catálogo controlado de unidades (fuente única en el backend), una vez por sesión.
      if (!getUnitCatalog().length) setUnitCatalog(await api<UnitOption[]>('/inventory/units'));
      let next: Record<string, unknown> = {};
      if (page === 'dashboard') next = { summary: await api<DashboardSummary>(`/dashboard?period=${dashboardPeriod}`) };
      if (page === 'inventory') {
        const [items, pieces, movements, preview] = await Promise.all([
          api<InventoryItem[]>('/inventory'), api('/inventory/pieces'), api('/inventory/movements'), route.view === 'import' ? api('/inventory/import/preview').catch((reason) => ({ previewError: reason instanceof Error ? reason.message : 'No se pudo leer el Excel.' })) : Promise.resolve({}),
        ]);
        next = { items, pieces, movements, ...preview as object };
      }
      if (page === 'customers') {
        const [customers, orders] = await Promise.all([api<Customer[]>('/customers'), api<Order[]>('/orders')]);
        next = { customers, orders };
      }
      if (page === 'products') next = { products: await api<Product[]>('/products') };
      if (page === 'orders') {
        const [orders, customers, products, inventory, settings] = await Promise.all([
          api<Order[]>('/orders'), api<Customer[]>('/customers'), api<Product[]>('/products'), api<InventoryItem[]>('/inventory'), api<SettingValues>('/settings'),
        ]);
        next = { orders, customers, products, inventory, settings };
      }
      if (page === 'production') {
        // Disponibilidad agregada (una sola consulta) para los selectores; se recarga tras reservar, liberar o cortar.
        const [jobs, availability, pieces] = await Promise.all([api('/production'), api('/inventory/material-availability'), api('/inventory/pieces')]);
        next = { jobs, availability, pieces };
      }
      if (page === 'settings') next = { settings: await api<SettingValues>('/settings') };
      if (page === 'users') next = { users: await api('/users') };
      setData(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar esta sección.');
    } finally { setLoading(false); }
  }, [dashboardPeriod, page, pageAllowed, revision, route.view]);

  useEffect(() => { void load(); }, [load]);
  const run = async <T,>(action: () => Promise<T>, success: string) => {
    setBusy(true); setError('');
    try {
      const value = await action();
      Toast.toast.success(success, { timeout: 3600 }); setRevision((current) => current + 1);
      return value;
    } catch (reason) {
      Toast.toast.danger(reason instanceof Error ? reason.message : 'La acción no se pudo completar.', { timeout: 5200 });
      return undefined;
    } finally { setBusy(false); }
  };
  const items = data.items as InventoryItem[] | undefined;
  const orders = data.orders as Order[] | undefined;
  const customers = data.customers as Customer[] | undefined;
  const products = data.products as Product[] | undefined;
  const jobs = data.jobs as Array<{ id: string; order?: { code: string }; orderLine?: { name: string } }> | undefined;
  const guideContext: WorkshopGuideContext = page === 'customers' || page === 'products' ? 'orders'
    : page === 'dashboard' || page === 'inventory' || page === 'production' || page === 'orders' || page === 'settings' ? page : 'general';
  const guideFacts = useMemo<WorkshopGuideFacts>(() => {
    const facts: WorkshopGuideFacts = {};
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    if (page === 'dashboard') {
      const summary = data.summary as { activeOrders?: number; openIncidents?: number } | undefined;
      facts.activeOrders = number(summary?.activeOrders);
      facts.openIncidents = number(summary?.openIncidents);
    }
    if (page === 'inventory') {
      const loadedPieces = data.pieces as Array<{ kind?: string; state?: string }> | undefined;
      if (loadedPieces) {
        facts.availablePieces = loadedPieces.filter((piece) => piece.state === 'AVAILABLE').length;
        facts.pendingOffcuts = loadedPieces.filter((piece) => piece.kind === 'OFFCUT' && piece.state === 'PENDING_DISPOSITION').length;
      }
    }
    if (page === 'production') {
      const availability = data.availability as { items?: Array<{ type?: string; requiresDimensions?: boolean; availablePieces?: number }> } | undefined;
      const cuttingMaterials = availability?.items?.filter((item) => item.type === 'MATERIAL' && item.requiresDimensions);
      if (cuttingMaterials) {
        facts.materialsWithPieces = cuttingMaterials.filter((item) => (item.availablePieces ?? 0) > 0).length;
        facts.materialsWithoutPieces = cuttingMaterials.filter((item) => (item.availablePieces ?? 0) <= 0).length;
      }
      facts.productionJobs = Array.isArray(data.jobs) ? data.jobs.length : undefined;
    }
    if (page === 'orders') {
      facts.ordersWithBalance = orders?.filter((order) => order.totalCents > order.paidCents).length;
    }
    if (page === 'settings') {
      const settings = data.settings as SettingValues | undefined;
      facts.kerfMm = number(settings?.kerfMm);
    }
    return facts;
  }, [data, orders, page]);
  const sectionNames: Record<string, string> = { resumen: 'Resumen', pedidos: 'Pedidos', cobros: 'Cobros', clientes: 'Clientes', productos: 'Productos', articulos: 'Artículos', piezas: 'Piezas y retazos', movimientos: 'Movimientos', tablero: 'Tablero', ordenes: 'Órdenes', taller: 'Taller', cotizacion: 'Cotización', corte: 'Corte', seguimiento: 'Seguimiento', materiales: 'Materiales y piezas', plano: 'Plano de corte', bitacora: 'Bitácora', incidencias: 'Incidencias y fotos' };
  const breadcrumbs: Array<{ label: string; href?: string }> = [{ label: 'Taller', href: '/' }];
  const parentLabel: Partial<Record<AppPage, string>> = { dashboard: 'Resumen', orders: 'Pedidos', inventory: 'Inventario', production: 'Producción', settings: 'Configuración', users: 'Usuarios' };
  if (page === 'dashboard') breadcrumbs.push({ label: 'Resumen', href: '/' });
  if (page === 'orders') {
    breadcrumbs.push({ label: 'Pedidos / Ventas', href: '/pedidos' });
    if (route.view === 'create') breadcrumbs.push({ label: 'Nuevo pedido' });
    else if (route.view === 'payments') breadcrumbs.push({ label: 'Cobros', href: '/pedidos/cobros' });
    else if (route.view === 'detail') {
      const order = orders?.find((entry) => entry.id === route.id);
      breadcrumbs.push({ label: order?.code ?? 'Ficha de pedido', href: `/pedidos/${route.id}` });
      if (route.tab !== 'resumen') breadcrumbs.push({ label: sectionNames[route.tab ?? ''] ?? 'Resumen' });
    } else breadcrumbs.push({ label: 'Pedidos' });
  }
  if (page === 'customers' || page === 'products') {
    breadcrumbs.push({ label: 'Pedidos / Ventas', href: '/pedidos' });
    breadcrumbs.push({ label: page === 'customers' ? 'Clientes' : 'Productos', href: pagePaths[page] });
    if (route.view === 'create') breadcrumbs.push({ label: page === 'customers' ? 'Nuevo cliente' : 'Nuevo producto' });
    if (route.view === 'detail' || route.view === 'edit') {
      const record = page === 'customers' ? customers?.find((entry) => entry.id === route.id) : products?.find((entry) => entry.id === route.id);
      breadcrumbs.push({ label: record?.name ?? 'Ficha', href: `/${page === 'customers' ? 'clientes' : 'productos'}/${route.id}` });
      if (route.view === 'edit') breadcrumbs.push({ label: 'Editar' });
    }
  }
  if (page === 'inventory') {
    breadcrumbs.push({ label: 'Inventario', href: '/inventario' });
    if (route.view === 'pieces' || route.view === 'newPiece') breadcrumbs.push({ label: 'Piezas y retazos', href: '/inventario/piezas' });
    if (route.view === 'movements') breadcrumbs.push({ label: 'Movimientos', href: '/inventario/movimientos' });
    if (route.view === 'import') breadcrumbs.push({ label: 'Importar Excel' });
    if (route.id) {
      const item = items?.find((entry) => entry.id === route.id);
      breadcrumbs.push({ label: item?.name ?? 'Artículo', href: `/inventario/${route.id}` });
      if (route.view === 'edit') breadcrumbs.push({ label: 'Editar' });
      if (route.view === 'stock') breadcrumbs.push({ label: 'Ajustar stock' });
    }
    if (route.view === 'create') breadcrumbs.push({ label: 'Nuevo artículo' });
    if (route.view === 'newPiece') breadcrumbs.push({ label: 'Registrar pieza física' });
  }
  if (page === 'production') {
    breadcrumbs.push({ label: 'Producción', href: '/produccion' });
    if (route.view === 'orders') breadcrumbs.push({ label: 'Órdenes' });
    else if (route.view === 'detail') {
      const job = jobs?.find((entry) => entry.id === route.id);
      breadcrumbs.push({ label: job?.order?.code ?? `OP ${route.id?.slice(0, 8).toUpperCase()}`, href: `/produccion/${route.id}/materiales` });
      if (job?.orderLine?.name) breadcrumbs.push({ label: job.orderLine.name, href: `/produccion/${route.id}/materiales` });
      if (route.tab && route.tab !== 'materiales') breadcrumbs.push({ label: sectionNames[route.tab] ?? route.tab });
    } else breadcrumbs.push({ label: 'Tablero' });
  }
  if (page === 'settings') {
    breadcrumbs.push({ label: 'Configuración', href: '/configuracion/taller' });
    breadcrumbs.push({ label: sectionNames[route.section] ?? 'Taller' });
  }
  if (page === 'users') {
    breadcrumbs.push({ label: 'Usuarios', href: '/usuarios' });
    if (route.view === 'create') breadcrumbs.push({ label: 'Nuevo usuario' });
    if (route.view === 'edit') breadcrumbs.push({ label: 'Editar usuario' });
  }
  const activeNav = page === 'customers' || page === 'products' ? 'orders' : page;
  const title = breadcrumbs[breadcrumbs.length - 1]?.label ?? parentLabel[page] ?? 'Taller';
  const navLinks = allowedNav.map((item) => <AppLink key={item.id} href={pagePaths[item.id]} className={`side-link ${activeNav === item.id ? 'is-active' : ''}`} current={activeNav === item.id} onClick={() => mobileDrawer.close()}>
    <span className="side-link__icon"><Icon name={item.icon} size={20} /></span><span>{item.label}</span>{activeNav === item.id ? <span className="side-link__active" /> : null}
  </AppLink>);
  // Esqueleto con la forma de la pantalla que se está cargando; el dashboard tiene el suyo.
  const loadingView = page === 'dashboard' ? <Suspense fallback={<PageLoader label="Cargando resumen…" />}><DashboardSkeleton /></Suspense>
    : ['create', 'edit', 'stock', 'newPiece', 'settings'].includes(route.view) ? <div className="page-content"><FormSkeleton label={`Cargando ${title.toLowerCase()}`} /></div>
      : route.view === 'detail' ? <div className="page-content"><DetailSkeleton label={`Cargando ${title.toLowerCase()}`} /></div>
        : <div className="page-content"><TableSkeleton label={`Cargando ${title.toLowerCase()}`} /></div>;
  const contentKey = `${page}:${route.view}:${route.id ?? ''}`;

  return (
    <div className="workspace">
      <Toast.Provider placement="top end" />
      <Drawer.Root state={mobileDrawer}>
        <Drawer.Backdrop className="mobile-drawer__backdrop">
          <Drawer.Content placement="left" className="mobile-drawer__content">
            <Drawer.Dialog aria-label="Navegación principal" className="mobile-drawer__dialog">
              <aside className="sidebar sidebar--mobile" id="mobile-primary-navigation" aria-label="Navegación principal">
                <a className="app-brand" href="/" onClick={() => mobileDrawer.close()}>
                  <img className="brand-logo brand-logo--sidebar" src="/brand/carpinteria-360-logo-192.png" width={192} height={192} alt="" />
                  <span className="app-brand__text"><b>CARPINTERÍA</b><small>ORDENADA 360°</small></span>
                </a>
                <Drawer.CloseTrigger className="sidebar-close" aria-label="Cerrar menú"><Icon name="close" size={20} /></Drawer.CloseTrigger>
                <div className="sidebar-caption">ESPACIO DE TRABAJO</div>
                <nav className="side-nav" aria-label="Secciones del taller">{navLinks}</nav>
                <div className="sidebar-spacer" />
                <div className="sidebar-workshop"><span className="workshop-symbol"><Icon name="dashboard" size={16} /></span><div><b>Taller principal</b><small>Entorno local</small></div><span className="online-light" title="API conectada" /></div>
                <div className="sidebar-user"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="sidebar-user__info"><b>{user.name}</b><small>{user.role === 'OPERARIO' ? 'Operario' : user.role === 'TESTER' ? 'Tester' : 'Administrador'}</small></div><button type="button" className="icon-button logout-button" aria-label="Cerrar sesión" onClick={onLogout}><Icon name="logout" size={18} /></button></div>
              </aside>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer.Root>
      <aside className="sidebar" id="primary-navigation" aria-label="Navegación principal">
        <a className="app-brand" href="/">
          <img className="brand-logo brand-logo--sidebar" src="/brand/carpinteria-360-logo-192.png" width={192} height={192} alt="" />
          <span className="app-brand__text"><b>CARPINTERÍA</b><small>ORDENADA 360°</small></span>
        </a>
        <div className="sidebar-caption">ESPACIO DE TRABAJO</div>
        <nav className="side-nav" aria-label="Navegación principal">{navLinks}</nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-workshop"><span className="workshop-symbol"><Icon name="dashboard" size={16} /></span><div><b>Taller principal</b><small>Entorno local</small></div><span className="online-light" title="API conectada" /></div>
        <div className="sidebar-user"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="sidebar-user__info"><b>{user.name}</b><small>{user.role === 'OPERARIO' ? 'Operario' : user.role === 'TESTER' ? 'Tester' : 'Administrador'}</small></div><button type="button" className="icon-button logout-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout}><Icon name="logout" size={18} /></button></div>
      </aside>
      <main className="main-area" ref={mainRef}>
        <header className="topbar">
          <button type="button" className="menu-toggle" aria-controls="mobile-primary-navigation" aria-expanded={mobileDrawer.isOpen} aria-label={mobileDrawer.isOpen ? 'Cerrar menú' : 'Abrir menú'} onClick={mobileDrawer.open}><Icon name="menu" size={20} /></button>
          <nav className="breadcrumb" aria-label="Ruta de navegación">{breadcrumbs.map((crumb, index) => <span className="breadcrumb__item" key={`${crumb.label}-${index}`}>{index ? <b aria-hidden="true">/</b> : null}{crumb.href ? <AppLink href={crumb.href} current={index === breadcrumbs.length - 1}>{crumb.label}</AppLink> : <strong aria-current="page">{crumb.label}</strong>}</span>)}</nav>
          <div className="topbar__right"><span className="today-label">{todayDateFormatter.format(new Date())}</span><span className="topbar-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div>
        </header>
        {loading ? loadingView : error ? <div className="page-content"><ErrorState title={`No se pudo cargar ${title.toLowerCase()}.`} detail={error} onRetry={() => { void load(); }} /></div> : <Suspense fallback={loadingView}><div className="page-content page-enter" key={contentKey}>
          {page === 'dashboard' ? <DashboardScreen data={data.summary as DashboardSummary | undefined} period={dashboardPeriod} onPeriodChange={setDashboardPeriod} onNavigate={(destination) => navigateTo(pagePaths[destination])} /> : null}
          {page === 'inventory' ? <InventoryScreen data={data as never} busy={busy} run={run} canManage={user.role !== 'OPERARIO'} route={route} /> : null}
          {page === 'customers' ? <CustomersScreen customers={customers ?? []} orders={orders ?? []} busy={busy} run={run} route={route} /> : null}
          {page === 'products' ? <ProductsScreen products={products ?? []} busy={busy} run={run} route={route} /> : null}
          {page === 'orders' ? <OrdersScreen data={data as never} busy={busy} run={run} route={route} /> : null}
          {page === 'production' ? <ProductionScreen jobs={data.jobs as never[] ?? []} availability={data.availability as never ?? { lowStockThreshold: 5, items: [] }} pieces={data.pieces as never[] ?? []} canManage={user.role !== 'OPERARIO'} busy={busy} run={run} route={route} /> : null}
          {page === 'settings' ? <SettingsScreen settings={data.settings as SettingValues | undefined} busy={busy} run={run} route={route} /> : null}
          {page === 'users' ? <UsersScreen users={data.users as never[] ?? []} busy={busy} run={run} route={route} /> : null}
        </div></Suspense>}
        <footer className="app-footer"><span>CARPINTERÍA ORDENADA 360° <b>·</b> V1</span><span>Un taller. Un solo flujo.</span></footer>
      </main>
      {!loading && !error ? <WorkshopMascot context={guideContext} facts={guideFacts} /> : null}
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const trackingToken = pathname.match(/^\/seguimiento\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const changeRoute = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (!target || !target.startsWith('/')) return;
      if (target !== window.location.pathname) window.history.pushState({}, '', target);
      setPathname(target.split('?')[0]);
      if (/^\/seguimiento\//.test(target)) event.stopImmediatePropagation();
    };
    const restoreRoute = () => setPathname(window.location.pathname);
    window.addEventListener(APP_NAVIGATION_EVENT, changeRoute, true);
    window.addEventListener('popstate', restoreRoute);
    return () => { window.removeEventListener(APP_NAVIGATION_EVENT, changeRoute, true); window.removeEventListener('popstate', restoreRoute); };
  }, []);

  useEffect(() => {
    if (trackingToken) { setBooting(false); return; }
    api<User>('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setBooting(false));
  }, [trackingToken, revision]);

  if (trackingToken) return <Suspense fallback={<main className="splash"><PageLoader label="Cargando el seguimiento…" /></main>}><TrackingScreen token={trackingToken} /></Suspense>;
  if (booting) return <main className="splash"><img className="brand-logo brand-logo--splash" src="/brand/carpinteria-360-logo-192.png" width={192} height={192} alt="" /><PageLoader /></main>;
  if (!user) return <LoginScreen onLogin={(signedIn) => { setUser(signedIn); setRevision((current) => current + 1); }} />;
  return <Workspace user={user} onLogout={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); }} />;
}
