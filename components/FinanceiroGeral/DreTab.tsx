import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrencyBR, formatDecimalBR } from '../../services/appointmentTotals';
import { calcularVariacao, getTodayBR } from '../../services/dashboardGerencial';
import { DreMensal, LINHA_RECEITA_LABEL, fetchDreMensal, fetchFinanceiroKpis, getFiltrosDefault } from '../../services/financeiroGeral';
import SectionTitle from '../Dashboard/SectionTitle';
import CardSkeleton from '../Dashboard/CardSkeleton';

interface DreTabProps {
  unidadeId: number | null;
  supabaseClient: any;
}

const LinhaDre: React.FC<{ label: string; valor: number; atual?: number; anterior?: number; destaque?: boolean; negativo?: boolean }> = ({
  label, valor, atual, anterior, destaque, negativo
}) => {
  const variacao = atual !== undefined && anterior !== undefined ? calcularVariacao(atual, anterior) : null;
  return (
    <div className={`flex items-center justify-between py-3 ${destaque ? 'border-t border-slate-100 pt-4' : ''}`}>
      <span className={`text-sm ${destaque ? 'font-black text-slate-800 uppercase text-xs tracking-wide' : 'font-bold text-slate-500'}`}>{label}</span>
      <div className="flex items-center gap-3">
        {variacao !== null && (
          <span className={`text-[10px] font-black ${variacao >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {variacao >= 0 ? '▲' : '▼'} {formatDecimalBR(Math.abs(variacao))}%
          </span>
        )}
        <span className={`font-black ${destaque ? 'text-lg' : 'text-sm'} ${negativo ? 'text-rose-600' : 'text-slate-800'}`}>
          {negativo ? '− ' : ''}{formatCurrencyBR(valor)}
        </span>
      </div>
    </div>
  );
};

const DreTab: React.FC<DreTabProps> = ({ unidadeId, supabaseClient }) => {
  const [anoMes, setAnoMes] = useState(() => getTodayBR().slice(0, 7));
  const [dre, setDre] = useState<DreMensal | null>(null);
  const [recebidoCaixa, setRecebidoCaixa] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    const anoMesData = `${anoMes}-01`;
    const [ano, mes] = anoMes.split('-').map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const filtrosCaixa = { ...getFiltrosDefault(unidadeId), dataInicio: `${anoMes}-01`, dataFim: `${anoMes}-${String(ultimoDia).padStart(2, '0')}` };

    Promise.all([
      fetchDreMensal(supabaseClient, unidadeId, anoMesData),
      fetchFinanceiroKpis(supabaseClient, filtrosCaixa)
    ])
      .then(([dreData, kpis]) => { setDre(dreData); setRecebidoCaixa(kpis.recebidoAtual); })
      .catch((err) => { console.error('Erro ao carregar DRE:', err); setErro(err?.message || 'Falha ao carregar DRE.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, unidadeId, anoMes]);

  useEffect(() => { carregar(); }, [carregar]);

  const divergenciaRegime = dre ? Math.abs(dre.receitaLiquida - (recebidoCaixa ?? 0)) > 0.01 : false;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <SectionTitle title="DRE Simplificado Mensal" subtitle="Receita bruta → líquida → margem de contribuição → resultado operacional" />
        <input type="month" value={anoMes} onChange={(e) => setAnoMes(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none" />
      </div>

      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      {loading || !dre ? <CardSkeleton height={400} /> : (
        <>
          <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <SectionTitle title="Receita bruta por linha" subtitle="Regime de competência por sessão — mesma base do Dashboard Gerencial" />
            <div className="mt-4 divide-y divide-slate-50">
              {dre.receitaBrutaLinhas.map((l) => (
                <div key={l.linha} className="flex justify-between py-2.5 text-sm">
                  <span className="font-bold text-slate-500">{LINHA_RECEITA_LABEL[l.linha] || l.linha}</span>
                  <span className="font-black text-slate-800">{formatCurrencyBR(l.valor)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm divide-y divide-slate-50">
            <LinhaDre label="Receita bruta" valor={dre.receitaBrutaTotal} atual={dre.receitaBrutaTotal} anterior={dre.anterior.receitaBrutaTotal} />
            <LinhaDre label="(−) Descontos" valor={dre.descontos} negativo />
            <LinhaDre label="(−) Taxas de cartão" valor={dre.taxasCartao} negativo />
            <LinhaDre label="(=) Receita líquida" valor={dre.receitaLiquida} atual={dre.receitaLiquida} anterior={dre.anterior.receitaLiquida} destaque />
            <LinhaDre label="(−) Custos diretos" valor={dre.custosDiretos} negativo />
            <LinhaDre label="(=) Margem de contribuição" valor={dre.margemContribuicao} atual={dre.margemContribuicao} anterior={dre.anterior.margemContribuicao} destaque />
            <LinhaDre label="(−) Despesas fixas" valor={dre.despesasFixasTotal} negativo />
            <LinhaDre
              label="(=) Resultado operacional"
              valor={dre.resultadoOperacional}
              atual={dre.resultadoOperacional}
              anterior={dre.anterior.resultadoOperacional}
              destaque
              negativo={dre.resultadoOperacional < 0}
            />
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <SectionTitle title="Despesas fixas por categoria" subtitle="Inclui folha de pagamento" />
            <div className="mt-4 divide-y divide-slate-50">
              {dre.despesasFixasCategorias.length === 0 ? (
                <p className="text-center text-slate-300 font-bold italic py-6">Nenhuma despesa fixa paga no mês.</p>
              ) : dre.despesasFixasCategorias.map((d) => (
                <div key={d.categoria} className="flex justify-between py-2.5 text-sm">
                  <span className="font-bold text-slate-500">{d.categoria}</span>
                  <span className="font-black text-slate-800">{formatCurrencyBR(d.valor)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-6 space-y-2">
            <SectionTitle title="Conferência de números" subtitle="Comparação com o que já aparece em outras telas para o mesmo período" />
            <div className="flex justify-between text-sm pt-2">
              <span className="font-bold text-slate-500">Receita líquida do DRE (competência por sessão — mesma base do Dashboard Gerencial)</span>
              <span className="font-black text-slate-800">{formatCurrencyBR(dre.receitaLiquida)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold text-slate-500">Recebido no Financeiro Geral (regime de caixa, mesmo período)</span>
              <span className="font-black text-slate-800">{formatCurrencyBR(recebidoCaixa ?? 0)}</span>
            </div>
            {divergenciaRegime && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-2">
                <i className="fa-solid fa-circle-info mr-1.5"></i>
                Os dois números legitimamente divergem na linha de pacotes: o DRE conta o pacote por sessão prestada (competência, igual ao Dashboard Gerencial), enquanto o Financeiro Geral conta o valor cheio do pacote na data em que foi pago (caixa). Em avulso/táxi/extras os dois batem.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DreTab;
