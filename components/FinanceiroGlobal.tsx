import React, { useCallback, useEffect, useState } from 'react';
import { Unit, UserProfile } from '../types';
import { formatCurrencyBR } from '../services/appointmentTotals';
import {
  FinanceiroFiltros,
  FinanceiroKpis,
  FluxoDiarioPonto,
  LinhaServicoValor,
  FormaPagamentoValor,
  Fidelidade,
  getFiltrosDefault,
  calcularVariacao,
  fetchFinanceiroKpis,
  fetchFluxoDiario,
  fetchFaturamentoPorLinha,
  fetchFormasPagamentoFinanceiro,
  fetchFidelidade
} from '../services/financeiroGeral';
import FinanceStatusBar from './FinanceiroGeral/FinanceStatusBar';
import BaixarRelatorioButton from './FinanceiroGeral/BaixarRelatorioButton';
import { RelatorioFinanceiroEntrada } from '../services/financeiroRelatorio';
import FinanceiroFiltersCard from './FinanceiroGeral/FinanceiroFiltersCard';
import FinanceKpiCard from './FinanceiroGeral/FinanceKpiCard';
import CashFlowLineChart from './FinanceiroGeral/CashFlowLineChart';
import ServiceTypeBarChart from './FinanceiroGeral/ServiceTypeBarChart';
import FidelidadeCard from './FinanceiroGeral/FidelidadeCard';
import CardSkeleton from './Dashboard/CardSkeleton';
import SectionTitle from './Dashboard/SectionTitle';
import SimpleDonut from './Dashboard/SimpleDonut';
import ContasReceberTab from './FinanceiroGeral/ContasReceberTab';
import ContasPagarTab from './FinanceiroGeral/ContasPagarTab';
import DreTab from './FinanceiroGeral/DreTab';
import ProjecaoCaixaTab from './FinanceiroGeral/ProjecaoCaixaTab';

interface FinanceiroGlobalProps {
  units: Unit[];
  supabaseClient: any;
  userProfile?: UserProfile;
  /** Aba inicial ao navegar já filtrado (ex: "Pendências a cobrar" do Dashboard). */
  initialAba?: string;
}

type FinanceiroGlobalAba = 'visao_geral' | 'contas_a_receber' | 'contas_a_pagar' | 'dre' | 'projecao_caixa';

const ABAS: { id: FinanceiroGlobalAba; label: string }[] = [
  { id: 'visao_geral', label: 'Visão Geral' },
  { id: 'contas_a_receber', label: 'Contas a Receber' },
  { id: 'contas_a_pagar', label: 'Contas a Pagar' },
  { id: 'dre', label: 'DRE Mensal' },
  { id: 'projecao_caixa', label: 'Projeção de Caixa' }
];

const FORMA_PAGAMENTO_COR: Record<string, string> = {
  Pix: '#10B981',
  Dinheiro: '#0EA5E9',
  Débito: '#7C3AED',
  Crédito: '#F59E0B',
  Transferência: '#EC4899',
  Outro: '#94A3B8',
  'Não informado': '#CBD5E1'
};

const trendFrom = (atual: number, anterior: number) => ({
  value: Math.abs(calcularVariacao(atual, anterior)),
  direction: (atual >= anterior ? 'up' : 'down') as 'up' | 'down'
});

