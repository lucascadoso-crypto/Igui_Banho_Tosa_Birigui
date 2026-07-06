import React, { useEffect, useState, useCallback } from 'react';
import { Unit } from '../types';
import { useNavigation } from '../contexts/NavigationContext';
import { formatCurrencyBR, formatDecimalBR } from '../services/appointmentTotals';
import KPICard from './Dashboard/KPICard';
import DashboardHeader from './Dashboard/DashboardHeader';
import RevenueLineChart from './Dashboard/RevenueLineChart';
import UnitBarChart from './Dashboard/UnitBarChart';
import InsightsCard from './Dashboard/InsightsCard';
import CardSkeleton from './Dashboard/CardSkeleton';
import SectionTitle from './Dashboard/SectionTitle';
import SimpleDonut from './Dashboard/SimpleDonut';
import StatTile from './Dashboard/StatTile';
import { thClass, thClassRight } from './Dashboard/tableClasses';
import {
  DashboardFiltros,
  Granularidade,
  DashboardKpis,
  FaturamentoPontoPeriodo,
  FaturamentoCategoria,
  FaturamentoUnidade,
  FormaPagamento,
  CustoServicoPacote,
  TransporteResumo,
  TopAdicional,
  AgendamentosCards,
  ProximoAgendamento,
  getDefaultPeriodo,
  calcularVariacao,
  fetchDashboardKpis,
  fetchFaturamentoPeriodo,
  fetchFaturamentoCategoria,
  fetchFaturamentoUnidade,
  fetchFormasPagamento,
  fetchCustosPacotes,
  fetchTransporteResumo,
  fetchTopAdicionais,
  fetchAgendamentosCards,
  fetchProximosAgendamentos
} from '../services/dashboardGerencial';

interface DashboardGerencialProps {
  units: Unit[];
  supabaseClient: any;
}

const CATEGORIA_LABEL: Record<string, string> = {
  banho: 'Banho',
  tosa: 'Tosa',
  pacote: 'Pacote',
  adicional: 'Serviços Adicionais',
  outro: 'Outros'
};

const CATEGORIA_COR: Record<string, string> = {
  banho: '#0EA5E9',
  tosa: '#F59E0B',
  pacote: '#7C3AED',
  adicional: '#10B981',
  outro: '#94A3B8'
};

const FORMA_PAGAMENTO_COR: Record<string, string> = {
  Pix: '#10B981',
  Dinheiro: '#0EA5E9',
  Débito: '#7C3AED',
  Crédito: '#F59E0B',
  Transferência: '#EC4899',
  Outro: '#94A3B8',
  'Não informado': '#CBD5E1'
};

