
import React, { useState } from 'react';
import { FaturamentoPontoPeriodo } from '../../services/dashboardGerencial';
import { formatCurrencyBR } from '../../services/appointmentTotals';

interface RevenueLineChartProps {
  data: FaturamentoPontoPeriodo[];
}

/**
 * O bucket vem do banco como uma data de calendario (ex.: "2026-07-01"), mas
 * em alguns casos o PostgREST serializa como timestamp completo
 * (ex.: "2026-07-01T00:00:00+00:00"). Extrair so os 10 primeiros caracteres
 * (YYYY-MM-DD) evita tanto o rotulo quebrado quanto qualquer conversao de
 * timezone indevida (o bucket ja e uma data "de calendario", nao um instante).
 */
export const formatBucketLabel = (bucket: string) => {
  const match = String(bucket || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return bucket;
  const [, , mes, dia] = match;
  return `${dia}/${mes}`;
};

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const RevenueLineChart: React.FC<RevenueLineChartProps> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length || data.every((d) => d.valor === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-area text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem faturamento no período.</p>
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padX = 12;
  const padTop = 12;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;

  const max = niceMax(Math.max(...data.map((d) => d.valor), 1));
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, idx) => {
    const x = padX + stepX * idx;
    const y = padTop + chartH - (d.valor / max) * chartH;
    return { x, y, ...d };
  });
  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padTop + chartH} L ${points[0].x.toFixed(1)} ${padTop + chartH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - relX);
      if (dist < closestDist) { closestDist = dist; closest = idx; }
    });
    setHoverIdx(closest);
  };

  const hover = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative" style={{ minWidth: 480 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="dashRevenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
          </defs>

          {gridLines.map((g) => {
            const y = padTop + chartH - g * chartH;
            return (
              <g key={g}>
                <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 4" />
                <text x={0} y={y - 3} fontSize={10} fill="#94a3b8" fontWeight={700}>{Math.round(max * g)}</text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#dashRevenueGradient)" stroke="none" />
          <path d={linePath} fill="none" stroke="#7C3AED" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={hoverIdx === idx ? 5 : 3}
              fill="#fff"
              stroke="#7C3AED"
              strokeWidth={2.5}
            />
          ))}
          {hover && <line x1={hover.x} x2={hover.x} y1={padTop} y2={padTop + chartH} stroke="#7C3AED" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />}

          {points.map((p, idx) => (
            (idx === 0 || idx === points.length - 1 || idx % Math.ceil(points.length / 8 || 1) === 0) && (
              <text key={`lbl-${idx}`} x={p.x} y={height - 6} fontSize={10} fill="#94a3b8" textAnchor="middle" fontWeight={700}>
                {formatBucketLabel(p.bucket)}
              </text>
            )
          ))}
        </svg>

        {hover && (
          <div
            className="absolute bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-2.5 pointer-events-none text-xs whitespace-nowrap z-10"
            style={{
              left: `${(hover.x / width) * 100}%`,
              top: `${(hover.y / height) * 100}%`,
              transform: 'translate(-50%, -120%)'
            }}
          >
            <p className="font-black text-slate-800">{formatBucketLabel(hover.bucket)}</p>
            <p className="font-bold text-violet-600">Faturamento: {formatCurrencyBR(hover.valor)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueLineChart;
