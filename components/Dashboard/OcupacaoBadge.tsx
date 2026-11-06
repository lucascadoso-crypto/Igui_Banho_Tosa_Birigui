
import React from 'react';

export type FaixaOcupacao = 'ocioso' | 'normal' | 'lotado';

interface OcupacaoBadgeProps {
  capacidade: number;
  agendados: number;
  loading?: boolean;
}

const FAIXA_LABEL: Record<FaixaOcupacao, string> = {
  ocioso: 'Ocioso',
  normal: 'Normal',
  lotado: 'Lotado'
};

const FAIXA_COR: Record<FaixaOcupacao, string> = {
  ocioso: 'bg-sky-50 text-sky-600 ring-sky-100',
  normal: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  lotado: 'bg-rose-50 text-rose-600 ring-rose-100'
};

const calcularFaixa = (percentual: number): FaixaOcupacao => {
  if (percentual > 85) return 'lotado';
  if (percentual >= 50) return 'normal';
  return 'ocioso';
};

/** Indicador "Cap · Disp · Ocup · %" — somente leitura, reutilizado no Dashboard e na Agenda. */
const OcupacaoBadge: React.FC<OcupacaoBadgeProps> = ({ capacidade, agendados, loading }) => {
  if (loading) {
    return <div className="h-9 w-48 bg-slate-100 rounded-xl animate-pulse"></div>;
  }

  if (capacidade <= 0) {
    return (
      <div className="px-3 py-2 rounded-xl bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest ring-1 ring-slate-100">
        Capacidade não configurada
      </div>
    );
  }

  const disponivel = Math.max(0, capacidade - agendados);
  const percentual = Math.round((agendados / capacidade) * 1000) / 10;
  const faixa = calcularFaixa(percentual);

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ring-1 text-[10px] font-black uppercase tracking-widest ${FAIXA_COR[faixa]}`}>
      <span>Cap. {capacidade}</span>
      <span className="opacity-40">·</span>
      <span>Disp. {disponivel}</span>
      <span className="opacity-40">·</span>
      <span>Ocup. {agendados}</span>
      <span className="opacity-40">·</span>
      <span>{percentual}% {FAIXA_LABEL[faixa]}</span>
    </div>
  );
};

export default OcupacaoBadge;
