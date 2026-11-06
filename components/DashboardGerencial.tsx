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
import OcupacaoChart from './Dashboard/OcupacaoChart';
import OcupacaoBadge from './Dashboard/OcupacaoBadge';
import { thClass, thClassRight } from './Dashboard/tableClasses';
import {
  DashboardFiltros,
  Granularidade,
  DashboardKpis,
  DashboardKpisComplementares,
  FaturamentoPontoPeriodo,
  FaturamentoCategoria,
  FaturamentoUnidade,
  FormaPagamento,
  CustoServicoPacote,
  TransporteResumo,
  TopAdicional,
  AgendamentosCards,
  ProximoAgendamento,
  OcupacaoDiaSemana,
  TopCliente,
  TopRaca,
  getDefaultPeriodo,
  getTodayBR,
  getPeriodoAnterior,
  calcularVariacao,
  fetchDashboardKpis,
  fetchDashboardKpisComplementares,
  fetchFaturamentoPeriodo,
  fetchFaturamentoCategoria,
  fetchFaturamentoUnidade,
  fetchFormasPagamento,
  fetchCustosPacotes,
  fetchTransporteResumo,
  fetchTopAdicionais,
  fetchAgendamentosCards,
  fetchProximosAgendamentos,
  fetchOcupacaoPeriodo,
  resumoOcupacao,
  fetchTopClientes,
  fetchTopRacas
} from '../services/dashboardGerencial';
import { fetchAcoesDoDia, AcoesDoDia } from '../services/acoesDoDia';

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
  // Padrao do Painel de Gestao: do dia 1 do mes atual ate hoje (nao ate o
  // fim do mes, como getDefaultPeriodo() faz para as outras telas que
  // reaproveitam essa mesma funcao). O usuario pode trocar manualmente.
  const defaultPeriodo = getDefaultPeriodo();
  const [filtros, setFiltros] = useState<DashboardFiltros>({
    unidadeId: units.length === 1 ? units[0].id : null,
    dataInicio: defaultPeriodo.dataInicio,
    dataFim: getTodayBR(),
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

  const [kpisComplementares, setKpisComplementares] = useState<DashboardKpisComplementares | null>(null);
  const [kpisComplementaresLoading, setKpisComplementaresLoading] = useState(true);

  const [agendamentosCardsAnterior, setAgendamentosCardsAnterior] = useState<AgendamentosCards | null>(null);

  const [ocupacaoAtual, setOcupacaoAtual] = useState<OcupacaoDiaSemana[]>([]);
  const [ocupacaoAnterior, setOcupacaoAnterior] = useState<OcupacaoDiaSemana[]>([]);
  const [ocupacaoLoading, setOcupacaoLoading] = useState(true);

  const [acoesDoDia, setAcoesDoDia] = useState<AcoesDoDia | null>(null);
  const [acoesDoDiaLoading, setAcoesDoDiaLoading] = useState(true);

  const [topClientes, setTopClientes] = useState<TopCliente[]>([]);
  const [topClientesLoading, setTopClientesLoading] = useState(true);

  const [topRacas, setTopRacas] = useState<TopRaca[]>([]);
  const [topRacasLoading, setTopRacasLoading] = useState(true);

  // Carrega em 2 ondas: a 1ª onda é exatamente o conjunto de consultas que o
  // Dashboard já disparava antes deste prompt (sem mudar sua concorrência).
  // A 2ª onda (KPIs/seções novas deste prompt) só dispara depois que a 1ª
  // onda termina — rodar tudo junto (~20 consultas simultâneas) esgotava o
  // pool de conexões e estourava o statement_timeout de 8s do role
  // "authenticated" (afetando até consultas antigas, como fn_dashboard_kpis).
  const carregarTudo = useCallback(() => {
    setKpisLoading(true);
    setKpisError(null);
    const p1 = fetchDashboardKpis(supabaseClient, filtros)
      .then(setKpis)
      .catch((err) => { console.error('Erro ao carregar KPIs do dashboard:', err); setKpisError(err?.message || 'Falha ao carregar KPIs.'); })
      .finally(() => setKpisLoading(false));

    setFaturamentoCategoriaLoading(true);
    const p2 = fetchFaturamentoCategoria(supabaseClient, filtros)
      .then(setFaturamentoCategoria)
      .catch((err) => console.error('Erro ao carregar faturamento por categoria:', err))
      .finally(() => setFaturamentoCategoriaLoading(false));

    setFaturamentoUnidadeLoading(true);
    const p3 = fetchFaturamentoUnidade(supabaseClient, filtros)
      .then(setFaturamentoUnidade)
      .catch((err) => console.error('Erro ao carregar faturamento por unidade:', err))
      .finally(() => setFaturamentoUnidadeLoading(false));

    setFormasPagamentoLoading(true);
    const p4 = fetchFormasPagamento(supabaseClient, filtros)
      .then(setFormasPagamento)
      .catch((err) => console.error('Erro ao carregar formas de pagamento:', err))
      .finally(() => setFormasPagamentoLoading(false));

    setCustosPacotesLoading(true);
    const p5 = fetchCustosPacotes(supabaseClient, filtros)
      .then(setCustosPacotes)
      .catch((err) => console.error('Erro ao carregar custos de pacotes:', err))
      .finally(() => setCustosPacotesLoading(false));

    setTransporteLoading(true);
    const p6 = fetchTransporteResumo(supabaseClient, filtros)
      .then(setTransporteResumo)
      .catch((err) => console.error('Erro ao carregar resumo de transporte:', err))
      .finally(() => setTransporteLoading(false));

    setTopAdicionaisLoading(true);
    const p7 = fetchTopAdicionais(supabaseClient, filtros)
      .then(setTopAdicionais)
      .catch((err) => console.error('Erro ao carregar top adicionais:', err))
      .finally(() => setTopAdicionaisLoading(false));

    setAgendamentosCardsLoading(true);
    const p8 = fetchAgendamentosCards(supabaseClient, filtros)
      .then(setAgendamentosCards)
      .catch((err) => console.error('Erro ao carregar cards de agendamentos:', err))
      .finally(() => setAgendamentosCardsLoading(false));

    setProximosLoading(true);
    const p9 = fetchProximosAgendamentos(supabaseClient, filtros)
      .then(setProximosAgendamentos)
      .catch((err) => console.error('Erro ao carregar próximos agendamentos:', err))
      .finally(() => setProximosLoading(false));

    setKpisComplementaresLoading(true);
    setOcupacaoLoading(true);
    setAcoesDoDiaLoading(true);
    setTopClientesLoading(true);
    setTopRacasLoading(true);

    Promise.allSettled([p1, p2, p3, p4, p5, p6, p7, p8, p9]).then(() => {
      const { dataInicioAnterior, dataFimAnterior } = getPeriodoAnterior(filtros.dataInicio, filtros.dataFim);

      fetchDashboardKpisComplementares(supabaseClient, filtros)
        .then(setKpisComplementares)
        .catch((err) => console.error('Erro ao carregar KPIs complementares:', err))
        .finally(() => setKpisComplementaresLoading(false));

      fetchAgendamentosCards(supabaseClient, { ...filtros, dataInicio: dataInicioAnterior, dataFim: dataFimAnterior })
        .then(setAgendamentosCardsAnterior)
        .catch((err) => console.error('Erro ao carregar agendamentos do período anterior:', err));

      Promise.all([
        fetchOcupacaoPeriodo(supabaseClient, filtros.unidadeId, filtros.dataInicio, filtros.dataFim),
        fetchOcupacaoPeriodo(supabaseClient, filtros.unidadeId, dataInicioAnterior, dataFimAnterior)
      ])
        .then(([atual, anterior]) => { setOcupacaoAtual(atual); setOcupacaoAnterior(anterior); })
        .catch((err) => console.error('Erro ao carregar ocupação:', err))
        .finally(() => setOcupacaoLoading(false));

      fetchAcoesDoDia(supabaseClient, filtros.unidadeId, filtros.dataInicio, filtros.dataFim, getTodayBR())
        .then(setAcoesDoDia)
        .catch((err) => console.error('Erro ao carregar ações do dia:', err))
        .finally(() => setAcoesDoDiaLoading(false));

      fetchTopClientes(supabaseClient, filtros, 10)
        .then(setTopClientes)
        .catch((err) => console.error('Erro ao carregar top clientes:', err))
        .finally(() => setTopClientesLoading(false));

      fetchTopRacas(supabaseClient, filtros, 10)
        .then(setTopRacas)
        .catch((err) => console.error('Erro ao carregar top raças:', err))
        .finally(() => setTopRacasLoading(false));
    });
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

  const abrirConfigCapacidade = () => {
    setNavState({ mode: 'global', view: 'Configurações', settingsTab: 'capacidade' });
  };

  // Unidade de destino ao navegar por "Ações do dia": a selecionada no filtro
  // do Dashboard, ou a primeira da lista quando "Todas as unidades".
  const unidadeDestinoAcoes = () => {
    if (filtros.unidadeId !== null) {
      return units.find((u) => u.id === filtros.unidadeId) || units[0];
    }
    return units[0];
  };

  const irParaClientesFiltrado = (clientesFiltroInicial: string) => {
    const unidade = unidadeDestinoAcoes();
    if (!unidade) return;
    setNavState({ mode: 'unit', view: 'Clientes', unitId: unidade.id, unitName: unidade.name, clientesFiltroInicial });
  };

  const irParaContasAReceber = () => {
    setNavState({ mode: 'global', view: 'Financeiro Geral', financeiroAbaInicial: 'contas_a_receber' });
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

  const resumoOcupacaoAtual = resumoOcupacao(ocupacaoAtual);
  const resumoOcupacaoAnterior = resumoOcupacao(ocupacaoAnterior);

  const taxaCancelamentoAtual = agendamentosCards && agendamentosCards.agendados + agendamentosCards.concluidos + agendamentosCards.cancelados > 0
    ? (agendamentosCards.cancelados / (agendamentosCards.agendados + agendamentosCards.concluidos + agendamentosCards.cancelados)) * 100
    : 0;
  const taxaCancelamentoAnterior = agendamentosCardsAnterior && agendamentosCardsAnterior.agendados + agendamentosCardsAnterior.concluidos + agendamentosCardsAnterior.cancelados > 0
    ? (agendamentosCardsAnterior.cancelados / (agendamentosCardsAnterior.agendados + agendamentosCardsAnterior.concluidos + agendamentosCardsAnterior.cancelados)) * 100
    : 0;

  const kpisComplementaresLoadingTotal = kpisComplementaresLoading || agendamentosCardsLoading || ocupacaoLoading;

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

      {/* Linha: KPIs complementares */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KPICard
          label="Ticket médio"
          value={formatCurrencyBR(kpisComplementares?.ticketMedioAtual ?? 0)}
          icon="fa-ticket"
          color="indigo"
          loading={kpisComplementaresLoading}
          trend={kpisComplementares ? trendFrom(kpisComplementares.ticketMedioAtual, kpisComplementares.ticketMedioAnterior) : undefined}
        />
        <KPICard
          label="Taxa de ocupação"
          value={`${formatDecimalBR(resumoOcupacaoAtual.percentual)}%`}
          icon="fa-calendar-check"
          color="blue"
          loading={kpisComplementaresLoadingTotal}
          trend={trendFrom(resumoOcupacaoAtual.percentual, resumoOcupacaoAnterior.percentual)}
        />
        <KPICard
          label="Taxa de no-show/cancelamento"
          value={`${formatDecimalBR(taxaCancelamentoAtual)}%`}
          icon="fa-calendar-xmark"
          color="rose"
          loading={agendamentosCardsLoading}
          trend={{ value: Math.abs(taxaCancelamentoAtual - taxaCancelamentoAnterior), direction: taxaCancelamentoAtual <= taxaCancelamentoAnterior ? 'up' : 'down', label: 'vs período anterior' }}
        />
        <KPICard
          label="Total a receber"
          value={formatCurrencyBR(kpisComplementares?.totalAReceberAtual ?? 0)}
          icon="fa-hand-holding-dollar"
          color="orange"
          loading={kpisComplementaresLoading}
          trend={kpisComplementares ? trendFrom(kpisComplementares.totalAReceberAtual, kpisComplementares.totalAReceberAnterior) : undefined}
          onClick={irParaContasAReceber}
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

      {/* Linha: Ocupação por dia da semana + Ações do dia */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <SectionTitle title="Ocupação por Dia da Semana" subtitle="Agendados vs. capacidade configurada" />
            <button
              onClick={abrirConfigCapacidade}
              className="px-3 py-1.5 rounded-full bg-slate-50 text-slate-500 hover:text-violet-600 text-[9px] font-black uppercase tracking-widest shrink-0"
            >
              <i className="fa-solid fa-gear mr-1.5"></i> Configurar capacidade
            </button>
          </div>
          <div className="mt-4">
            {ocupacaoLoading ? <CardSkeleton height={220} /> : <OcupacaoChart data={ocupacaoAtual} />}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
          <SectionTitle title="Ações do Dia" subtitle="Pendências que valem uma ação agora" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => irParaClientesFiltrado('atrasados')}
              className="text-left bg-rose-50 hover:bg-rose-100 transition-colors rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Pets atrasados</p>
                <p className="text-2xl font-black text-rose-700">{acoesDoDiaLoading ? '—' : acoesDoDia?.petsAtrasados ?? 0}</p>
              </div>
              <i className="fa-solid fa-clock-rotate-left text-rose-300 text-xl"></i>
            </button>

            <button
              onClick={() => irParaClientesFiltrado('pacote_acabando')}
              className="text-left bg-amber-50 hover:bg-amber-100 transition-colors rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pacotes acabando</p>
                <p className="text-2xl font-black text-amber-700">{acoesDoDiaLoading ? '—' : acoesDoDia?.pacotesAcabando ?? 0}</p>
              </div>
              <i className="fa-solid fa-hourglass-half text-amber-300 text-xl"></i>
            </button>

            <button
              onClick={() => irParaClientesFiltrado('nao_renovaram')}
              className="text-left bg-orange-50 hover:bg-orange-100 transition-colors rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Não renovaram</p>
                <p className="text-2xl font-black text-orange-700">{acoesDoDiaLoading ? '—' : acoesDoDia?.clientesNaoRenovaram ?? 0}</p>
              </div>
              <i className="fa-solid fa-rotate-left text-orange-300 text-xl"></i>
            </button>

            <button
              onClick={irParaContasAReceber}
              className="text-left bg-violet-50 hover:bg-violet-100 transition-colors rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest">Pendências a cobrar</p>
                <p className="text-2xl font-black text-violet-700">{acoesDoDiaLoading ? '—' : acoesDoDia?.pendenciasACobrar.qtd ?? 0}</p>
                <p className="text-[10px] font-bold text-violet-400">{acoesDoDiaLoading ? '' : formatCurrencyBR(acoesDoDia?.pendenciasACobrar.valor ?? 0)}</p>
              </div>
              <i className="fa-solid fa-sack-dollar text-violet-300 text-xl"></i>
            </button>

            <button
              onClick={() => irParaClientesFiltrado('aniversariantes')}
              className="text-left bg-purple-50 hover:bg-purple-100 transition-colors rounded-2xl p-4 flex items-center justify-between gap-3 sm:col-span-2"
            >
              <div>
                <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest">Aniversariantes da semana</p>
                <p className="text-2xl font-black text-purple-700">{acoesDoDiaLoading ? '—' : acoesDoDia?.aniversariantesSemana ?? 0}</p>
              </div>
              <i className="fa-solid fa-cake-candles text-purple-300 text-xl"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Linha: Ranking de clientes + Top raças */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Top 10 Clientes" subtitle="Maior faturamento no período" />
          <div className="mt-4">
            {topClientesLoading ? (
              <CardSkeleton height={220} />
            ) : topClientes.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhum faturamento no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={thClass}>#</th>
                    <th className={thClass}>Cliente</th>
                    <th className={thClassRight}>Atendimentos</th>
                    <th className={thClassRight}>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {topClientes.map((c, idx) => (
                    <tr key={c.clienteId} className="border-b border-slate-50">
                      <td className="py-3 pr-2 font-black text-slate-300">{idx + 1}</td>
                      <td className="py-3 pr-4 font-bold text-slate-700">{c.clienteNome}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{c.qtdEventos}</td>
                      <td className="py-3 text-right font-black text-emerald-600">{formatCurrencyBR(c.faturamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Top Raças Atendidas" subtitle="Atendimentos finalizados no período" />
          <div className="mt-4">
            {topRacasLoading ? (
              <CardSkeleton height={220} />
            ) : topRacas.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhum atendimento finalizado no período.</p>
            ) : (
              <div className="space-y-3">
                {topRacas.map((r) => {
                  const max = Math.max(...topRacas.map((x) => x.qtd), 1);
                  const pct = Math.round((r.qtd / max) * 100);
                  return (
                    <div key={r.raca}>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
                        <span className="truncate">{r.raca}</span>
                        <span className="text-slate-800 font-black">{r.qtd}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardGerencial;
