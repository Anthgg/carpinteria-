import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '');
const POLL_MS = 5000;

type Health = {
  status: string;
  service: string;
  environment: string;
  database: { connected: boolean; message: string };
  excel: { file: string; path: string; exists: boolean; readOnly: boolean };
  timestamp: string;
};

type Phase = 'checking' | 'online' | 'offline';

type RowState = 'ok' | 'fail' | 'wait';

type Row = {
  label: string;
  value: string;
  state: RowState;
  detail?: string;
};

function Dial({ states }: { states: RowState[] }) {
  const angles = [-90, 0, 90, 180];
  const color = (state: RowState) =>
    state === 'ok' ? 'var(--ok)' : state === 'fail' ? 'var(--fail)' : 'var(--muted)';

  return (
    <svg className="dial" viewBox="0 0 76 76" role="img" aria-hidden="true">
      <circle cx="38" cy="38" r="31" fill="none" stroke="var(--rule)" strokeWidth="1" />
      <circle
        cx="38"
        cy="38"
        r="26"
        fill="none"
        stroke="var(--rule)"
        strokeWidth="1"
        strokeDasharray="2 5"
      />
      {angles.map((angle, index) => (
        <line
          key={angle}
          x1="38"
          y1="4"
          x2="38"
          y2="12"
          stroke={color(states[index] ?? 'wait')}
          strokeWidth="3"
          transform={`rotate(${angle} 38 38)`}
        />
      ))}
      <text x="38" y="43" textAnchor="middle" className="dial__label">
        360°
      </text>
    </svg>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [health, setHealth] = useState<Health | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>('—');
  const timer = useRef<number | undefined>(undefined);

  const probe = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as Health;
      setHealth(data);
      setPhase('online');
      setCheckedAt(new Date().toLocaleTimeString('es-ES'));
    } catch {
      setHealth(null);
      setPhase('offline');
      setCheckedAt(new Date().toLocaleTimeString('es-ES'));
    }
  }, []);

  useEffect(() => {
    void probe();
    timer.current = window.setInterval(() => void probe(), POLL_MS);
    return () => window.clearInterval(timer.current);
  }, [probe]);

  const databaseOk = phase === 'online' && health?.database.connected === true;
  const excelOk = phase === 'online' && health?.excel.exists === true;

  const rows: Row[] = [
    { label: 'Frontend', value: 'Online', state: 'ok' },
    {
      label: 'Backend',
      value: phase === 'checking' ? 'Verificando…' : phase === 'online' ? 'Online' : 'Offline',
      state: phase === 'checking' ? 'wait' : phase === 'online' ? 'ok' : 'fail',
      detail: `${API_BASE}/health`,
    },
    {
      label: 'PostgreSQL',
      value:
        phase === 'checking'
          ? 'Verificando…'
          : databaseOk
            ? 'Connected'
            : 'Disconnected',
      state: phase === 'checking' ? 'wait' : databaseOk ? 'ok' : 'fail',
      detail: health?.database.message,
    },
    {
      label: 'Entorno',
      value: health?.environment ?? 'LOCAL',
      state: phase === 'offline' ? 'fail' : 'ok',
    },
    {
      label: 'Excel',
      value:
        phase === 'checking' ? 'Verificando…' : excelOk ? 'Found' : 'Missing',
      state: phase === 'checking' ? 'wait' : excelOk ? 'ok' : 'fail',
      detail: health?.excel.path,
    },
  ];

  const dialStates: RowState[] = [rows[0].state, rows[1].state, rows[2].state, rows[4].state];

  return (
    <main className="plate">
      <div className="plate__head">
        <p className="eyebrow">Foundation · base de datos y servicios</p>
        <Dial states={dialStates} />
      </div>

      <h1 className="title">
        Carpintería Ordenada <span className="title__deg">360°</span>
      </h1>

      <ul className="checks" aria-live="polite">
        {rows.map((row) => (
          <li className="check" key={row.label}>
            <span className={`dot dot--${row.state}`} aria-hidden="true" />
            <span className="check__label">{row.label}:</span>
            <span className="check__value">{row.value}</span>
            {row.detail ? <span className="check__detail">{row.detail}</span> : null}
          </li>
        ))}
      </ul>

      {phase === 'offline' ? (
        <div className="alert">
          <p>No responde {API_BASE}/health. Levanta el stack con Docker.</p>
          <button type="button" onClick={() => void probe()}>
            Reintentar
          </button>
        </div>
      ) : null}

      <footer className="plate__foot">
        <span>Última comprobación {checkedAt}</span>
        <span>refresco {POLL_MS / 1000}s · GET {API_BASE}/health</span>
      </footer>
    </main>
  );
}
