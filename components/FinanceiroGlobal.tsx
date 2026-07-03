import React, { useCallback, useEffect, useState } from 'react';
import { Unit } from '../types';
import { formatCurrencyBR, formatDecimalBR } from '../services/appointmentTotals';
import {
  FinanceiroFiltros,
  FinanceiroKpis,
  FluxoDiarioPonto,
  LinhaServicoValor,
  FormaPagamentoValor,
  Fidelidade,
  ContaPendente,
  getFiltrosDefault,
  calcularVariacao,
  fetchFinanceiroKpis,
  fetchFluxoDiario,
  fetchFaturamentoPorLinha,
  fetchFormasPagamentoFinanceiro,
  fetchFidelidade,
  fetchContasPendentes
} from '../services/financeiroGeral';
import FinanceStatusBar from './FinanceiroGeral/FinanceStatusBar';
import FinanceiroFiltersCard from './FinanceiroGeral/FinanceiroFiltersCard';
import FinanceKpiCard from './FinanceiroGeral/FinanceKpiCard';
import CashFlowLineChart from './FinanceiroGeral/CashFlowLineChart';
import ServiceTypeBarChart from './FinanceiroGeral/ServiceTypeBarChart';
import FidelidadeCard from './FinanceiroGeral/FidelidadeCard';
import ContasReceberCard from './FinanceiroGeral/ContasReceberCard';
import ContasReceberModal from './FinanceiroGeral/ContasReceberModal';
import CardSkeleton from './Dashboard/CardSkeleton';
import SectionTitle from './Dashboard/SectionTitle';
import SimpleDonut from './Dashboard/SimpleDonut';

interface FinanceiroGlobalProps {
  units: Unit[];
  supabaseClient: any;
}

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

const FinanceiroGlobal: React.FC<FinanceiroGlobalProps> = ({ units, supabaseClient }) => {
  const [filtros, setFiltros] = useState<FinanceiroFiltros>(() => getFiltrosDefault(units.length === 1 ? units[0].id : null));
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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

  const [contasPendentes, setContasPendentes] = useState<ContaPendente[]>([]);
  const [contasPendentesLoading, setContasPendentesLoading] = useState(true);

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

    setContasPendentesLoading(true);
    fetchContasPendentes(supabaseClient, filtros)
      .then(setContasPendentes)
      .catch((err) => console.error('Erro ao carregar contas a receber:', err))
      .finally(() => setContasPendentesLoading(false));
  }, [supabaseClient, filtros]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const handleSync = () => {
    setSyncing(true);
    carregarTudo();
    setTimeout(() => setSyncing(false), 600);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <FinanceStatusBar syncing={syncing} onSync={handleSync} />

      <FinanceiroFiltersCard units={units} filtros={filtros} onChangeFiltros={setFiltros} />

      {kpisError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {kpisError}
        </div>
      )}

      {/* Linha: 6 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <FinanceKpiCard
          label="Faturamento"
          value={formatCurrencyBR(kpis?.faturamentoAtual ?? 0)}
          icon="fa-sack-dollar"
          barColor="purple"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.faturamentoAtual, kpis.faturamentoAnterior) : undefined}
        />
        <FinanceKpiCard
          label="Recebido"
          value={formatCurrencyBR(kpis?.recebidoAtual ?? 0)}
          icon="fa-hand-holding-dollar"
          barColor="green"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.recebidoAtual, kpis.recebidoAnterior) : undefined}
        />
        <FinanceKpiCard
          label="A Receber"
          value={formatCurrencyBR(kpis?.aReceberPeriodo ?? 0)}
          subtext="Previsão de entrada"
          icon="fa-hourglass-half"
          barColor="orange"
          loading={kpisLoading}
        />
        <FinanceKpiCard
          label="Custos"
          value={formatCurrencyBR(kpis?.custosAtual ?? 0)}
          subtext="Despesas operacionais"
          subtextTone="red"
          icon="fa-file-invoice-dollar"
          barColor="red"
          valueTone="red"
          loading={kpisLoading}
        />
        <FinanceKpiCard
          label="Lucro"
          value={formatCurrencyBR(kpis?.lucroAtual ?? 0)}
          icon="fa-chart-line"
          barColor="green"
          valueTone="green"
          loading={kpisLoading}
          trend={kpis ? trendFrom(kpis.lucroAtual, kpis.lucroAnterior) : undefined}
        />
        <FinanceKpiCard
          label="Inadimplência"
          value={`${formatDecimalBR(kpis?.inadimplenciaPct ?? 0)}%`}
          subtext={`${formatCurrencyBR(kpis?.vencidoTotal ?? 0)} em aberto`}
          subtextTone="red"
          icon="fa-triangle-exclamation"
          barColor="red"
          valueTone="red"
          loading={kpisLoading}
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

      {/* Linha: Contas a Receber */}
      <ContasReceberCard
        items={contasPendentes}
        loading={contasPendentesLoading}
        onVerTodas={() => setModalOpen(true)}
      />

      <ContasReceberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        items={contasPendentes}
        loading={contasPendentesLoading}
      />
    </div>
  );
};

export default FinanceiroGlobal;
