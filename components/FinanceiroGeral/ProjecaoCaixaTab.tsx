import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { FluxoDiarioPonto, fetchProjecaoCaixa } from '../../services/financeiroGeral';
import SectionTitle from '../Dashboard/SectionTitle';
import CardSkeleton from '../Dashboard/CardSkeleton';
import CashFlowLineChart from './CashFlowLineChart';

interface ProjecaoCaixaTabProps {
  unidadeId: number | null;
  supabaseClient: any;
}

const ProjecaoCaixaTab: React.FC<ProjecaoCaixaTabProps> = ({ unidadeId, supabaseClient }) => {
  const [pontos, setPontos] = useState<FluxoDiarioPonto[]>([]);
  const [saldoAtual, setSaldoAtual] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetchProjecaoCaixa(supabaseClient, unidadeId, 30)
      .then((resultado) => { setPontos(resultado.pontos); setSaldoAtual(resultado.saldoAtual); })
      .catch((err) => { console.error('Erro ao carregar projeção de caixa:', err); setErro(err?.message || 'Falha ao carregar.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const saldoFinal = pontos.length > 0 ? pontos[pontos.length - 1].lucro : saldoAtual;

  return (
    <div className="space-y-6">
      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo atual (mês até hoje)</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatCurrencyBR(saldoAtual)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo projetado em 30 dias</p>
          <p className={`text-2xl font-black ${saldoFinal < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{loading ? '...' : formatCurrencyBR(saldoFinal)}</p>
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <SectionTitle
          title="Projeção de caixa — próximos 30 dias"
          subtitle="Saldo atual + recebíveis previstos (agendamentos e pacotes pendentes) − contas a pagar previstas"
        />
        <div className="mt-4">
          {loading ? <CardSkeleton height={260} /> : <CashFlowLineChart data={pontos} />}
        </div>
        <p className="text-[11px] font-bold text-slate-400 mt-4">
          Legenda do gráfico: "Receita" = recebíveis previstos do dia, "Custos" = contas a pagar previstas do dia, "Lucro" = saldo de caixa projetado acumulado.
          Pendências já vencidas entram no dia de hoje, já que podem ser recebidas/pagas em qualquer momento a partir de agora.
        </p>
      </div>
    </div>
  );
};

export default ProjecaoCaixaTab;
