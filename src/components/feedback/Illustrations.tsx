/**
 * Ilustraciones de estado — SVG originales de este proyecto (sin assets de terceros).
 * Colores por clase (.ill-*) → tokens de la marca en index.css; decorativas (aria-hidden): el texto acompaña siempre.
 */
export type IllustrationName = 'empty' | 'no-results' | 'error' | 'success' | 'cutting' | 'document';

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  const common = { viewBox: '0 0 120 90', className: `illustration illustration--${name}${className ? ` ${className}` : ''}`, 'aria-hidden': true, focusable: false } as const;
  switch (name) {
    case 'empty': // Caja de taller abierta con listones.
      return <svg {...common}>
        <path className="ill-shadow" d="M22 78h76" />
        <path className="ill-wood" d="M28 40h64v34H28z" />
        <path className="ill-line" d="M28 40l10-14h44l10 14M28 52h64" />
        <path className="ill-grain" d="M40 60h16M64 64h18M44 69h10" />
      </svg>;
    case 'no-results': // Tablero con retícula y lupa.
      return <svg {...common}>
        <path className="ill-shadow" d="M18 80h72" />
        <rect className="ill-board" x="18" y="18" width="62" height="54" rx="3" />
        <path className="ill-grain" d="M18 36h62M18 54h62M39 18v54M59 18v54" />
        <circle className="ill-forest ill-lens" cx="84" cy="54" r="13" />
        <path className="ill-forest" d="M93.5 63.5L104 74" />
      </svg>;
    case 'error': // Tablero con marca de advertencia y escuadra desalineada.
      return <svg {...common}>
        <path className="ill-shadow" d="M20 80h80" />
        <rect className="ill-board" x="20" y="22" width="64" height="50" rx="3" />
        <path className="ill-grain" d="M30 34h26M30 44h40M30 54h18" />
        <path className="ill-line ill-square" d="M74 14l22 8-10 28" />
        <path className="ill-clay-fill" d="M88 50l12 22H76z" />
        <path className="ill-clay-mark" d="M88 58v7M88 68.5v.5" />
      </svg>;
    case 'success': // Check que se dibuja una vez.
      return <svg {...common}>
        <circle className="ill-forest-soft" cx="60" cy="45" r="28" />
        <path className="ill-check" d="M47 46l9 9 18-20" />
      </svg>;
    case 'cutting': // Tablero con línea de corte recorriéndolo (espera real, no un resultado).
      return <svg {...common}>
        <rect className="ill-wood" x="16" y="20" width="88" height="50" rx="3" />
        <path className="ill-grain" d="M24 32h30M60 44h36M28 56h22" />
        <path className="ill-cutline" d="M16 45h88" />
        <circle className="ill-blade" cx="16" cy="45" r="5" />
      </svg>;
    case 'document': // Documento con líneas que se van generando.
      return <svg {...common}>
        <path className="ill-shadow" d="M36 82h48" />
        <path className="ill-paper" d="M38 12h32l14 14v50H38z" />
        <path className="ill-line" d="M70 12v14h14" />
        <path className="ill-doc-line ill-doc-line--1" d="M46 38h30" />
        <path className="ill-doc-line ill-doc-line--2" d="M46 48h30" />
        <path className="ill-doc-line ill-doc-line--3" d="M46 58h20" />
      </svg>;
  }
}

/** Indicador de actividad propio: pista crema + arco verde que gira. */
export function SpinnerGlyph({ size = 16 }: { size?: number }) {
  return <svg className="spinner-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle className="spinner-glyph__track" cx="12" cy="12" r="9" />
    <path className="spinner-glyph__arc" d="M21 12a9 9 0 0 0-9-9" />
  </svg>;
}

/** Cargador de marca: anillo con veta de madera y núcleo verde, discreto. */
export function BrandLoaderGlyph() {
  return <svg className="brand-loader" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle className="brand-loader__ring" cx="32" cy="32" r="24" />
    <path className="brand-loader__wood" d="M32 8a24 24 0 0 1 24 24" />
    <circle className="brand-loader__core" cx="32" cy="32" r="5" />
  </svg>;
}