const FinanceiroGlobal: React.FC<FinanceiroGlobalProps> = ({ units, supabaseClient, userProfile, initialAba }) => {
  const [filtros, setFiltros] = useState<FinanceiroFiltros>(() => getFiltrosDefault(units.length === 1 ? units[0].id : null));
  const [syncing, setSyncing] = useState(false);
  const [aba, setAba] = useState<FinanceiroGlobalAba>((initialAba as FinanceiroGlobalAba) || 'visao_geral');

  useEffect(() => {
    if (initialAba) setAba(initialAba as FinanceiroGlobalAba);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAba]);

  const [kpis, setKpis] = useState<FinanceiroKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);

  const [fluxoDiario, setFluxoDiario] = useState<FluxoDiarioPonto[]>([]);
  const [fluxoDiarioLoading, setFluxoDiarioLoading] = useState(true);

  const [porLinha, setPorLinha] = useState<LinhaServicoValor[]>([]);
  const [porLinhaLoading, setPorLinhaLoading] = useState(true);

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoValor[]>([]);
  const [formasPagamentoLoading, setFormasPagamentoLoading] = useState(true);

  const [fidelidade, setFidelidade] = useState<Fidelidade | null>(null);
  const [fidelidadeLoading, setFidelidadeLoading] = useState(true);

  const carregarTudo = useCallback(() => {
    setKpisLoading(true);
    setKpisError(null);
    fetchFinanceiroKpis(supabaseClient, filtros)
      .then(setKpis)
      .catch((err) => { console.error('Erro ao carregar KPIs do Financeiro Geral:', err); setKpisError(err?.message || 'Falha ao carregar KPIs.'); })
      .finally(() => setKpisLoading(false));

    setFluxoDiarioLoading(true);
    fetchFluxoDiario(supabaseClient, filtros)
      .then(setFluxoDiario)
      .catch((err) => console.error('Erro ao carregar fluxo financeiro diário:', err))
      .finally(() => setFluxoDiarioLoading(false));

    setPorLinhaLoading(true);
    fetchFaturamentoPorLinha(supabaseClient, filtros)
      .then(setPorLinha)
      .catch((err) => console.error('Erro ao carregar faturamento por linha de serviço:', err))
      .finally(() => setPorLinhaLoading(false));

    setFormasPagamentoLoading(true);
    fetchFormasPagamentoFinanceiro(supabaseClient, filtros)
      .then(setFormasPagamento)
      .catch((err) => console.error('Erro ao carregar formas de pagamento:', err))
      .finally(() => setFormasPagamentoLoading(false));

    setFidelidadeLoading(true);
    fetchFidelidade(supabaseClient, filtros)
      .then(setFidelidade)
      .catch((err) => console.error('Erro ao carregar fidelidade pacotes x avulsos:', err))
      .finally(() => setFidelidadeLoading(false));
  }, [supabaseClient, filtros]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const handleSync = () => {
    setSyncing(true);
    carregarTudo();
    setTimeout(() => setSyncing(false), 600);
  };

  const relatorioCarregando = kpisLoading || fluxoDiarioLoading || porLinhaLoading || formasPagamentoLoading || fidelidadeLoading;
  const relatorioEntrada: RelatorioFinanceiroEntrada | null = kpis
    ? {
        unidadeNome: filtros.unidadeId
          ? units.find((u) => u.id === filtros.unidadeId)?.name || 'Unidade selecionada'
          : 'Todas as unidades',
        filtros,
        kpis,
        fluxoDiario,
        porLinha,
        formasPagamento,
        fidelidade
      }
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <FinanceStatusBar
        syncing={syncing}
        onSync={handleSync}
        actions={<BaixarRelatorioButton entrada={relatorioEntrada} carregando={relatorioCarregando} />}
      />

      <FinanceiroFiltersCard units={units} filtros={filtros} onChangeFiltros={setFiltros} />

      <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aba === a.id ? 'bg-[#00BFA5] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'contas_a_receber' && (
        <ContasReceberTab unidadeId={filtros.unidadeId} supabaseClient={supabaseClient} userProfile={userProfile} />
      )}
      {aba === 'contas_a_pagar' && (
        <ContasPagarTab unidadeId={filtros.unidadeId} supabaseClient={supabaseClient} />
      )}
      {aba === 'dre' && (
        <DreTab unidadeId={filtros.unidadeId} supabaseClient={supabaseClient} />
      )}
      {aba === 'projecao_caixa' && (
        <ProjecaoCaixaTab unidadeId={filtros.unidadeId} supabaseClient={supabaseClient} />
      )}

      {aba === 'visao_geral' && (
      <>
      {kpisError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {kpisError}
        </div>
      )}

      {/* Linha: KPIs (regime de caixa — o que entrou/saiu de fato no período selecionado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <FinanceKpiCard
          label="Entradas"
          value={formatCurrencyBR(kpis?.recebidoAtual ?? 0)}
          subtext="Recebido dentro do período selecionado"
          icon="fa-hand-holding-dollar"
          barColor="green"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.recebidoAtual, kpis.recebidoAnterior) : undefined}
        />
        <FinanceKpiCard
          label="Saídas"
          value={formatCurrencyBR(kpis?.custosAtual ?? 0)}
          subtext="Despesas do período selecionado"
          subtextTone="red"
          icon="fa-file-invoice-dollar"
          barColor="red"
          valueTone="red"
          loading={kpisLoading}
        />
        <FinanceKpiCard
          label="Caixa"
          value={formatCurrencyBR(kpis?.lucroAtual ?? 0)}
          subtext="Entradas - Saídas do período"
          icon="fa-vault"
          barColor="green"
          valueTone="green"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.lucroAtual, kpis.lucroAnterior) : undefined}
        />
      </div>

      {/* Linha: Fluxo financeiro diário + Por tipo de serviço */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Fluxo Financeiro Diário" subtitle="Balanço temporal de Entradas, Custos e Lucro Líquido" />
          <div className="mt-4">
            {fluxoDiarioLoading ? <CardSkeleton height={260} /> : <CashFlowLineChart data={fluxoDiario} />}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Por Tipo de Serviço" subtitle="Faturamento bruto das principais linhas operacionais" />
          <div className="mt-4">
            {porLinhaLoading ? <CardSkeleton height={220} /> : <ServiceTypeBarChart data={porLinha} />}
          </div>
        </div>
      </div>

      {/* Linha: Formas de pagamento + Fidelidade */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Formas de Pagamento" subtitle="Adesão dos clientes aos métodos de pagamento integrados" />
          <div className="mt-4">
            <SimpleDonut
              loading={formasPagamentoLoading}
              centerLabel="Total Recebido"
              emptyLabel="Nenhum recebimento"
              data={formasPagamento.map((f) => ({ label: f.forma, valor: f.valor, cor: FORMA_PAGAMENTO_COR[f.forma] || '#94A3B8' }))}
            />
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Fidelidade: Pacotes x Avulsos" subtitle="Comparação proporcional entre faturamento recorrente e atendimentos individuais" />
          <div className="mt-4">
            <FidelidadeCard data={fidelidade} loading={fidelidadeLoading} />
          </div>
        </div>
      </div>
      </>
      )}

    </div>
  );
};

export default FinanceiroGlobal;
