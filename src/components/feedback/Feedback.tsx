import { Skeleton } from '@heroui/react/skeleton';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { BrandLoaderGlyph, Illustration, SpinnerGlyph } from './Illustrations';

/** Spinner para operaciones cortas. Con `label`, se anuncia a lectores de pantalla. */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return label ? <span role="status" aria-live="polite" className="spinner-wrap"><SpinnerGlyph size={size} /><span className="sr-only">{label}</span></span> : <SpinnerGlyph size={size} />;
}

export function InlineLoader({ label }: { label: string }) {
  return <span className="inline-loader" role="status" aria-live="polite"><SpinnerGlyph size={16} />{label}</span>;
}

/** Contenido de botón con estado ocupado: spinner + texto, nunca solo animación. */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText: string; children: ReactNode }) {
  return busy ? <span className="busy-label"><SpinnerGlyph size={16} />{busyText}</span> : <>{children}</>;
}

/** Carga de pantalla completa sin estructura conocida (arranque de sesión). */
export function PageLoader({ label = 'Preparando el taller…' }: { label?: string }) {
  return <div className="page-loader" role="status" aria-live="polite"><BrandLoaderGlyph /><p>{label}</p></div>;
}

const Bar = ({ className = '' }: { className?: string }) => <Skeleton className={`sk ${className}`} animationType="shimmer" />;

function SkeletonHeading() {
  return <div className="sk-heading"><Bar className="sk--eyebrow" /><Bar className="sk--title" /><Bar className="sk--subtitle" /></div>;
}

/** Esqueleto de listado: encabezado, barra de filtros y filas de tabla. */
export function TableSkeleton({ label = 'Cargando', rows = 7, columns = 5 }: { label?: string; rows?: number; columns?: number }) {
  return <div className="sk-page" role="status" aria-live="polite" aria-label={label}>
    <SkeletonHeading />
    <div className="sk-toolbar"><Bar className="sk--search" /><Bar className="sk--chip" /></div>
    <div className="sk-table">
      {Array.from({ length: rows + 1 }, (_, row) => <div className={`sk-row${row === 0 ? ' sk-row--head' : ''}`} key={row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, column) => <Bar key={column} className={row === 0 ? 'sk--th' : column === 0 ? 'sk--strong' : 'sk--td'} />)}
      </div>)}
    </div>
  </div>;
}

/** Esqueleto de ficha (pedido, orden de producción): cabecera, avance, pestañas y dos bloques. */
export function DetailSkeleton({ label = 'Cargando ficha' }: { label?: string }) {
  return <div className="sk-page" role="status" aria-live="polite" aria-label={label}>
    <SkeletonHeading />
    <div className="sk-meta">{Array.from({ length: 4 }, (_, index) => <Bar key={index} className="sk--meta" />)}</div>
    <Bar className="sk--progress" />
    <div className="sk-tabs">{Array.from({ length: 4 }, (_, index) => <Bar key={index} className="sk--tab" />)}</div>
    <div className="sk-split"><div className="sk-block"><Bar className="sk--strong" /><Bar /><Bar /><Bar className="sk--short" /></div><div className="sk-block"><Bar className="sk--strong" /><Bar /><Bar className="sk--short" /></div></div>
  </div>;
}

/** Esqueleto de formulario amplio. */
export function FormSkeleton({ label = 'Cargando formulario' }: { label?: string }) {
  return <div className="sk-page" role="status" aria-live="polite" aria-label={label}>
    <SkeletonHeading />
    <div className="sk-form">{Array.from({ length: 8 }, (_, index) => <div key={index} className={index % 3 === 0 ? 'sk-field sk-field--wide' : 'sk-field'}><Bar className="sk--label" /><Bar className="sk--input" /></div>)}</div>
  </div>;
}

type EmptyVariant = 'empty' | 'no-results' | 'photos';
export function EmptyState({ variant = 'empty', title, detail, action, compact }: { variant?: EmptyVariant; title: string; detail?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`state state--empty${compact ? ' state--compact' : ''}`}>
    {variant === 'photos' ? <span className="state__icon"><Icon name="photo" size={24} /></span> : <Illustration name={variant === 'no-results' ? 'no-results' : 'empty'} />}
    <div className="state__text"><b>{title}</b>{detail ? <p>{detail}</p> : null}{action ? <div className="state__actions">{action}</div> : null}</div>
  </div>;
}

export function ErrorState({ title, detail, onRetry, compact }: { title: string; detail?: string; onRetry?: () => void; compact?: boolean }) {
  return <div className={`state state--error${compact ? ' state--compact' : ''}`} role="alert">
    <Illustration name="error" />
    <div className="state__text"><b>{title}</b>{detail ? <p>{detail}</p> : null}
      {onRetry ? <div className="state__actions"><button type="button" className="button button--quiet button--small icon-motion icon-motion--spin" onClick={onRetry}><Icon name="refresh" size={16} />Reintentar</button></div> : null}
    </div>
  </div>;
}

type WaitingVariant = 'cutting' | 'document' | 'upload' | 'import';
/** Espera de un proceso con nombre. Sin porcentajes: el backend no informa progreso. */
export function WaitingState({ variant, title, detail }: { variant: WaitingVariant; title: string; detail?: string }) {
  return <div className="state state--waiting" role="status" aria-live="polite">
    {variant === 'cutting' ? <Illustration name="cutting" /> : variant === 'document' ? <Illustration name="document" /> : <span className="state__icon"><SpinnerGlyph size={24} /></span>}
    <div className="state__text"><b>{title}</b>{detail ? <p>{detail}</p> : null}</div>
  </div>;
}

export function SuccessState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="state state--success" role="status" aria-live="polite">
    <Illustration name="success" />
    <div className="state__text"><b>{title}</b>{detail ? <p>{detail}</p> : null}{action ? <div className="state__actions">{action}</div> : null}</div>
  </div>;
}
