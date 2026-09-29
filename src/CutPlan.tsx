type Leftover = { xMm: number; yMm: number; lengthMm: number; widthMm: number; thicknessMm: number };
type Placement = { requirementId: string; label: string; xMm: number; yMm: number; lengthMm: number; widthMm: number; rotated: boolean };
export type PlanBoard = {
  id: string; code: string; materialName: string; lengthMm: number; widthMm: number; thicknessMm: number;
  placements: Placement[]; leftovers: Leftover[]; utilizationPercent: number; cutsEstimated: number;
};

const colors = ['#d58b58', '#7ca08a', '#dfc36f', '#8b91a8', '#c98683', '#70a6aa'];

export function CutPlan({ board }: { board: PlanBoard }) {
  return (
    <article className="cut-board">
      <div className="cut-board__heading">
        <div><strong>{board.code}</strong><span>{board.materialName}</span></div>
        <span className="cut-board__util">{board.utilizationPercent}% aprovechado</span>
      </div>
      <svg className="cut-board__svg" viewBox={`0 0 ${board.widthMm} ${board.lengthMm}`} role="img" aria-label={`Plano de corte ${board.code}, ${board.widthMm} por ${board.lengthMm} milímetros`}>
        <rect x="0" y="0" width={board.widthMm} height={board.lengthMm} rx="4" fill="#f3e8d6" stroke="#75593f" strokeWidth="8" />
        {board.leftovers.map((piece, index) => (
          <g key={`left-${index}`}>
            <rect x={piece.xMm} y={piece.yMm} width={piece.widthMm} height={piece.lengthMm} fill="#e8e6dc" stroke="#9a9c8f" strokeWidth="4" strokeDasharray="12 8" />
            {piece.widthMm > 130 && piece.lengthMm > 90 ? <text x={piece.xMm + piece.widthMm / 2} y={piece.yMm + piece.lengthMm / 2} textAnchor="middle" className="cut-board__scrap">Sobrante</text> : null}
          </g>
        ))}
        {board.placements.map((piece, index) => (
          <g key={piece.requirementId}>
            <rect x={piece.xMm} y={piece.yMm} width={piece.widthMm} height={piece.lengthMm} fill={colors[index % colors.length]} fillOpacity="0.8" stroke="#fffaf3" strokeWidth="5" />
            {piece.widthMm > 100 && piece.lengthMm > 80 ? (
              <text x={piece.xMm + piece.widthMm / 2} y={piece.yMm + piece.lengthMm / 2} textAnchor="middle" className="cut-board__label">
                <tspan x={piece.xMm + piece.widthMm / 2} dy="-0.35em">{piece.label}</tspan>
                <tspan x={piece.xMm + piece.widthMm / 2} dy="1.4em">{piece.widthMm} × {piece.lengthMm} mm</tspan>
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="cut-board__footer"><span>{board.widthMm} × {board.lengthMm} × {board.thicknessMm} mm</span><span>{board.cutsEstimated} cortes estimados</span></div>
      {board.leftovers.length ? <p className="cut-board__scraps">Sobrantes estimados: {board.leftovers.map((piece) => `${piece.widthMm} × ${piece.lengthMm} mm`).join(' · ')}</p> : <p className="cut-board__scraps">Sin sobrantes aprovechables en este plano.</p>}
    </article>
  );
}
