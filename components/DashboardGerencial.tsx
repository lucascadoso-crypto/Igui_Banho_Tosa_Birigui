import React, { useEffect, useState, useCallback } from 'react';
import { Unit } from '../types';
import { formatCurrencyBR } from '../services/appointmentTotals';
import KPICard from './Dashboard/KPICard';
import {
  DashboardFiltros,
  TransporteFiltro,
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
  pacote: '#8B5CF6',
  adicional: '#10B981',
  outro: '#94A3B8'
};

const FORMA_PAGAMENTO_COR: Record<string, string> = {
  Pix: '#0EA5E9',
  Dinheiro: '#10B981',
  Debito: '#8B5CF6',
  Credito: '#F59E0B',
  Transferencia: '#EC4899',
  Outro: '#94A3B8',
  'Não Informado': '#CBD5E1'
};

const CardSkeleton: React.FC<{ height?: number }> = ({ height = 280 }) => (
  <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-100 animate-pulse" style={{ minHeight: height }}>
    <div className="h-4 w-1/3 bg-slate-100 rounded mb-6"></div>
    <div className="h-full w-full bg-slate-50 rounded-xl"></div>
  </div>
);

const SectionTitle: React.FC<{ icon: string; color: string; title: string; subtitle?: string }> = ({ icon, color, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-2">
    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div>
      <h3 className="text-base font-black text-slate-800 leading-tight">{title}</h3>
      {subtitle && <p className="text-[11px] font-bold text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

const SimpleDonut: React.FC<{
  data: { label: string; valor: number; cor: string }[];
  loading?: boolean;
  centerLabel?: string;
}> = ({ data, loading, centerLabel = 'Total' }) => {
  const total = data.reduce((sum, d) => sum + d.valor, 0);

  if (loading) return <CardSkeleton height={260} />;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-pie text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem dados no período.</p>
      </div>
    );
  }

  const radius = 70;
  const stroke = 26;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
        <svg viewBox="0 0 180 180" width="180" height="180">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{centerLabel}</p>
          <p className="text-sm font-black text-slate-800 text-center leading-tight px-2">{formatCurrencyBR(total)}</p>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2 min-w-0">
        {data.filter(d => d.valor > 0).map((d, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-bold text-slate-600 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.cor }}></span>
              <span className="truncate">{d.label}</span>
            </span>
            <span className="font-black text-slate-800 shrink-0">
              {formatCurrencyBR(d.valor)} <span className="text-slate-400 font-bold">({Math.round((d.valor / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SimpleAreaChart: React.FC<{ data: FaturamentoPontoPeriodo[]; loading?: boolean }> = ({ data, loading }) => {
  if (loading) return <CardSkeleton height={260} />;

  if (!data.length || data.every(d => d.valor === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-area text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem faturamento no período.</p>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.valor), 1);
  const width = 640;
  const height = 220;
  const padX = 8;
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const points = data.map((d, idx) => {
    const x = padX + stepX * idx;
    const y = height - (d.valor / max) * (height - 20) - 4;
    return { x, y, ...d };
  });
  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  const formatBucketLabel = (bucket: string) => {
    const parts = bucket.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return bucket;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full" style={{ minWidth: 480 }}>
        <defs>
          <linearGradient id="dashFaturamentoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#dashFaturamentoGradient)" stroke="none" />
        <path d={linePath} fill="none" stroke="#0EA5E9" strokeWidth={2.5} />
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r={3} fill="#0EA5E9" />
        ))}
        {points.map((p, idx) => (
          (idx === 0 || idx === points.length - 1 || idx % Math.ceil(points.length / 8 || 1) === 0) && (
            <text key={`lbl-${idx}`} x={p.x} y={height + 18} fontSize={10} fill="#94a3b8" textAnchor="middle" fontWeight={700}>
              {formatBucketLabel(p.bucket)}
            </text>
          )
        ))}
      </svg>
    </div>
  );
};

const DashboardGerencial: React.FC<DashboardGerencialProps> = ({ units, supabaseClient }) => {
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

  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [servicosCusto, setServicosCusto] = useState<any[]>([]);
  const [savingCustos, setSavingCustos] = useState(false);

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

  const openCostModal = async () => {
    try {
      const { data, error } = await supabaseClient.from('servicos').select('id, nome, custo_padrao').order('nome');
      if (error) throw error;
      setServicosCusto((data || []).map((s: any) => ({ ...s, custo_padrao: s.custo_padrao ?? 0 })));
      setIsCostModalOpen(true);
    } catch (err) {
      console.error('Erro ao carregar serviços para configuração de custo:', err);
    }
  };

  const saveCustos = async () => {
    setSavingCustos(true);
    try {
      await Promise.all(
        servicosCusto.map((s) =>
          supabaseClient.from('servicos').update({ custo_padrao: Number(s.custo_padrao) || 0 }).eq('id', s.id)
        )
      );
      setIsCostModalOpen(false);
      fetchCustosPacotes(supabaseClient, filtros).then(setCustosPacotes).catch(() => {});
    } catch (err) {
      console.error('Erro ao salvar custos de serviços:', err);
    } finally {
      setSavingCustos(false);
    }
  };

  const trendFrom = (atual: number, anterior: number) => ({
    value: Math.abs(calcularVariacao(atual, anterior)),
    direction: (atual >= anterior ? 'up' : 'down') as 'up' | 'down',
    label: 'vs período anterior'
  });

  const faturamentoTotalPeriodo = faturamentoCategoria.reduce((s, c) => s + c.valor, 0);
  const custoTotalPacotes = custosPacotes.reduce((s, c) => s + c.custoTotal, 0);
  const banhosViaPacote = custosPacotes.reduce((s, c) => s + c.qtd, 0);
  const faturamentoPacoteCategoria = faturamentoCategoria.find(c => c.categoria === 'pacote')?.valor || 0;
  const pctCustoSobreFaturamentoPacote = faturamentoPacoteCategoria > 0 ? (custoTotalPacotes / faturamentoPacoteCategoria) * 100 : 0;
  const custoMedioPorBanho = banhosViaPacote > 0 ? custoTotalPacotes / banhosViaPacote : 0;
  const custoTotalGeralPacotes = custosPacotes.reduce((s, c) => s + c.custoTotal, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header + Filtros */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center shrink-0">
              <i className="fa-solid fa-gauge-high text-2xl"></i>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Visão Geral da Operação</h2>
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Dashboard Gerencial</p>
            </div>
          </div>
          <button
            onClick={openCostModal}
            className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100 text-[11px] font-black uppercase tracking-widest flex items-center gap-2"
          >
            <i className="fa-solid fa-sliders"></i> Configurar custos de serviço
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data início</span>
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data fim</span>
            <input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</span>
            <select
              value={filtros.unidadeId ?? 'todas'}
              onChange={(e) => setFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
            >
              <option value="todas">Todas</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transporte</span>
            <select
              value={filtros.transporte}
              onChange={(e) => setFiltros((f) => ({ ...f, transporte: e.target.value as TransporteFiltro }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
            >
              <option value="todos">Todos</option>
              <option value="com">Com transporte</option>
              <option value="sem">Sem transporte</option>
            </select>
          </label>
        </div>

        {kpisError && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation"></i> {kpisError}
          </div>
        )}
      </div>

      {/* Linha 1: KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
        <KPICard
          label="Faturamento total"
          value={formatCurrencyBR(kpis?.faturamentoAtual ?? 0)}
          icon="fa-sack-dollar"
          color="emerald"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.faturamentoAtual, kpis.faturamentoAnterior) : undefined}
        />
        <KPICard
          label="Banhos realizados"
          value={kpis?.banhosAtual ?? 0}
          icon="fa-shower"
          color="blue"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.banhosAtual, kpis.banhosAnterior) : undefined}
        />
        <KPICard
          label="Tosas realizadas"
          value={kpis?.tosasAtual ?? 0}
          icon="fa-scissors"
          color="amber"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.tosasAtual, kpis.tosasAnterior) : undefined}
        />
        <KPICard
          label="Pacotes ativos"
          value={kpis?.pacotesAtivosAtual ?? 0}
          icon="fa-layer-group"
          color="purple"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.pacotesAtivosAtual, kpis.pacotesAtivosAnterior) : undefined}
        />
        <KPICard
          label="Novos clientes"
          value={kpis?.novosClientesAtual ?? 0}
          icon="fa-user-plus"
          color="rose"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.novosClientesAtual, kpis.novosClientesAnterior) : undefined}
        />
      </div>

      {/* Linha 2: Gráficos de faturamento */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <SectionTitle icon="fa-chart-area" color="bg-sky-50 text-sky-600" title="Faturamento por dia" />
            <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
              {(['dia', 'semana', 'mes'] as Granularidade[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularidade(g)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${granularidade === g ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {g === 'dia' ? 'Por dia' : g === 'semana' ? 'Por semana' : 'Por mês'}
                </button>
              ))}
            </div>
          </div>
          <SimpleAreaChart data={faturamentoPeriodo} loading={faturamentoPeriodoLoading} />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle icon="fa-chart-pie" color="bg-violet-50 text-violet-600" title="Faturamento por tipo de serviço" />
          <div className="mt-4">
            <SimpleDonut
              loading={faturamentoCategoriaLoading}
              data={faturamentoCategoria.map((c) => ({ label: CATEGORIA_LABEL[c.categoria] || c.categoria, valor: c.valor, cor: CATEGORIA_COR[c.categoria] || '#94A3B8' }))}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <SectionTitle icon="fa-store" color="bg-teal-50 text-teal-600" title="Faturamento por unidade" />
        <div className="mt-4 space-y-3">
          {faturamentoUnidadeLoading ? (
            <CardSkeleton height={100} />
          ) : (
            faturamentoUnidade.map((u) => {
              const max = Math.max(...faturamentoUnidade.map((x) => x.valor), 1);
              return (
                <div key={u.unidadeId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>{u.unidadeNome}</span>
                    <span className="font-black text-slate-800">{formatCurrencyBR(u.valor)}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all duration-700" style={{ width: `${(u.valor / max) * 100}%` }}></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bloco: Custos com serviços de pacotes */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <SectionTitle
          icon="fa-hand-holding-dollar"
          color="bg-orange-50 text-orange-600"
          title="Custos com Serviços de Pacotes"
          subtitle="Baseado no custo padrão cadastrado por serviço"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo total</p>
            <p className="text-xl font-black text-slate-800">{custosPacotesLoading ? '—' : formatCurrencyBR(custoTotalGeralPacotes)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo médio por banho</p>
            <p className="text-xl font-black text-slate-800">{custosPacotesLoading ? '—' : formatCurrencyBR(custoMedioPorBanho)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Banhos via pacote</p>
            <p className="text-xl font-black text-slate-800">{custosPacotesLoading ? '—' : banhosViaPacote}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">% do faturamento de pacotes</p>
            <p className="text-xl font-black text-slate-800">{custosPacotesLoading ? '—' : `${pctCustoSobreFaturamentoPacote.toFixed(1)}%`}</p>
          </div>
        </div>

        {custosPacotesLoading ? (
          <CardSkeleton height={160} />
        ) : custosPacotes.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-8">
            Nenhum custo cadastrado ainda para os serviços realizados neste período. Use "Configurar custos de serviço" acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4 text-right">Qtd. realizada</th>
                  <th className="py-2 pr-4 text-right">Custo unitário</th>
                  <th className="py-2 pr-4 text-right">Custo total</th>
                  <th className="py-2 text-right">% do custo total</th>
                </tr>
              </thead>
              <tbody>
                {custosPacotes.map((c) => (
                  <tr key={c.servico} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-bold text-slate-700">{c.servico}</td>
                    <td className="py-3 pr-4 text-right font-bold text-slate-600">{c.qtd}</td>
                    <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(c.custoUnitario)}</td>
                    <td className="py-3 pr-4 text-right font-black text-slate-800">{formatCurrencyBR(c.custoTotal)}</td>
                    <td className="py-3 text-right font-bold text-slate-600">{custoTotalGeralPacotes > 0 ? `${((c.custoTotal / custoTotalGeralPacotes) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-3 pr-4 font-black text-slate-900 uppercase text-xs">Total</td>
                  <td className="py-3 pr-4 text-right font-black text-slate-900">{banhosViaPacote}</td>
                  <td className="py-3 pr-4"></td>
                  <td className="py-3 pr-4 text-right font-black text-slate-900">{formatCurrencyBR(custoTotalGeralPacotes)}</td>
                  <td className="py-3 text-right font-black text-slate-900">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bloco: Transporte */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <SectionTitle
          icon="fa-taxi"
          color="bg-sky-50 text-sky-600"
          title="Transporte"
          subtitle="Ainda não há cadastro de motorista/custo de viagem — exibindo apenas dados reais disponíveis"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pets transportados</p>
            <p className="text-xl font-black text-slate-800">{transporteLoading ? '—' : transporteResumo?.petsTransportados ?? 0}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Faturamento de transporte</p>
            <p className="text-xl font-black text-slate-800">{transporteLoading ? '—' : formatCurrencyBR(transporteResumo?.faturamentoTransporte ?? 0)}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5 opacity-60">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo por motorista</p>
            <p className="text-sm font-bold text-slate-400">Sem cadastro ainda</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Bloco: Top adicionais */}
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle icon="fa-plus" color="bg-emerald-50 text-emerald-600" title="Top Serviços Adicionais" />
          <div className="mt-4">
            {topAdicionaisLoading ? (
              <CardSkeleton height={200} />
            ) : topAdicionais.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhum serviço adicional pago no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-2 pr-4">Serviço</th>
                    <th className="py-2 pr-4 text-right">Qtd.</th>
                    <th className="py-2 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {topAdicionais.map((a) => (
                    <tr key={a.servico} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-bold text-slate-700">{a.servico}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{a.qtd}</td>
                      <td className="py-3 text-right font-black text-slate-800">{formatCurrencyBR(a.faturamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Bloco: Formas de pagamento */}
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle icon="fa-credit-card" color="bg-indigo-50 text-indigo-600" title="Formas de Pagamento" subtitle="Pagamentos divididos contam cada parte separadamente" />
          <div className="mt-4">
            <SimpleDonut
              loading={formasPagamentoLoading}
              data={formasPagamento.map((f) => ({ label: f.forma, valor: f.valor, cor: FORMA_PAGAMENTO_COR[f.forma] || '#94A3B8' }))}
            />
          </div>
        </div>
      </div>

      {/* Bloco: Agendamentos */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <SectionTitle icon="fa-calendar-check" color="bg-amber-50 text-amber-600" title="Agendamentos" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agendados</p>
            <p className="text-xl font-black text-slate-800">{agendamentosCardsLoading ? '—' : agendamentosCards?.agendados ?? 0}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Concluídos</p>
            <p className="text-xl font-black text-slate-800">{agendamentosCardsLoading ? '—' : agendamentosCards?.concluidos ?? 0}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cancelados</p>
            <p className="text-xl font-black text-slate-800">{agendamentosCardsLoading ? '—' : agendamentosCards?.cancelados ?? 0}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de conclusão</p>
            <p className="text-xl font-black text-slate-800">{agendamentosCardsLoading ? '—' : `${agendamentosCards?.taxaConclusao ?? 0}%`}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Próximos agendamentos</h4>
          {proximosLoading ? (
            <CardSkeleton height={160} />
          ) : proximosAgendamentos.length === 0 ? (
            <p className="text-center text-slate-300 font-bold italic py-8">Nenhum agendamento futuro encontrado.</p>
          ) : (
            <div className="space-y-2">
              {proximosAgendamentos.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs font-black text-slate-700 shrink-0">{a.horario}</span>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">
                        {a.petNome}{a.petRaca ? ` · ${a.petRaca}` : ''}
                        {a.numeroSessao ? <span className="ml-2 text-[9px] font-black text-violet-500 uppercase">Sessão {a.numeroSessao}</span> : null}
                      </p>
                      <p className="text-[11px] text-slate-400 font-bold truncate">{a.servicos}</p>
                    </div>
                  </div>
                  {a.temTaxi && (
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-600 text-[9px] font-black uppercase shrink-0">
                      <i className="fa-solid fa-taxi mr-1"></i>Transporte
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de configuração de custos por serviço */}
      {isCostModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="bg-orange-500 p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black">Custo padrão por serviço</h3>
                <p className="text-orange-100 text-xs font-medium">Usado no bloco de Custos com Pacotes</p>
              </div>
              <button onClick={() => setIsCostModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {servicosCusto.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700 truncate">{s.nome}</span>
                  <div className="relative w-32 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">R$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={s.custo_padrao}
                      onChange={(e) => {
                        const value = e.target.value;
                        setServicosCusto((prev) => prev.map((item, i) => (i === idx ? { ...item, custo_padrao: value } : item)));
                      }}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsCostModalOpen(false)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">
                Cancelar
              </button>
              <button
                onClick={saveCustos}
                disabled={savingCustos}
                className="px-8 py-3 bg-orange-500 text-white rounded-xl font-black text-[11px] uppercase shadow-lg shadow-orange-500/20"
              >
                {savingCustos ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardGerencial;
