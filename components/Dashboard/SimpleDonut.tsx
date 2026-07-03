import React from 'react';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import CardSkeleton from './CardSkeleton';

export interface SimpleDonutDatum {
  label: string;
  valor: number;
  cor: string;
}

interface SimpleDonutProps {
  data: SimpleDonutDatum[];
  loading?: boolean;
  centerLabel?: string;
  emptyLabel?: string;
}

export const SimpleDonut: React.FC<SimpleDonutProps> = ({ data, loading, centerLabel = 'Total', emptyLabel = 'Sem dados no período.' }) => {
  const total = data.reduce((sum, d) => sum + d.valor, 0);

  if (loading) return <CardSkeleton height={260} />;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-pie text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">{emptyLabel}</p>
      </div>
    );
  }

  const radius = 68;
  const stroke = 30;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 min-w-0 max-w-full">
      <div className="relative shrink-0 w-32 h-32 sm:w-[140px] sm:h-[140px] mx-auto sm:mx-0">
        <svg viewBox="0 0 180 180" className="w-full h-full">
          <g transform="translate(90,90) rotate(-90)">
            {data.filter(d => d.valor > 0).map((d, idx) => {
              const frac = d.valor / total;
              const dash = frac * circumference;
              const gap = circumference - dash;
              const offset = -acc * circumference;
              acc += frac;
              return (
                <circle
                  key={idx}
                  r={radius}
                  fill="none"
                  stroke={d.cor}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{centerLabel}</p>
          <p className="text-[11px] sm:text-xs font-black text-slate-800 text-center leading-tight break-words">{formatCurrencyBR(total)}</p>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 space-y-2.5">
        {data.filter(d => d.valor > 0).map((d, idx) => (
          <div key={idx} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs min-w-0">
            <span className="flex items-center gap-2 font-bold text-slate-600 min-w-0 max-w-full">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.cor }}></span>
              <span className="break-words">{d.label}</span>
            </span>
            <span className="font-black text-slate-800 whitespace-nowrap">
              {formatCurrencyBR(d.valor)} <span className="text-slate-400 font-bold">({Math.round((d.valor / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimpleDonut;
