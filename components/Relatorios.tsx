import React, { useCallback, useEffect, useState } from 'react';
import { Unit } from '../types';
import { formatCurrencyBR } from '../services/appointmentTotals';
import { getDefaultPeriodo, getTodayBR } from '../services/dashboardGerencial';
import {
  RelatorioFiltros,
  AtendimentoPorServico,
  ProfissionalResumo,
  ClienteResumo,
  TaxiResumo,
  PendenciaResumo,
  PacotesResumoPeriodo,
  CancelamentoResumo,
  DespesaPorCategoria,
  fetchRelatorioAtendimentosPorServico,
  fetchRelatorioPorProfissional,
  fetchRelatorioPorCliente,
  fetchRelatorioTaxi,
  fetchRelatorioInadimplencia,
  fetchRelatorioPacotes,
  fetchRelatorioCancelamentos,
  fetchRelatorioDespesasPorCategoria
} from '../services/relatorios';
import ReportTable from './Relatorios/ReportTable';
import StatTile from './Dashboard/StatTile';
import SectionTitle from './Dashboard/SectionTitle';
import CardSkeleton from './Dashboard/CardSkeleton';

interface RelatoriosProps {
  units: Unit[];
  supabaseClient: any;
}

type RelatorioId =
  | 'atendimentos_servico'
  | 'por_profissional'
  | 'por_cliente'
  | 'taxi'
  | 'inadimplencia'
  | 'pacotes'
  | 'cancelamentos'
  | 'despesas';

const RELATORIOS: { id: RelatorioId; label: string; icon: string }[] = [
  { id: 'atendimentos_servico', label: 'Atendimentos por Serviço', icon: 'fa-shower' },
  { id: 'por_profissional', label: 'Por Profissional', icon: 'fa-user-nurse' },
  { id: 'por_cliente', label: 'Por Cliente', icon: 'fa-users' },
  { id: 'taxi', label: 'Táxi Dog', icon: 'fa-taxi' },
  { id: 'inadimplencia', label: 'Inadimplência', icon: 'fa-triangle-exclamation' },
  { id: 'pacotes', label: 'Pacotes', icon: 'fa-box-open' },
  { id: 'cancelamentos', label: 'Cancelamentos e No-show', icon: 'fa-calendar-xmark' },
  { id: 'despesas', label: 'Despesas por Categoria', icon: 'fa-receipt' }
];

