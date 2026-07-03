
import React from 'react';
import { formatDecimalBR } from '../../services/appointmentTotals';

interface InsightsCardProps {
  loading?: boolean;
  variacaoFaturamento: number | null;
  topCategoriaLabel: string | null;
  topUnidadeNome: string | null;
}

const InsightsCard: React.FC<InsightsCardProps> = ({ loading, variacaoFaturamento, topCategoriaLabel, topUnidadeNome }) => {
  const temDados = !loading && variacaoFaturamento !== null;
  const subiu = (variacaoFaturamento ?? 0) >= 0;
  const variacaoCor = subiu ? 'text-emerald-400' : 'text-rose-400';
  const variacaoVerbo = subiu ? 'cresceu' : 'recuou';

  return (
    <div className="bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-950 rounded-[2rem] p-6 sm:p-8 shadow-xl flex flex-col justify-between min-h-[260px]">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-wand-magic-sparkles text-violet-200"></i>
          </div>
          <h3 className="text-xs font-black text-white uppercase tracking-widest">Insights do Consultor IA</h3>
        </div>

        {temDados ? (
          <p className="text-sm text-violet-100 leading-relaxed">
            O faturamento {variacaoVerbo}{' '}
            <span className={`font-black ${variacaoCor}`}>{subiu ? '+' : ''}{formatDecimalBR(variacaoFaturamento ?? 0)}%</span>{' '}
            em relação ao mesmo período anterior
            {topCategoriaLabel ? (
              <>, com grande adesão a <span className="font-black text-violet-300">{topCategoriaLabel}</span></>
            ) : null}
            .
          </p>
        ) : (
          <p className="text-sm text-violet-200/60 italic">Calculando insights com os dados do período selecionado…</p>
        )}

        <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-violet-300 uppercase tracking-widest mb-1.5">Desempenho geral da rede</p>
          <p className="text-xs text-violet-100/90 leading-relaxed">
            {temDados ? (
              <>
                {topUnidadeNome ? (
                  <>As operações ativas (<span className="font-bold text-white">{topUnidadeNome}</span>) lideram o faturamento do período. </>
                ) : null}
                Foco na expansão de pacotes de fidelidade e na recorrência de banho e tosa mantém a receita consistente.
              </>
            ) : 'Aguardando dados suficientes do período selecionado.'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
        <span className="text-[9px] font-black text-violet-300 uppercase tracking-widest">Inteligência Operacional</span>
        <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Ativado
        </span>
      </div>
    </div>
  );
};

export default InsightsCard;
