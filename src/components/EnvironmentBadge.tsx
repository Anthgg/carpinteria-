import { useRuntimeHealth } from '../runtimeEnvironment';

const LABELS: Record<string, string> = { LOCAL: 'LOCAL', SUPABASE: 'SUPABASE QA', PRODUCTION: 'PRODUCCIÓN' };
const VARIANTS: Record<string, string> = { SUPABASE: ' env-badge--remote', PRODUCTION: ' env-badge--production' };

// Indicador discreto del entorno de datos para el personal (no se muestra en el seguimiento público).
// Evita probar en el entorno equivocado: LOCAL = PostgreSQL Docker, SUPABASE QA = Supabase desde la
// máquina local, PRODUCCIÓN = Cloud Run.
export function EnvironmentBadge() {
  const health = useRuntimeHealth();
  const environment = health?.environment;
  if (!environment) return null;
  const label = LABELS[environment] ?? environment;
  const detail = [health.database?.provider, health.storage?.driver && `fotos: ${health.storage.driver}`].filter(Boolean).join(' · ');
  return (
    <span className={`env-badge${VARIANTS[environment] ?? ''}`} title={detail || undefined} aria-label={`Entorno de datos: ${label}${detail ? ` (${detail})` : ''}`}>
      {label}
    </span>
  );
}
