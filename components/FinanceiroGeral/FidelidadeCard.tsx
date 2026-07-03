import React from 'react';
import { Fidelidade } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import CardSkeleton from '../Dashboard/CardSkeleton';

interface FidelidadeCardProps {
  data: Fidelidade | null;
  loading?: boolean;
}

const FidelidadeCard: React.FC<FidelidadeCardProps> = ({ data, loading }) => {
  if (loading || !data) return <CardSkeleton height={280} />;

  const total = data.pacotesValor + data.avulsosValor;
  const pctPacotes = total > 0 ? Math.round((data.pacotesValor / total) * 100) : 0;
  const pctAvulsos = total > 0 ? 100 - pctPacotes : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-violet-50 rounded-2xl p-5">
          <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">Pacotes Recorrentes</p>
          <p className="text-lg font-black text-slate-800 mb-1">{formatCurrencyBR(data.pacotesValor)}</p>
          <p className="text-3xl font-black text-violet-600">{pctPacotes}%</p>
          <p className="text-[11px] font-bold text-violet-400 mt-1">{data.pacotesContratos} contratos</p>
        </div>
        <div className="bg-rose-50 rounded-2xl p-5">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Banhos Avulsos</p>
          <p className="text-lg font-black text-slate-800 mb-1">{formatCurrencyBR(data.avulsosValor)}</p>
          <p className="text-3xl font-black text-rose-500">{pctAvulsos}%</p>
          <p className="text-[11px] font-bold text-rose-400 mt-1">{data.avulsosAtendimentos} atendimentos</p>
        </div>
      </div>

      <div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
          {total > 0 ? (
            <>
              <div className="bg-violet-500" style={{ width: `${pctPacotes}%` }}></div>
              <div className="bg-rose-400" style={{ width: `${pctAvulsos}%` }}></div>
            </>
          ) : (
            <div className="bg-slate-200 w-full"></div>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] font-black uppercase tracking-widest">
          <span className="text-violet-600">Pacotes ({pctPacotes}%)</span>
          <span className="text-rose-500">Avulsos ({pctAvulsos}%)</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <span className="text-xs font-black text-slate-900 uppercase tracking-wide">Total Faturado no Período</span>
        <span className="text-lg font-black text-slate-900">{formatCurrencyBR(total)}</span>
      </div>
    </div>
  );
};

export default FidelidadeCard;
