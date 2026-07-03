import React, { useState } from 'react';
import { FluxoDiarioPonto } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { formatBucketLabel } from '../Dashboard/RevenueLineChart';

interface CashFlowLineChartProps {
  data: FluxoDiarioPonto[];
}

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const SERIES = [
  { key: 'receita' as const, label: 'Receita', color: '#7C3AED' },
  { key: 'custo' as const, label: 'Custos', color: '#F43F5E' },
  { key: 'lucro' as const, label: 'Lucro', color: '#10B981' }
];

const CashFlowLineChart: React.FC<CashFlowLineChartProps> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const temDados = data.length > 0 && data.some((d) => d.receita !== 0 || d.custo !== 0 || d.lucro !== 0);
  if (!temDados) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-area text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem movimentação no período.</p>
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padX = 12;
  const padTop = 12;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;

  const allValues = data.flatMap((d) => [d.receita, d.custo, d.lucro]);
  const maxValue = niceMax(Math.max(...allValues, 1));
  const minLucro = Math.min(...data.map((d) => d.lucro), 0);
  const minValue = Math.min(0, minLucro);
  const range = maxValue - minValue || 1;

  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const scaleY = (value: number) => padTop + chartH - ((value - minValue) / range) * chartH;

  const seriesPoints = SERIES.map((s) => ({
    ...s,
    points: data.map((d, idx) => ({ x: padX + stepX * idx, y: scaleY(d[s.key]), ...d }))
  }));

  const zeroY = scaleY(0);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let closestDist = Infinity;
    data.forEach((_, idx) => {
      const x = padX + stepX * idx;
      const dist = Math.abs(x - relX);
      if (dist < closestDist) { closestDist = dist; closest = idx; }
    });
    setHoverIdx(closest);
  };

  const hoverPonto = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? padX + stepX * hoverIdx : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-4 mb-3">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }}></span>
            {s.label}
          </span>
        ))}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {gridLines.map((g) => {
            const y = padTop + chartH - g * chartH;
            const value = minValue + g * range;
            return (
              <g key={g}>
                <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 4" />
                <text x={0} y={y - 3} fontSize={10} fill="#94a3b8" fontWeight={700}>{Math.round(value)}</text>
              </g>
            );
          })}

          {minValue < 0 && (
            <line x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} stroke="#cbd5e1" strokeWidth={1.5} />
          )}

          {seriesPoints.map((s) => {
            const linePath = s.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            return <path key={s.key} d={linePath} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />;
          })}

          {seriesPoints.map((s) => (
            s.points.map((p, idx) => (
              <circle
                key={`${s.key}-${idx}`}
                cx={p.x}
                cy={p.y}
                r={hoverIdx === idx ? 4 : 2.25}
                fill="#fff"
                stroke={s.color}
                strokeWidth={2}
              />
            ))
          ))}

          {hoverPonto && (
            <line x1={hoverX} x2={hoverX} y1={padTop} y2={padTop + chartH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          )}

          {data.map((d, idx) => (
            (idx === 0 || idx === data.length - 1 || idx % Math.ceil(data.length / 8 || 1) === 0) && (
              <text key={`lbl-${idx}`} x={padX + stepX * idx} y={height - 6} fontSize={10} fill="#94a3b8" textAnchor="middle" fontWeight={700}>
                {formatBucketLabel(d.bucket)}
              </text>
            )
          ))}
        </svg>

        {hoverPonto && (
          <div
            className="absolute bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-2.5 pointer-events-none text-xs whitespace-nowrap z-10"
            style={{
              left: `${(hoverX / width) * 100}%`,
              top: `${(scaleY(hoverPonto.receita) / height) * 100}%`,
              transform: 'translate(-50%, -130%)'
            }}
          >
            <p className="font-black text-slate-800">{formatBucketLabel(hoverPonto.bucket)}</p>
            <p className="font-bold" style={{ color: '#7C3AED' }}>Receita: {formatCurrencyBR(hoverPonto.receita)}</p>
            <p className="font-bold" style={{ color: '#F43F5E' }}>Custos: {formatCurrencyBR(hoverPonto.custo)}</p>
            <p className="font-bold" style={{ color: '#10B981' }}>Lucro: {formatCurrencyBR(hoverPonto.lucro)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashFlowLineChart;