const Relatorios: React.FC<RelatoriosProps> = ({ units, supabaseClient }) => {
  const defaultPeriodo = getDefaultPeriodo();
  const [filtros, setFiltros] = useState<RelatorioFiltros>({
    unidadeId: units.length === 1 ? units[0].id : null,
    dataInicio: defaultPeriodo.dataInicio,
    dataFim: getTodayBR()
  });
  const [aba, setAba] = useState<RelatorioId>('atendimentos_servico');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [atendimentos, setAtendimentos] = useState<AtendimentoPorServico[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalResumo[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [taxi, setTaxi] = useState<TaxiResumo[]>([]);
  const [inadimplencia, setInadimplencia] = useState<PendenciaResumo[]>([]);
  const [pacotes, setPacotes] = useState<PacotesResumoPeriodo | null>(null);
  const [cancelamentos, setCancelamentos] = useState<CancelamentoResumo[]>([]);
  const [despesas, setDespesas] = useState<DespesaPorCategoria[]>([]);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);

    const tarefa = (() => {
      switch (aba) {
        case 'atendimentos_servico': return fetchRelatorioAtendimentosPorServico(supabaseClient, filtros).then(setAtendimentos);
        case 'por_profissional': return fetchRelatorioPorProfissional(supabaseClient, filtros).then(setProfissionais);
        case 'por_cliente': return fetchRelatorioPorCliente(supabaseClient, filtros).then(setClientes);
        case 'taxi': return fetchRelatorioTaxi(supabaseClient, filtros).then(setTaxi);
        case 'inadimplencia': return fetchRelatorioInadimplencia(supabaseClient, filtros).then(setInadimplencia);
        case 'pacotes': return fetchRelatorioPacotes(supabaseClient, filtros).then(setPacotes);
        case 'cancelamentos': return fetchRelatorioCancelamentos(supabaseClient, filtros).then(setCancelamentos);
        case 'despesas': return fetchRelatorioDespesasPorCategoria(supabaseClient, filtros).then(setDespesas);
        default: return Promise.resolve();
      }
    })();

    tarefa
      .catch((err: any) => { console.error('Erro ao carregar relatório:', err); setErro(err?.message || 'Falha ao carregar relatório.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, filtros, aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const unidadeNomeFiltro = filtros.unidadeId !== null ? (units.find((u) => u.id === filtros.unidadeId)?.name ?? '') : 'Todas as unidades';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-6 flex-wrap mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 bg-slate-900 text-teal-400 rounded-2xl flex items-center justify-center shrink-0">
              <i className="fa-solid fa-file-lines text-2xl"></i>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">Central de Relatórios</h2>
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest truncate">{unidadeNomeFiltro}</p>
            </div>
          </div>

          <div className="flex items-end gap-4 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 flex-wrap">
            <label className="space-y-1.5">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Unidade</span>
              <select
                value={filtros.unidadeId ?? ''}
                onChange={(e) => setFiltros((f) => ({ ...f, unidadeId: e.target.value === '' ? null : Number(e.target.value) }))}
                className="bg-transparent font-bold text-sm text-slate-800 outline-none max-w-[160px]"
              >
                <option value="">Todas as unidades</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Data início</span>
              <input
                type="date"
                value={filtros.dataInicio}
                onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
                className="bg-transparent font-bold text-sm text-slate-800 outline-none"
              />
            </label>
            <span className="text-slate-300 text-xs font-bold uppercase pb-2">até</span>
            <label className="space-y-1.5">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Data término</span>
              <input
                type="date"
                value={filtros.dataFim}
                onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
                className="bg-transparent font-bold text-sm text-slate-800 outline-none"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {RELATORIOS.map((r) => (
            <button
              key={r.id}
              onClick={() => setAba(r.id)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${aba === r.id ? 'bg-[#00BFA5] text-white shadow-sm' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`fa-solid ${r.icon}`}></i>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      {aba === 'atendimentos_servico' && (
        <ReportTable
          title="Atendimentos por Serviço"
          subtitle="Contagem e faturamento de atendimentos finalizados no período, por serviço"
          filenameBase="atendimentos_por_servico"
          loading={loading}
          rows={atendimentos}
          totals={[{ key: 'qtd' }, { key: 'faturamento', format: formatCurrencyBR }]}
          columns={[
            { key: 'servico', label: 'Serviço' },
            { key: 'qtd', label: 'Qtd.', align: 'right' },
            { key: 'faturamento', label: 'Faturamento', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'por_profissional' && (
        <ReportTable
          title="Por Profissional"
          subtitle="Atendimentos avulsos finalizados com funcionário vinculado, com comissão apurada (quando houver regra cadastrada)"
          filenameBase="por_profissional"
          loading={loading}
          rows={profissionais}
          totals={[{ key: 'qtdAtendimentos' }, { key: 'faturamento', format: formatCurrencyBR }, { key: 'comissao', format: formatCurrencyBR }]}
          columns={[
            { key: 'funcionarioNome', label: 'Profissional' },
            { key: 'qtdAtendimentos', label: 'Atendimentos', align: 'right' },
            { key: 'faturamento', label: 'Faturamento', align: 'right', format: formatCurrencyBR },
            { key: 'comissao', label: 'Comissão', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'por_cliente' && (
        <ReportTable
          title="Por Cliente"
          subtitle="Faturamento e quantidade de atendimentos no período, por cliente"
          filenameBase="por_cliente"
          loading={loading}
          rows={clientes}
          totals={[{ key: 'qtdEventos' }, { key: 'faturamento', format: formatCurrencyBR }]}
          columns={[
            { key: 'clienteNome', label: 'Cliente' },
            { key: 'qtdEventos', label: 'Atendimentos', align: 'right' },
            { key: 'faturamento', label: 'Faturamento', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'taxi' && (
        <ReportTable
          title="Táxi Dog"
          subtitle="Viagens finalizadas, receita e custo por unidade. Sem distinção busca/entrega (não é um campo do sistema hoje)."
          filenameBase="taxi_dog"
          loading={loading}
          rows={taxi}
          totals={[{ key: 'viagens' }, { key: 'receita', format: formatCurrencyBR }, { key: 'custo', format: formatCurrencyBR }, { key: 'margem', format: formatCurrencyBR }]}
          columns={[
            { key: 'unidadeNome', label: 'Unidade' },
            { key: 'viagens', label: 'Viagens', align: 'right' },
            { key: 'receita', label: 'Receita', align: 'right', format: formatCurrencyBR },
            { key: 'custo', label: 'Custo', align: 'right', format: formatCurrencyBR },
            { key: 'margem', label: 'Margem', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'inadimplencia' && (
        <ReportTable
          title="Inadimplência"
          subtitle="Pendências vencidas no período (mesma fonte da aba Contas a Receber do Financeiro Geral)"
          filenameBase="inadimplencia"
          loading={loading}
          rows={inadimplencia}
          totals={[{ key: 'valor', format: formatCurrencyBR }]}
          columns={[
            { key: 'clienteNome', label: 'Cliente' },
            { key: 'petNome', label: 'Pet' },
            { key: 'categoria', label: 'Categoria' },
            { key: 'vencimento', label: 'Vencimento', format: (v: string) => v ? v.split('-').reverse().join('/') : '' },
            { key: 'valor', label: 'Valor', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'pacotes' && (
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Pacotes do Período" subtitle="Vendidos, concluídos e renovados no período. Não renovados é um indicador de estado atual (não varia com o período)." />
          <div className="mt-4">
            {loading ? (
              <CardSkeleton height={160} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatTile label="Vendidos" value={pacotes?.vendidosQtd ?? 0} tone="violet" />
                <StatTile label="Valor vendido" value={formatCurrencyBR(pacotes?.vendidosValor ?? 0)} />
                <StatTile label="Concluídos" value={pacotes?.concluidosQtd ?? 0} tone="violet" />
                <StatTile label="Renovados" value={pacotes?.renovadosQtd ?? 0} />
                <StatTile label="Não renovaram (atual)" value={pacotes?.naoRenovadosQtd ?? 0} tone="rose" />
              </div>
            )}
          </div>
        </div>
      )}

      {aba === 'cancelamentos' && (
        <ReportTable
          title="Cancelamentos e No-show"
          subtitle="Agendamentos cancelados no período. O sistema não distingue no-show de cancelamento comum hoje (só existe o status 'Cancelado')."
          filenameBase="cancelamentos"
          loading={loading}
          rows={cancelamentos}
          totals={[{ key: 'valorTotal', format: formatCurrencyBR }]}
          columns={[
            { key: 'dataAgendamento', label: 'Data', format: (v: string) => v ? v.split('-').reverse().join('/') : '' },
            { key: 'clienteNome', label: 'Cliente' },
            { key: 'petNome', label: 'Pet' },
            { key: 'unidadeNome', label: 'Unidade' },
            { key: 'valorTotal', label: 'Valor', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}

      {aba === 'despesas' && (
        <ReportTable
          title="Despesas por Categoria"
          subtitle="Despesas pagas no período, agrupadas por categoria"
          filenameBase="despesas_por_categoria"
          loading={loading}
          rows={despesas}
          totals={[{ key: 'qtd' }, { key: 'valor', format: formatCurrencyBR }]}
          columns={[
            { key: 'categoria', label: 'Categoria' },
            { key: 'qtd', label: 'Qtd.', align: 'right' },
            { key: 'valor', label: 'Valor', align: 'right', format: formatCurrencyBR }
          ]}
        />
      )}
    </div>
  );
};

export default Relatorios;
