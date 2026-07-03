
import React from 'react';
import { FaturamentoUnidade } from '../../services/dashboardGerencial';
import { formatCurrencyBR } from '../../services/appointmentTotals';

interface UnitBarChartProps {
  data: FaturamentoUnidade[];
}

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const UnitBarChart: React.FC<UnitBarChartProps> = ({ data }) => {
  if (!data.length || data.every((d) => d.valor === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-column text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem faturamento no período.</p>
      </div>
    );
  }

  const width = 320;
  const height = 220;
  const padTop = 12;
  const padBottom = 34;
  const padSide = 36;
  const chartH = height - padTop - padBottom;
  const chartW = width - padSide;

  const max = niceMax(Math.max(...data.map((d) => d.valor), 1));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const barGap = 0.4;
  const barSlot = chartW / data.length;
  const barWidth = Math.min(48, barSlot * (1 - barGap));

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: Math.max(220, data.length * 70) }}>
          {gridLines.map((g) => {
            const y = padTop + chartH - g * chartH;
            return (
              <g key={g}>
                <line x1={padSide} x2={width} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 4" />
                <text x={0} y={y + 3} fontSize={10} fill="#94a3b8" fontWeight={700}>{Math.round(max * g)}</text>
              </g>
            );
          })}

          {data.map((d, idx) => {
            const barH = (d.valor / max) * chartH;
            const x = padSide + idx * barSlot + (barSlot - barWidth) / 2;
            const y = padTop + chartH - barH;
            return (
              <g key={d.unidadeId}>
                <rect x={x} y={y} width={barWidth} height={Math.max(barH, 2)} rx={8} fill="#7C3AED" />
                <text
                  x={x + barWidth / 2}
                  y={height - 8}
                  fontSize={9}
                  fill="#94a3b8"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {d.unidadeNome.replace(/^igui\s+/i, '').slice(0, 12).toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
        {data.map((d) => (
          <div key={d.unidadeId} className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-violet-600"></span>
            <span>{d.unidadeNome}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-700">{formatCurrencyBR(d.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UnitBarChart;
