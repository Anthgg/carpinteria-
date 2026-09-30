import uPlot from 'uplot';
import { useEffect, useRef, useState } from 'react';
import 'uplot/dist/uPlot.min.css';
import { formatPEN } from '../api';

export type OrdersTrendPoint = { date: string; orderCount: number; totalCents: number };
type HoveredPoint = { index: number; x: number; y: number };

function chartDate(dateKey: string, includeYear = false) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', ...(includeYear ? { year: '2-digit' } : {}), timeZone: 'America/Lima',
  }).format(new Date(`${dateKey}T12:00:00-05:00`));
}

function toTimestamp(dateKey: string) {
  return Math.floor(new Date(`${dateKey}T12:00:00-05:00`).getTime() / 1000);
}

function axisDate(timestamp: number) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' })
    .format(new Date(timestamp * 1000));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function OrdersTrendChart({ points }: { points: OrdersTrendPoint[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoveredPoint | null>(null);
  const hasData = points.some((point) => point.orderCount > 0 || point.totalCents > 0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasData) return;

    let plot: uPlot | undefined;
    const data: uPlot.AlignedData = [
      points.map((point) => toTimestamp(point.date)),
      points.map((point) => point.totalCents / 100),
      points.map((point) => point.orderCount),
    ];
    setHover(null);

    const options = (width: number, height: number): uPlot.Options => ({
      width,
      height,
      class: 'orders-trend-plot',
      scales: {
        x: { time: false },
        sales: { auto: true },
        orders: { auto: true, range: (_plot, min, max) => [Math.min(0, min), Math.max(1, max)] },
      },
      axes: [
        {
          scale: 'x', stroke: '#817d72', grid: { show: false }, ticks: { stroke: '#e7e1d6' },
          values: (_plot, values) => values.map((value) => value === null ? '' : axisDate(Number(value))),
          space: 54,
        },
        {
          scale: 'sales', side: 3, size: 62, stroke: '#817d72', grid: { stroke: '#e9e5da', dash: [3, 5] },
          values: (_plot, values) => values.map((value) => value === null ? '' : `S/ ${Math.round(Number(value))}`),
          space: 58,
        },
        {
          scale: 'orders', side: 1, size: 34, stroke: '#817d72', grid: { show: false },
          values: (_plot, values) => values.map((value) => value === null ? '' : String(Math.round(Number(value)))),
          space: 28,
        },
      ],
      series: [
        { value: (_plot, timestamp) => axisDate(timestamp) },
        { label: 'Ventas', scale: 'sales', stroke: '#244c37', fill: 'rgba(79, 116, 83, 0.14)', width: 2.5, points: { show: true, size: 5, fill: '#244c37', width: 1 } },
        { label: 'Pedidos', scale: 'orders', stroke: '#a47d3d', width: 2, points: { show: true, size: 5, fill: '#a47d3d', width: 1 } },
      ],
      cursor: { x: true, y: false, points: { size: 7 } },
      legend: { show: false },
    });

    const onPointerMove = (event: MouseEvent) => {
      if (!plot || plot.cursor.idx == null) return;
      const rect = host.getBoundingClientRect();
      const width = 178;
      setHover({
        index: plot.cursor.idx,
        x: clamp(event.clientX - rect.left + 12, 8, Math.max(8, rect.width - width - 8)),
        y: clamp(event.clientY - rect.top + 12, 8, Math.max(8, rect.height - 78)),
      });
    };
    const clearHover = () => setHover(null);
    host.addEventListener('mousemove', onPointerMove);
    host.addEventListener('mouseleave', clearHover);

    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? host.clientWidth);
      const height = Math.floor(entries[0]?.contentRect.height ?? host.clientHeight);
      if (width < 240 || height < 140) return;
      if (!plot) plot = new uPlot(options(width, height), data, host);
      else plot.setSize({ width, height });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      host.removeEventListener('mousemove', onPointerMove);
      host.removeEventListener('mouseleave', clearHover);
      plot?.destroy();
    };
  }, [hasData, points]);

  const point = hover ? points[hover.index] : undefined;

  return (
    <div className="orders-trend-chart-wrap">
      {hasData ? (
        <div ref={hostRef} className="orders-trend-chart" role="img" aria-label="Gráfico de ventas y cantidad de pedidos por día">
          {point && hover ? (
            <div className="trend-tooltip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
              <b>{chartDate(point.date, true)}</b>
              <span>Ventas <strong>{formatPEN(point.totalCents)}</strong></span>
              <span>Pedidos <strong>{point.orderCount}</strong></span>
            </div>
          ) : null}
        </div>
      ) : <p className="trend-empty">No hay ventas registradas en este periodo.</p>}
      <table className="visually-hidden">
        <caption>Ventas y pedidos diarios del periodo seleccionado</caption>
        <thead><tr><th>Fecha</th><th>Ventas</th><th>Pedidos</th></tr></thead>
        <tbody>{points.map((entry) => (
          <tr key={entry.date}><th>{chartDate(entry.date, true)}</th><td>{formatPEN(entry.totalCents)}</td><td>{entry.orderCount}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
