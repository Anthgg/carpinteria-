const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

async function rawRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  return response;
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
    throw new Error(message || `La solicitud falló (${response.status}).`);
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
  if (!response.ok) throw new Error(`No se pudo descargar el PDF (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const formatPEN = (cents: number | string | null | undefined) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 })
    .format(Number(cents ?? 0) / 100);

export const toMillimeters = (value: string, unit: 'mm' | 'cm' | 'm') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1));
};

export const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';
