const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

export type DashboardPeriod = '7d' | '30d' | 'month';
export type DashboardSummary = {
  activeOrders: number;
  readyOrders: number;
  openIncidents: number;
  productionByStage: Array<{ stage: string; count: number }>;
  lowStock: Array<{ id: string; name: string; type: string; unit: string; stock: number; availablePieces: number }>;
  recentMovements: Array<{ id: string; action: string; itemName: string; note?: string | null; createdAt: string }>;
  period: { startsAt: string; orders: number; orderTotalCents: number };
  ordersTrend: { period: DashboardPeriod; startsAt: string; endsAt: string; points: Array<{ date: string; orderCount: number; totalCents: number }> };
};

const NETWORK_ERROR = 'No se pudo conectar con el servidor del taller. Revisa la conexión e inténtalo de nuevo.';
const SERVER_ERROR = 'El servidor no pudo completar la solicitud. Inténtalo de nuevo en unos segundos.';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function rawRequest(path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    // "Failed to fetch" no le dice nada al operario.
    throw new Error(NETWORK_ERROR);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let response = await rawRequest(path, init);
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await rawRequest('/auth/refresh', { method: 'POST' });
    if (refreshed.ok) response = await rawRequest(path, init);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message.join(' ') : body?.message;
    // Los 5xx llegan con textos técnicos ("Internal server error"); los 4xx traen el mensaje de negocio en español.
    if (response.status >= 500) throw new ApiError(SERVER_ERROR, response.status);
    throw new ApiError(message || `La solicitud no se pudo completar (${response.status}).`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function download(path: string, filename: string) {
  let response = await rawRequest(path);
  if (response.status === 401) {
    const refreshed = await rawRequest('/auth/refresh', { method: 'POST' });
    if (refreshed.ok) response = await rawRequest(path);
  }
  if (!response.ok) throw new Error(response.status >= 500 ? 'No se pudo generar la ficha PDF. Inténtalo de nuevo en unos segundos.' : 'No tienes acceso a esta ficha PDF o ya no existe.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const penCurrencyFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 });
export const formatPEN = (cents: number | string | null | undefined) =>
  penCurrencyFormatter.format(Number(cents ?? 0) / 100);

export const toMillimeters = (value: string, unit: 'mm' | 'cm' | 'm') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1));
};

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
export const dateTime = (value?: string | null) => value
  ? dateTimeFormatter.format(new Date(value))
  : '—';
