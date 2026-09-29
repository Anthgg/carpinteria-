import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api';
import { DashboardScreen, InventoryScreen, CustomersScreen, ProductsScreen, OrdersScreen, SettingsScreen, UsersScreen } from './screens/GeneralScreens';
import { ProductionScreen } from './screens/ProductionScreen';
import { TrackingScreen } from './screens/TrackingScreen';

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
};
export type SettingValues = { taxRate: number; kerfMm: number; companyName: string; companyPhone: string };
export type AppPage = 'dashboard' | 'inventory' | 'customers' | 'products' | 'orders' | 'production' | 'settings' | 'users';

const nav = [
  { id: 'dashboard', label: 'Resumen', icon: '◫', roles: ['ADMIN', 'TESTER'] },
  { id: 'orders', label: 'Pedidos', icon: '▤', roles: ['ADMIN', 'TESTER'] },
  { id: 'production', label: 'Producción', icon: '⌁', roles: ['ADMIN', 'TESTER', 'OPERARIO'] },
  { id: 'inventory', label: 'Inventario', icon: '▦', roles: ['ADMIN', 'TESTER', 'OPERARIO'] },
  { id: 'customers', label: 'Clientes', icon: '♙', roles: ['ADMIN', 'TESTER'] },
  { id: 'products', label: 'Productos', icon: '▧', roles: ['ADMIN', 'TESTER'] },
  { id: 'settings', label: 'Configuración', icon: '⚙', roles: ['ADMIN', 'TESTER'] },
  { id: 'users', label: 'Usuarios', icon: '♧', roles: ['ADMIN', 'TESTER'] },
] satisfies Array<{ id: AppPage; label: string; icon: string; roles: Role[] }>;

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <div className="login-brand"><span className="brand-mark">C<span>°</span></span><span>CARPINTERÍA<br /><b>ORDENADA 360°</b></span></div>
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
            <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button--primary button--wide" disabled={busy}>{busy ? 'Verificando…' : 'Entrar al taller'} <span aria-hidden="true">↗</span></button>
          </form>
          <div className="login-note"><span className="status-dot status-dot--green" /> Sesión local protegida</div>
        </div>
        <footer className="login-panel__foot">Carpintería Ordenada 360° <span>·</span> Control de taller</footer>
      </section>
    </main>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [page, setPage] = useState<AppPage>(user.role === 'OPERARIO' ? 'production' : 'dashboard');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const allowedNav = useMemo(() => nav.filter((item) => item.roles.some((role) => role === user.role)), [user.role]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let next: Record<string, unknown> = {};
      if (page === 'dashboard') next = { summary: await api('/dashboard') };
      if (page === 'inventory') {
        const [items, pieces, movements, preview] = await Promise.all([
          api<InventoryItem[]>('/inventory'), api('/inventory/pieces'), api('/inventory/movements'), api('/inventory/import/preview').catch((reason) => ({ previewError: reason instanceof Error ? reason.message : 'No se pudo leer el Excel.' })),
        ]);
        next = { items, pieces, movements, ...preview as object };
      }
      if (page === 'customers') next = { customers: await api<Customer[]>('/customers') };
      if (page === 'products') next = { products: await api<Product[]>('/products') };
      if (page === 'orders') {
        const [orders, customers, products, inventory, settings] = await Promise.all([
          api<Order[]>('/orders'), api<Customer[]>('/customers'), api<Product[]>('/products'), api<InventoryItem[]>('/inventory'), api<SettingValues>('/settings'),
        ]);
        next = { orders, customers, products, inventory, settings };
      }
      if (page === 'production') {
        const [jobs, inventory, pieces] = await Promise.all([api('/production'), api<InventoryItem[]>('/inventory'), api('/inventory/pieces')]);
        next = { jobs, inventory, pieces };
      }
      if (page === 'settings') next = { settings: await api<SettingValues>('/settings') };
      if (page === 'users') next = { users: await api('/users') };
      setData(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar esta sección.');
    } finally { setLoading(false); }
  }, [page, revision]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const openJob = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) { setPendingJobId(id); setPage('production'); }
    };
    window.addEventListener('open-production', openJob);
    return () => window.removeEventListener('open-production', openJob);
  }, []);
  const run = async <T,>(action: () => Promise<T>, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await action();
      setNotice(success); setRevision((current) => current + 1);
      return value;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La acción no se pudo completar.');
      return undefined;
    } finally { setBusy(false); }
  };
  const title = allowedNav.find((item) => item.id === page)?.label ?? 'Taller';

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="app-brand" href="/" aria-label="Ir al resumen">
          <span className="app-brand__mark">C<span>°</span></span>
          <span className="app-brand__text"><b>CARPINTERÍA</b><small>ORDENADA 360°</small></span>
        </a>
        <div className="sidebar-caption">ESPACIO DE TRABAJO</div>
        <nav className="side-nav" aria-label="Navegación principal">
          {allowedNav.map((item) => <button key={item.id} className={`side-link ${page === item.id ? 'is-active' : ''}`} onClick={() => { setPage(item.id); setNotice(''); setError(''); }}><span className="side-link__icon">{item.icon}</span><span>{item.label}</span>{page === item.id ? <span className="side-link__active" /> : null}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-workshop"><span className="workshop-symbol">⌂</span><div><b>Taller principal</b><small>Entorno local</small></div><span className="online-light" title="API conectada" /></div>
        <div className="sidebar-user"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="sidebar-user__info"><b>{user.name}</b><small>{user.role === 'OPERARIO' ? 'Operario' : user.role === 'TESTER' ? 'Tester' : 'Administrador'}</small></div><button className="icon-button logout-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={onLogout}>↗</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>TALLER</span><b>/</b><strong>{title}</strong></div>
          <div className="topbar__right"><span className="today-label">{new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><span className="topbar-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div>
        </header>
        {notice ? <div className="toast toast--success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div> : null}
        {error ? <div className="toast toast--error" role="alert"><span>!</span>{error}<button onClick={() => setError('')} aria-label="Cerrar error">×</button></div> : null}
        {loading ? <div className="loading-state"><span className="spinner" />Cargando {title.toLowerCase()}…</div> : <div className="page-content">
          {page === 'dashboard' ? <DashboardScreen data={data.summary as never} onNavigate={setPage} /> : null}
          {page === 'inventory' ? <InventoryScreen data={data as never} busy={busy} run={run} canManage={user.role !== 'OPERARIO'} /> : null}
          {page === 'customers' ? <CustomersScreen customers={data.customers as Customer[] ?? []} busy={busy} run={run} /> : null}
          {page === 'products' ? <ProductsScreen products={data.products as Product[] ?? []} busy={busy} run={run} /> : null}
          {page === 'orders' ? <OrdersScreen data={data as never} busy={busy} run={run} /> : null}
          {page === 'production' ? <ProductionScreen jobs={data.jobs as never[] ?? []} inventory={data.inventory as InventoryItem[] ?? []} busy={busy} run={run} initialSelectedId={pendingJobId} /> : null}
          {page === 'settings' ? <SettingsScreen settings={data.settings as SettingValues | undefined} busy={busy} run={run} /> : null}
          {page === 'users' ? <UsersScreen users={data.users as never[] ?? []} busy={busy} run={run} /> : null}
        </div>}
        <footer className="app-footer"><span>CARPINTERÍA ORDENADA 360° <b>·</b> V1</span><span>Un taller. Un solo flujo.</span></footer>
      </main>
    </div>
  );
}

export default function App() {
  const trackingToken = window.location.pathname.match(/^\/seguimiento\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (trackingToken) { setBooting(false); return; }
    api<User>('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setBooting(false));
  }, [trackingToken, revision]);

  if (trackingToken) return <TrackingScreen token={trackingToken} />;
  if (booting) return <main className="splash"><span className="app-brand__mark">C<span>°</span></span><span className="spinner" /> Preparando el taller…</main>;
  if (!user) return <LoginScreen onLogin={(signedIn) => { setUser(signedIn); setRevision((current) => current + 1); }} />;
  return <Workspace user={user} onLogout={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); }} />;
}
