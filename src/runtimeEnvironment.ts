import { useEffect, useState } from 'react';

export type RuntimeHealth = {
  environment?: string;
  database?: { provider?: string };
  storage?: { driver?: string; status?: string };
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');
let pending: Promise<RuntimeHealth | null> | null = null;

// Una sola lectura de /api/health por carga de la app, compartida por la cabecera y las pantallas.
function loadRuntimeHealth() {
  pending ??= fetch(`${API_BASE}/health`, { credentials: 'same-origin' })
    .then((response) => response.json() as Promise<RuntimeHealth>)
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

export function useRuntimeHealth() {
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  useEffect(() => {
    let active = true;
    void loadRuntimeHealth().then((value) => { if (active) setHealth(value); });
    return () => { active = false; };
  }, []);
  return health;
}

export const isProductionRuntime = (health: RuntimeHealth | null) => health?.environment === 'PRODUCTION';
