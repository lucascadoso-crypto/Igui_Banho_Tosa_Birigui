import React, { useState } from 'react';
import { formatCurrencyBR, formatDecimalBR } from '../../services/appointmentTotals';
import { GastoCategoriaValor } from '../../services/gastos';
import CardSkeleton from '../Dashboard/CardSkeleton';

interface GastosCategoriaDonutProps {
  data: GastoCategoriaValor[];
  loading?: boolean;
}

const GastosCategoriaDonut: React.FC<GastosCategoriaDonutProps> = ({ data, loading }) => {
  const [modo, setModo] = useState<'valor' | 'pct'>('valor');
  const total = data.reduce((sum, d) => sum + d.valor, 0);

  if (loading) return <CardSkeleton height={260} />;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-pie text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem gastos pagos no período.</p>
      </div>
    );
  }

  const radius = 68;
  const stroke = 30;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;
  const maxValor = Math.max(...data.map((d) => d.valor));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
          {(['valor', 'pct'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${modo === m ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
            >
              {m === 'valor' ? 'Valor (R$)' : '%'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 min-w-0 max-w-full">
        <div className="relative shrink-0 w-32 h-32 sm:w-[140px] sm:h-[140px] mx-auto sm:mx-0">
          <svg viewBox="0 0 180 180" className="w-full h-full">
            <g transform="translate(90,90) rotate(-90)">
              {data.filter((d) => d.valor > 0).map((d) => {
                const frac = d.valor / total;
                const dash = frac * circumference;
                const gap = circumference - dash;
                const offset = -acc * circumference;
                acc += frac;
                return (
                  <circle
                    key={d.categoriaId}
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
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total</p>
            <p className="text-[11px] sm:text-xs font-black text-slate-800 text-center leading-tight break-words">{formatCurrencyBR(total)}</p>
          </div>
        </div>

        <div className="flex-1 w-full min-w-0 space-y-3">
          {data.filter((d) => d.valor > 0).map((d) => {
            const pct = (d.valor / total) * 100;
            const barPct = maxValor > 0 ? (d.valor / maxValor) * 100 : 0;
            return (
              <div key={d.categoriaId} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                  <span className="flex items-center gap-2 font-bold text-slate-600 min-w-0">
                    <i className={`fa-solid ${d.icone} text-[10px]`} style={{ color: d.cor }}></i>
                    <span className="truncate">{d.categoriaNome}</span>
                  </span>
                  <span className="font-black text-slate-800 whitespace-nowrap shrink-0">
                    {modo === 'valor' ? formatCurrencyBR(d.valor) : `${formatDecimalBR(pct)}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: d.cor }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GastosCategoriaDonut;
