import { useEffect, useState } from 'react';

type Health = {
  environment?: string;
  database?: { provider?: string };
  storage?: { driver?: string; status?: string };
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');
const LABELS: Record<string, string> = { LOCAL: 'LOCAL', SUPABASE: 'SUPABASE QA' };

// Indicador discreto del entorno de datos para el personal (no se muestra en el seguimiento público).
// Evita probar en el entorno equivocado: LOCAL = PostgreSQL Docker, SUPABASE QA = Supabase remoto.
export function EnvironmentBadge() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/health`, { signal: controller.signal, credentials: 'same-origin' })
      .then((response) => response.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const environment = health?.environment;
  if (!environment) return null;
  const label = LABELS[environment] ?? environment;
  const detail = [health.database?.provider, health.storage?.driver && `fotos: ${health.storage.driver}`].filter(Boolean).join(' · ');
  return (
    <span className={`env-badge${environment === 'LOCAL' ? '' : ' env-badge--remote'}`} title={detail || undefined} aria-label={`Entorno de datos: ${label}${detail ? ` (${detail})` : ''}`}>
      {label}
    </span>
  );
}