const DashboardGerencial: React.FC<DashboardGerencialProps> = ({ units, supabaseClient }) => {
  const { setNavState } = useNavigation();
  const defaultPeriodo = getDefaultPeriodo();
  const [filtros, setFiltros] = useState<DashboardFiltros>({
    unidadeId: units.length === 1 ? units[0].id : null,
    dataInicio: defaultPeriodo.dataInicio,
    dataFim: defaultPeriodo.dataFim,
    transporte: 'todos'
  });
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);

  const [faturamentoPeriodo, setFaturamentoPeriodo] = useState<FaturamentoPontoPeriodo[]>([]);
  const [faturamentoPeriodoLoading, setFaturamentoPeriodoLoading] = useState(true);

  const [faturamentoCategoria, setFaturamentoCategoria] = useState<FaturamentoCategoria[]>([]);
  const [faturamentoCategoriaLoading, setFaturamentoCategoriaLoading] = useState(true);

  const [faturamentoUnidade, setFaturamentoUnidade] = useState<FaturamentoUnidade[]>([]);
  const [faturamentoUnidadeLoading, setFaturamentoUnidadeLoading] = useState(true);

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [formasPagamentoLoading, setFormasPagamentoLoading] = useState(true);

  const [custosPacotes, setCustosPacotes] = useState<CustoServicoPacote[]>([]);
  const [custosPacotesLoading, setCustosPacotesLoading] = useState(true);

  const [transporteResumo, setTransporteResumo] = useState<TransporteResumo | null>(null);
  const [transporteLoading, setTransporteLoading] = useState(true);

  const [topAdicionais, setTopAdicionais] = useState<TopAdicional[]>([]);
  const [topAdicionaisLoading, setTopAdicionaisLoading] = useState(true);

  const [agendamentosCards, setAgendamentosCards] = useState<AgendamentosCards | null>(null);
  const [agendamentosCardsLoading, setAgendamentosCardsLoading] = useState(true);

  const [proximosAgendamentos, setProximosAgendamentos] = useState<ProximoAgendamento[]>([]);
  const [proximosLoading, setProximosLoading] = useState(true);

  const carregarTudo = useCallback(() => {
    setKpisLoading(true);
    setKpisError(null);
    fetchDashboardKpis(supabaseClient, filtros)
      .then(setKpis)
      .catch((err) => { console.error('Erro ao carregar KPIs do dashboard:', err); setKpisError(err?.message || 'Falha ao carregar KPIs.'); })
      .finally(() => setKpisLoading(false));

    setFaturamentoCategoriaLoading(true);
    fetchFaturamentoCategoria(supabaseClient, filtros)
      .then(setFaturamentoCategoria)
      .catch((err) => console.error('Erro ao carregar faturamento por categoria:', err))
      .finally(() => setFaturamentoCategoriaLoading(false));

    setFaturamentoUnidadeLoading(true);
    fetchFaturamentoUnidade(supabaseClient, filtros)
      .then(setFaturamentoUnidade)
      .catch((err) => console.error('Erro ao carregar faturamento por unidade:', err))
      .finally(() => setFaturamentoUnidadeLoading(false));

    setFormasPagamentoLoading(true);
    fetchFormasPagamento(supabaseClient, filtros)
      .then(setFormasPagamento)
      .catch((err) => console.error('Erro ao carregar formas de pagamento:', err))
      .finally(() => setFormasPagamentoLoading(false));

    setCustosPacotesLoading(true);
    fetchCustosPacotes(supabaseClient, filtros)
      .then(setCustosPacotes)
      .catch((err) => console.error('Erro ao carregar custos de pacotes:', err))
      .finally(() => setCustosPacotesLoading(false));

    setTransporteLoading(true);
    fetchTransporteResumo(supabaseClient, filtros)
      .then(setTransporteResumo)
      .catch((err) => console.error('Erro ao carregar resumo de transporte:', err))
      .finally(() => setTransporteLoading(false));

    setTopAdicionaisLoading(true);
    fetchTopAdicionais(supabaseClient, filtros)
      .then(setTopAdicionais)
      .catch((err) => console.error('Erro ao carregar top adicionais:', err))
      .finally(() => setTopAdicionaisLoading(false));

    setAgendamentosCardsLoading(true);
    fetchAgendamentosCards(supabaseClient, filtros)
      .then(setAgendamentosCards)
      .catch((err) => console.error('Erro ao carregar cards de agendamentos:', err))
      .finally(() => setAgendamentosCardsLoading(false));

    setProximosLoading(true);
    fetchProximosAgendamentos(supabaseClient, filtros)
      .then(setProximosAgendamentos)
      .catch((err) => console.error('Erro ao carregar próximos agendamentos:', err))
      .finally(() => setProximosLoading(false));
  }, [supabaseClient, filtros]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  useEffect(() => {
    setFaturamentoPeriodoLoading(true);
    fetchFaturamentoPeriodo(supabaseClient, filtros, granularidade)
      .then(setFaturamentoPeriodo)
      .catch((err) => console.error('Erro ao carregar faturamento por período:', err))
      .finally(() => setFaturamentoPeriodoLoading(false));
  }, [supabaseClient, filtros, granularidade]);

  const abrirConfigCustos = () => {
    setNavState({ mode: 'global', view: 'Configurações', settingsTab: 'custos' });
  };

  const trendFrom = (atual: number, anterior: number) => ({
    value: Math.abs(calcularVariacao(atual, anterior)),
    direction: (atual >= anterior ? 'up' : 'down') as 'up' | 'down',
    label: 'vs período anterior'
  });

  const custoTotalGeralPacotes = custosPacotes.reduce((s, c) => s + c.custoTotal, 0);
  const banhosViaPacote = custosPacotes.reduce((s, c) => s + c.qtd, 0);
  const faturamentoPacoteCategoria = faturamentoCategoria.find(c => c.categoria === 'pacote')?.valor || 0;
  const pctCustoSobreFaturamentoPacote = faturamentoPacoteCategoria > 0 ? (custoTotalGeralPacotes / faturamentoPacoteCategoria) * 100 : 0;
  const custoMedioPorBanho = banhosViaPacote > 0 ? custoTotalGeralPacotes / banhosViaPacote : 0;

  const unidadeFiltradaNome = filtros.unidadeId !== null ? (units.find((u) => u.id === filtros.unidadeId)?.name ?? 'Unidade selecionada') : 'Todas as unidades';

  const variacaoFaturamento = kpis ? calcularVariacao(kpis.faturamentoAtual, kpis.faturamentoAnterior) : null;
  const topCategoria = faturamentoCategoria.length > 0 ? [...faturamentoCategoria].sort((a, b) => b.valor - a.valor)[0] : null;
  const topCategoriaLabel = topCategoria ? (CATEGORIA_LABEL[topCategoria.categoria] || topCategoria.categoria) : null;
  const topUnidade = faturamentoUnidade.length > 0 ? [...faturamentoUnidade].sort((a, b) => b.valor - a.valor)[0] : null;
  const insightsLoading = kpisLoading || faturamentoCategoriaLoading || faturamentoUnidadeLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DashboardHeader units={units} filtros={filtros} onChangeFiltros={setFiltros} onOpenCostModal={abrirConfigCustos} />

      {kpisError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {kpisError}
        </div>
      )}

      {/* Linha: KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
        <KPICard
          label="Faturamento"
          value={formatCurrencyBR(kpis?.faturamentoAtual ?? 0)}
          icon="fa-sack-dollar"
          color="purple"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.faturamentoAtual, kpis.faturamentoAnterior) : undefined}
        />
        <KPICard
          label="Banhos"
          value={kpis?.banhosAtual ?? 0}
          icon="fa-shower"
          color="blue"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.banhosAtual, kpis.banhosAnterior) : undefined}
        />
        <KPICard
          label="Tosas"
          value={kpis?.tosasAtual ?? 0}
          icon="fa-scissors"
          color="rose"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.tosasAtual, kpis.tosasAnterior) : undefined}
        />
        <KPICard
          label="Pacotes ativos"
          value={kpis?.pacotesAtivosAtual ?? 0}
          icon="fa-layer-group"
          color="amber"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.pacotesAtivosAtual, kpis.pacotesAtivosAnterior) : undefined}
        />
        <KPICard
          label="Clientes"
          value={kpis?.novosClientesAtual ?? 0}
          icon="fa-user-plus"
          color="emerald"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.novosClientesAtual, kpis.novosClientesAnterior) : undefined}
        />
      </div>

      {/* Linha: Serviços mais vendidos + Formas de pagamento + Insights IA */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Serviços Mais Vendidos" subtitle="Faturamento por tipo de serviço" />
          <div className="mt-4">
            <SimpleDonut
              loading={faturamentoCategoriaLoading}
              data={faturamentoCategoria.map((c) => ({ label: CATEGORIA_LABEL[c.categoria] || c.categoria, valor: c.valor, cor: CATEGORIA_COR[c.categoria] || '#94A3B8' }))}
            />
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Formas de Pagamento" subtitle="Métodos mais utilizados na rede" />
          <div className="mt-4">
            <SimpleDonut
              loading={formasPagamentoLoading}
              data={formasPagamento.map((f) => ({ label: f.forma, valor: f.valor, cor: FORMA_PAGAMENTO_COR[f.forma] || '#94A3B8' }))}
            />
          </div>
        </div>

        <InsightsCard
          loading={insightsLoading}
          variacaoFaturamento={variacaoFaturamento}
          topCategoriaLabel={topCategoriaLabel}
          topUnidadeNome={topUnidade?.unidadeNome ?? null}
        />
      </div>

      {/* Linha: Faturamento diário + Faturamento da unidade */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
            <SectionTitle title="Faturamento Diário" subtitle="Histórico de entradas financeiras consolidadas" />
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Evolução Período</span>
              <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                {(['dia', 'semana', 'mes'] as Granularidade[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularidade(g)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${granularidade === g ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400'}`}
                  >
                    {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {faturamentoPeriodoLoading ? <CardSkeleton height={260} /> : <RevenueLineChart data={faturamentoPeriodo} />}
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Faturamento da Unidade" subtitle={filtros.unidadeId !== null ? 'Faturamento total desta unidade' : 'Faturamento total por unidade'} />
          <div className="mt-4">
            {faturamentoUnidadeLoading ? <CardSkeleton height={220} /> : <UnitBarChart data={faturamentoUnidade} />}
          </div>
        </div>
      </div>

      {/* Linha: Custos de pacotes + Transporte */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <SectionTitle title="Custos com Serviços de Pacotes" subtitle="Margem de lucro e custo dos pacotes de fidelidade" />
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Custo total" value={custosPacotesLoading ? '—' : formatCurrencyBR(custoTotalGeralPacotes)} tone="rose" />
            <StatTile label="% do faturamento de pacotes" value={custosPacotesLoading ? '—' : `${formatDecimalBR(pctCustoSobreFaturamentoPacote)}%`} tone="violet" />
          </div>

          {custosPacotesLoading ? (
            <CardSkeleton height={160} />
          ) : custosPacotes.length === 0 ? (
            <p className="text-center text-slate-300 font-bold italic py-8">
              Nenhum custo cadastrado ainda para os serviços realizados neste período. Use o botão de configuração no cabeçalho.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass}>Serviço do pacote</th>
                    <th className={thClassRight}>Sessões</th>
                    <th className={thClassRight}>Custo unitário</th>
                    <th className={thClassRight}>Custo estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {custosPacotes.map((c) => (
                    <tr key={c.servico} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-bold text-slate-700">{c.servico}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{c.qtd}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(c.custoUnitario)}</td>
                      <td className="py-3 text-right font-black text-rose-600">{formatCurrencyBR(c.custoTotal)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-3 pr-4 font-black text-slate-900 uppercase text-xs">Total</td>
                    <td className="py-3 pr-4 text-right font-black text-slate-900">{banhosViaPacote}</td>
                    <td className="py-3 pr-4 text-right font-black text-slate-500 text-xs">Custo méd./banho {formatCurrencyBR(custoMedioPorBanho)}</td>
                    <td className="py-3 text-right font-black text-rose-600">{formatCurrencyBR(custoTotalGeralPacotes)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <SectionTitle title="Serviço de Transporte (Táxi)" subtitle="Balanço financeiro do leva-e-traz" />
          {transporteLoading ? (
            <CardSkeleton height={140} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass}>Unidade</th>
                    <th className={thClassRight}>Viagens</th>
                    <th className={thClassRight}>Receita táxi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3 pr-4 font-bold text-slate-700">{unidadeFiltradaNome}</td>
                    <td className="py-3 pr-4 text-right font-bold text-slate-600">{transporteResumo?.petsTransportados ?? 0}</td>
                    <td className="py-3 text-right font-black text-emerald-600">{formatCurrencyBR(transporteResumo?.faturamentoTransporte ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[10px] text-slate-300 font-bold mt-4 italic">
                Custo por viagem (combustível + tempo) é cadastrado em Configurações → Custos dos Serviços e entra no cálculo de lucro em Rentabilidade.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Linha: Top adicionais + Próximos agendamentos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Top Serviços Adicionais" subtitle="Extras e adicionais com maior venda" />
          <div className="mt-4">
            {topAdicionaisLoading ? (
              <CardSkeleton height={200} />
            ) : topAdicionais.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhum serviço adicional pago no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass}>Serviço adicional</th>
                    <th className={thClassRight}>Qtd. vendida</th>
                    <th className={thClassRight}>Receita total</th>
                  </tr>
                </thead>
                <tbody>
                  {topAdicionais.map((a) => (
                    <tr key={a.servico} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-bold text-slate-700">{a.servico}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{a.qtd}</td>
                      <td className="py-3 text-right font-black text-emerald-600">{formatCurrencyBR(a.faturamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <SectionTitle title="Próximos Agendamentos" subtitle="Próximos pets agendados para banho e tosa" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Agendados" value={agendamentosCardsLoading ? '—' : agendamentosCards?.agendados ?? 0} />
            <StatTile label="Concluídos" value={agendamentosCardsLoading ? '—' : agendamentosCards?.concluidos ?? 0} tone="violet" />
            <StatTile label="Cancelados" value={agendamentosCardsLoading ? '—' : agendamentosCards?.cancelados ?? 0} tone="rose" />
            <StatTile label="Taxa conclusão" value={agendamentosCardsLoading ? '—' : `${formatDecimalBR(agendamentosCards?.taxaConclusao ?? 0)}%`} />
          </div>

          {proximosLoading ? (
            <CardSkeleton height={160} />
          ) : proximosAgendamentos.length === 0 ? (
            <p className="text-center text-slate-300 font-bold italic py-8">Nenhum agendamento futuro encontrado.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={`${thClass} px-2`}>Pet / Cliente</th>
                    <th className={`${thClass} px-2`}>Unidade</th>
                    <th className={`${thClassRight} px-2`}>Horário</th>
                    <th className={`${thClassRight} px-2`}>Valor</th>
                    <th className={`${thClassRight} px-2`}>Táxi</th>
                  </tr>
                </thead>
                <tbody>
                  {proximosAgendamentos.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50">
                      <td className="py-3 px-2 min-w-0">
                        <p className="font-black text-slate-800 text-sm truncate">
                          {a.petNome}{a.petRaca ? ` (${a.petRaca})` : ''}
                          {a.numeroSessao ? <span className="ml-2 text-[9px] font-black text-violet-500 uppercase">Sessão {a.numeroSessao}</span> : null}
                        </p>
                        {a.clienteNome && <p className="text-[11px] text-slate-400 font-bold truncate">{a.clienteNome}</p>}
                      </td>
                      <td className="py-3 px-2 text-slate-500 font-bold text-xs">{a.unidadeNome || '—'}</td>
                      <td className="py-3 px-2 text-right text-slate-600 font-bold text-xs whitespace-nowrap">{a.horario}</td>
                      <td className="py-3 px-2 text-right font-black text-slate-800 whitespace-nowrap">{formatCurrencyBR(a.valor)}</td>
                      <td className="py-3 px-2 text-right">
                        {a.temTaxi ? (
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase">Sim</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default DashboardGerencial;
