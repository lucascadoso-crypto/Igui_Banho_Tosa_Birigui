import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { getTodayBR } from '../../services/dashboardGerencial';
import { ContaAPagarItem, fetchContasAPagarCalendario } from '../../services/financeiroGeral';
import SectionTitle from '../Dashboard/SectionTitle';
import CardSkeleton from '../Dashboard/CardSkeleton';
import PagarDespesaModal from '../Gastos/PagarDespesaModal';

interface ContasPagarTabProps {
  unidadeId: number | null;
  supabaseClient: any;
}

const formatDateBR = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

/** Chave de semana ISO (segunda-feira da semana do vencimento), só para agrupar o total semanal. */
const chaveSemana = (dataStr: string) => {
  const d = new Date(`${dataStr}T12:00:00`);
  const diaSemana = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - diaSemana);
  return d.toISOString().slice(0, 10);
};

const ContasPagarTab: React.FC<ContasPagarTabProps> = ({ unidadeId, supabaseClient }) => {
  const [itens, setItens] = useState<ContaAPagarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pagando, setPagando] = useState<{ id: number; descricao: string; valor: number } | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetchContasAPagarCalendario(supabaseClient, unidadeId, 30)
      .then(setItens)
      .catch((err) => { console.error('Erro ao carregar contas a pagar:', err); setErro(err?.message || 'Falha ao carregar.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const totais = useMemo(() => {
    const totalGeral = itens.reduce((acc, i) => acc + i.valor, 0);
    const totalVencidas = itens.filter((i) => i.vencida).reduce((acc, i) => acc + i.valor, 0);
    return { totalGeral, totalVencidas };
  }, [itens]);

  const porSemana = useMemo(() => {
    const mapa = new Map<string, number>();
    itens.forEach((i) => {
      const chave = chaveSemana(i.vencimento);
      mapa.set(chave, (mapa.get(chave) || 0) + i.valor);
    });
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  const hoje = getTodayBR();

  return (
    <div className="space-y-6">
      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total próximos 30 dias</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatCurrencyBR(totais.totalGeral)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vencidas</p>
          <p className="text-2xl font-black text-rose-600">{loading ? '...' : formatCurrencyBR(totais.totalVencidas)}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <SectionTitle title="Total por semana" subtitle="Soma dos vencimentos agrupados pela semana (segunda a domingo)" />
        <div className="flex flex-wrap gap-3 mt-4">
          {porSemana.length === 0 ? (
            <p className="text-slate-300 font-bold italic text-sm">Sem contas a pagar na janela.</p>
          ) : porSemana.map(([semana, valor]) => (
            <div key={semana} className="bg-slate-50 rounded-xl px-4 py-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Semana de {formatDateBR(semana)}</p>
              <p className="text-sm font-black text-slate-800">{formatCurrencyBR(valor)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <SectionTitle title="Próximos vencimentos" subtitle="Vencidas em vermelho, ordenado por data" />
        {loading ? <CardSkeleton height={220} /> : itens.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-10">Nenhuma conta a pagar na janela.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {itens.map((item) => (
              <div key={`${item.origem}-${item.referenciaId}`} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-bold truncate ${item.vencida ? 'text-rose-600' : 'text-slate-700'}`}>{item.descricao}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
                    {item.categoriaNome} · venc. {formatDateBR(item.vencimento)} {item.vencimento === hoje && '· hoje'}
                    {item.origem === 'conta_fixa_projetada' && ' · projetada'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-black ${item.vencida ? 'text-rose-600' : 'text-slate-800'}`}>{formatCurrencyBR(item.valor)}</span>
                  {item.origem === 'despesa' && (
                    <button
                      onClick={() => setPagando({ id: item.referenciaId, descricao: item.descricao, valor: item.valor })}
                      className="px-3 py-2 bg-emerald-500 text-white rounded-lg font-black text-[10px] uppercase tracking-wide"
                    >
                      Pagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pagando && (
        <PagarDespesaModal
          despesaId={pagando.id}
          descricao={pagando.descricao}
          valorTotal={pagando.valor}
          supabaseClient={supabaseClient}
          onClose={() => setPagando(null)}
          onPaid={carregar}
        />
      )}
    </div>
  );
};

export default ContasPagarTab;
