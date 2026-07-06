import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Unit, UserProfile } from '../types';
import GastosModal from './GastosModal';
import ContaRecorrenteModal from './Gastos/ContaRecorrenteModal';
import PagarDespesaModal from './Gastos/PagarDespesaModal';
import CategoriasModal from './Gastos/CategoriasModal';
import GastoKpiCard from './Gastos/GastoKpiCard';
import GastosCategoriaDonut from './Gastos/GastosCategoriaDonut';
import RevenueLineChart from './Dashboard/RevenueLineChart';
import SectionTitle from './Dashboard/SectionTitle';
import CardSkeleton from './Dashboard/CardSkeleton';
import { thClass, thClassRight } from './Dashboard/tableClasses';
import { formatCurrencyBR, formatDecimalBR } from '../services/appointmentTotals';
import { registrarAtividade } from '../services/logger';
import {
  GastosFiltros,
  GastosKpis,
  GastoPontoPeriodo,
  GastoCategoriaValor,
  CombustivelResumo,
  FolhaResumo,
  DespesaPendente,
  ContaFixaRecorrente,
  LancamentoDespesa,
  CategoriaDespesa,
  Granularidade,
  getFiltrosDefault,
  getTodayBR,
  fetchCategorias,
  fetchGastosKpis,
  fetchGastosEvolucao,
  fetchGastosPorCategoria,
  fetchCombustivelResumo,
  fetchFolhaResumo,
  fetchProximosVencimentos,
  fetchContasFixasRecorrentes,
  fetchLancamentos,
  excluirDespesa,
  gerarPendenciasDoMes,
  trendGastoFrom
} from '../services/gastos';

interface GastosProps {
  unit: Unit;
  units?: Unit[];
  supabaseClient: any;
  userProfile?: UserProfile;
}

const FORMAS_PAGAMENTO_OPCOES = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Outro'];

const Gastos: React.FC<GastosProps> = ({ unit, units, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const listaUnidades = units && units.length > 0 ? units : [unit];

  const [filtros, setFiltros] = useState<GastosFiltros>(() => getFiltrosDefault(unit.id));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoriasModalOpen, setIsCategoriasModalOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<Partial<ContaFixaRecorrente> | null | undefined>(undefined);
  const [pagandoDespesa, setPagandoDespesa] = useState<{ id: number; descricao: string; valor: number } | null>(null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState<number | null>(null);

  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);

  const [kpis, setKpis] = useState<GastosKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [evolucao, setEvolucao] = useState<GastoPontoPeriodo[]>([]);
  const [evolucaoLoading, setEvolucaoLoading] = useState(true);

  const [porCategoria, setPorCategoria] = useState<GastoCategoriaValor[]>([]);
  const [porCategoriaLoading, setPorCategoriaLoading] = useState(true);

  const [combustivel, setCombustivel] = useState<CombustivelResumo | null>(null);
  const [folha, setFolha] = useState<FolhaResumo | null>(null);
  const [proximosVencimentos, setProximosVencimentos] = useState<DespesaPendente[]>([]);
  const [contasFixas, setContasFixas] = useState<ContaFixaRecorrente[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoDespesa[]>([]);
  const [lancamentosLoading, setLancamentosLoading] = useState(true);

  const [verTodasContas, setVerTodasContas] = useState(false);
  const [verTodosLancamentos, setVerTodosLancamentos] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(new Date());

  const carregarTudo = useCallback(async () => {
    setKpisLoading(true);
    fetchGastosKpis(supabaseClient, filtros).then(setKpis).catch((err) => console.error('Erro ao carregar KPIs de gastos:', err)).finally(() => setKpisLoading(false));

    setEvolucaoLoading(true);
    fetchGastosEvolucao(supabaseClient, filtros, granularidade).then(setEvolucao).catch((err) => console.error('Erro ao carregar evolução de gastos:', err)).finally(() => setEvolucaoLoading(false));

    setPorCategoriaLoading(true);
    fetchGastosPorCategoria(supabaseClient, filtros).then(setPorCategoria).catch((err) => console.error('Erro ao carregar gastos por categoria:', err)).finally(() => setPorCategoriaLoading(false));

    fetchCombustivelResumo(supabaseClient, filtros).then(setCombustivel).catch((err) => console.error('Erro ao carregar resumo de combustível:', err));
    fetchFolhaResumo(supabaseClient, filtros.unidadeId, filtros.dataInicio, filtros.dataFim).then(setFolha).catch((err) => console.error('Erro ao carregar resumo de folha:', err));
    fetchProximosVencimentos(supabaseClient, filtros.unidadeId, verTodasContas ? 100 : 6).then(setProximosVencimentos).catch((err) => console.error('Erro ao carregar próximos vencimentos:', err));
    fetchContasFixasRecorrentes(supabaseClient, filtros.unidadeId).then(setContasFixas).catch((err) => console.error('Erro ao carregar contas fixas:', err));

    setLancamentosLoading(true);
    fetchLancamentos(supabaseClient, filtros, verTodosLancamentos ? 500 : 8).then(setLancamentos).catch((err) => console.error('Erro ao carregar lançamentos:', err)).finally(() => setLancamentosLoading(false));

    setUltimaAtualizacao(new Date());
  }, [supabaseClient, filtros, granularidade, verTodasContas, verTodosLancamentos]);

  useEffect(() => {
    fetchCategorias(supabaseClient).then(setCategorias).catch((err) => console.error('Erro ao carregar categorias:', err));
  }, [supabaseClient]);

  useEffect(() => {
    // Gera as pendências do mês corrente a partir das contas fixas ativas (idempotente) antes de carregar os dados.
    gerarPendenciasDoMes(supabaseClient, filtros.unidadeId, getTodayBR())
      .catch((err) => console.error('Erro ao gerar pendências recorrentes:', err))
      .finally(() => { carregarTudo(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.unidadeId]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const trendFrom = (atual: number, anterior: number) => trendGastoFrom(atual, anterior);

  const handleDelete = async () => {
    if (!confirmacaoExclusao) return;
    try {
      await excluirDespesa(supabaseClient, confirmacaoExclusao);
      registrarAtividade(unit.id, userProfile?.email || 'sistema', 'EXCLUIR_GASTO', `Excluiu um lançamento de gasto (ID: ${confirmacaoExclusao})`, userProfile?.nome, userProfile?.cargo);
      setConfirmacaoExclusao(null);
      carregarTudo();
    } catch (err: any) {
      alert('Erro ao excluir lançamento: ' + (err.message || ''));
    }
  };

  const formatDateBR = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const unidadeSelecionadaNome = filtros.unidadeId !== null
    ? (listaUnidades.find((u) => u.id === filtros.unidadeId)?.name ?? unit.name)
    : 'Todas as unidades';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-5">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shrink-0">
            <i className="fa-solid fa-cart-shopping"></i>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Gastos</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Controle de custos fixos, variáveis e operacionais</p>
          </div>
        </div>
      </header>

      {/* Barra de filtros */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início do período</span>
            <input type="date" value={filtros.dataInicio} onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fim do período</span>
            <input type="date" value={filtros.dataFim} onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</span>
            <select value={filtros.unidadeId ?? 'todas'} onChange={(e) => setFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none">
              <option value="todas">Todas</option>
              {listaUnidades.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</span>
            <select value={filtros.categoriaId ?? 'todas'} onChange={(e) => setFiltros((f) => ({ ...f, categoriaId: e.target.value === 'todas' ? null : Number(e.target.value) }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none">
              <option value="todas">Todas</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de pagamento</span>
            <select value={filtros.formaPagamento} onChange={(e) => setFiltros((f) => ({ ...f, formaPagamento: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none">
              <option value="todas">Todas</option>
              {FORMAS_PAGAMENTO_OPCOES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Tipo</span>
            <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
              {(['todos', 'fixo', 'variavel'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFiltros((f) => ({ ...f, tipo: t }))}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${filtros.tipo === t ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                >
                  {t === 'todos' ? 'Todos' : t === 'fixo' ? 'Fixo' : 'Variável'}
                </button>
              ))}
            </div>
            <button onClick={() => setIsCategoriasModalOpen(true)} className="ml-2 text-[10px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest">
              <i className="fa-solid fa-gear mr-1.5"></i> Categorias
            </button>
          </div>

          {!isReadOnly && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#1E1E1E] hover:bg-black text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center"
            >
              <i className="fa-solid fa-plus mr-3"></i> Lançar Despesa
            </button>
          )}
        </div>
      </div>

      {/* 6 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <GastoKpiCard label="Total do Mês" value={formatCurrencyBR(kpis?.totalAtual ?? 0)} icon="fa-sack-dollar" loading={kpisLoading} trend={kpis ? trendFrom(kpis.totalAtual, kpis.totalAnterior) : undefined} />
        <GastoKpiCard label="Custos Fixos" value={formatCurrencyBR(kpis?.fixosAtual ?? 0)} icon="fa-house-chimney" loading={kpisLoading} trend={kpis ? trendFrom(kpis.fixosAtual, kpis.fixosAnterior) : undefined} />
        <GastoKpiCard label="Custos Variáveis" value={formatCurrencyBR(kpis?.variaveisAtual ?? 0)} icon="fa-chart-line" loading={kpisLoading} trend={kpis ? trendFrom(kpis.variaveisAtual, kpis.variaveisAnterior) : undefined} />
        <GastoKpiCard label="Folha de Pagamento" value={formatCurrencyBR(kpis?.folhaAtual ?? 0)} icon="fa-users" loading={kpisLoading} trend={kpis ? trendFrom(kpis.folhaAtual, kpis.folhaAnterior) : undefined} />
        <GastoKpiCard label="Combustível/Transporte" value={formatCurrencyBR(kpis?.combustivelAtual ?? 0)} icon="fa-gas-pump" loading={kpisLoading} trend={kpis ? trendFrom(kpis.combustivelAtual, kpis.combustivelAnterior) : undefined} />
        <GastoKpiCard label="Insumos e Manutenção" value={formatCurrencyBR(kpis?.insumosManutencaoAtual ?? 0)} icon="fa-boxes-stacked" loading={kpisLoading} trend={kpis ? trendFrom(kpis.insumosManutencaoAtual, kpis.insumosManutencaoAnterior) : undefined} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
            <SectionTitle title="Evolução dos Gastos" subtitle="Total de gastos pagos por período" />
            <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
              {(['dia', 'semana', 'mes'] as Granularidade[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularidade(g)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${granularidade === g ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>
          {evolucaoLoading ? <CardSkeleton height={260} /> : (
            <RevenueLineChart data={evolucao} color="#10B981" seriesLabel="Gastos" gradientId="gastosEvolucaoGradient" emptyLabel="Sem gastos pagos no período." />
          )}
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <SectionTitle title="Gastos por Categoria" subtitle="Distribuição dos gastos pagos" />
          <div className="mt-4">
            <GastosCategoriaDonut data={porCategoria} loading={porCategoriaLoading} />
          </div>
        </div>
      </div>

      {/* Coluna lateral + tabelas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Coluna lateral (3 cards) */}
        <div className="space-y-5">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <SectionTitle title="Combustível" subtitle="Litros, KM e custo por viagem" />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Litros</p>
                <p className="text-lg font-black text-slate-800">{formatDecimalBR(combustivel?.litrosTotal ?? 0)}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">KM rodados</p>
                <p className="text-lg font-black text-slate-800">{formatDecimalBR(combustivel?.kmTotal ?? 0)}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo médio/km</p>
                <p className="text-lg font-black text-slate-800">{formatCurrencyBR(combustivel?.custoMedioKm ?? 0)}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total período</p>
                <p className="text-lg font-black text-rose-600">{formatCurrencyBR(combustivel?.custoTotal ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <SectionTitle title="Funcionários" subtitle="Folha de pagamento do período" />
            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>Total da folha</span>
                <span className="text-slate-800 font-black">{formatCurrencyBR(folha?.totalFolha ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>Adiantamentos</span>
                <span className="text-slate-800 font-black">{formatCurrencyBR(folha?.adiantamentos ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>Encargos</span>
                <span className="text-slate-800 font-black">{formatCurrencyBR(folha?.encargos ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-500 pt-3 border-t border-slate-50">
                <span>Salários pagos</span>
                <span className="text-emerald-600 font-black">{formatCurrencyBR(folha?.salariosPagos ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <SectionTitle title="Próximos Vencimentos" subtitle="Contas pendentes ordenadas por data" />
            <div className="space-y-2 mt-4">
              {proximosVencimentos.length === 0 ? (
                <p className="text-center text-slate-300 font-bold italic py-6 text-sm">Nenhuma pendência.</p>
              ) : proximosVencimentos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => !isReadOnly && setPagandoDespesa({ id: p.id, descricao: p.descricao, valor: p.valorTotal })}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold text-slate-400">{formatDateBR(p.dataVencimento)}</span>
                    <span className="block text-xs font-bold text-slate-700 truncate">{p.descricao}</span>
                  </span>
                  <span className="text-xs font-black text-amber-600 shrink-0">{formatCurrencyBR(p.valorTotal)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVerTodasContas((v) => !v)} className="w-full text-center mt-3 text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest">
              Ver todos os vencimentos
            </button>
          </div>
        </div>

        {/* Tabelas */}
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <SectionTitle title="Contas Fixas Recorrentes" subtitle="Modelos que geram pendência todo mês" />
              {!isReadOnly && (
                <button onClick={() => setEditingConta(null)} className="text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest">
                  <i className="fa-solid fa-plus mr-1.5"></i> Nova conta fixa
                </button>
              )}
            </div>
            {contasFixas.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhuma conta fixa cadastrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className={thClass}>Categoria</th>
                      <th className={thClass}>Descrição</th>
                      <th className={thClassRight}>Vencimento</th>
                      <th className={thClassRight}>Valor</th>
                      <th className={thClassRight}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verTodasContas ? contasFixas : contasFixas.slice(0, 5)).map((c) => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setEditingConta(c)}>
                        <td className="py-3 pr-4 font-bold text-slate-600">{c.categoriaNome || '—'}</td>
                        <td className="py-3 pr-4 font-bold text-slate-700">{c.descricao}</td>
                        <td className="py-3 pr-4 text-right font-bold text-slate-600">Dia {c.diaVencimento}</td>
                        <td className="py-3 pr-4 text-right font-black text-slate-800">{formatCurrencyBR(c.valorPrevisto)}</td>
                        <td className="py-3 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${c.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {c.ativo ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {contasFixas.length > 5 && (
              <button onClick={() => setVerTodasContas((v) => !v)} className="w-full text-center text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest">
                {verTodasContas ? 'Ver menos' : 'Ver todas'}
              </button>
            )}
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
            <SectionTitle title="Lançamentos Recentes" subtitle="Histórico de despesas do período filtrado" />
            {lancamentosLoading ? <CardSkeleton height={220} /> : lancamentos.length === 0 ? (
              <p className="text-center text-slate-300 font-bold italic py-8">Nenhum lançamento no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className={thClass}>Data</th>
                      <th className={thClass}>Categoria</th>
                      <th className={thClass}>Descrição</th>
                      <th className={thClass}>Unidade</th>
                      <th className={thClass}>Forma</th>
                      <th className={thClassRight}>Valor</th>
                      <th className={thClassRight}>Status</th>
                      <th className={thClassRight}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verTodosLancamentos ? lancamentos : lancamentos.slice(0, 8)).map((l) => (
                      <tr key={l.id} className="border-b border-slate-50">
                        <td className="py-3 pr-4 font-bold text-slate-500 whitespace-nowrap">{formatDateBR(l.data)}</td>
                        <td className="py-3 pr-4 font-bold text-slate-600">
                          {l.icone && <i className={`fa-solid ${l.icone} mr-1.5`} style={{ color: l.cor || undefined }}></i>}
                          {l.categoriaNome || '—'}
                        </td>
                        <td className="py-3 pr-4 font-bold text-slate-700 max-w-[220px] truncate">{l.descricao}</td>
                        <td className="py-3 pr-4 font-bold text-slate-500">{l.unidadeNome || '—'}</td>
                        <td className="py-3 pr-4 font-bold text-slate-500">{l.formaPagamento || '—'}</td>
                        <td className="py-3 pr-4 text-right font-black text-slate-800 whitespace-nowrap">{formatCurrencyBR(l.valorTotal)}</td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase whitespace-nowrap ${l.status === 'pago' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {l.status === 'pago' ? 'Pago' : 'Pendente'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {!isReadOnly && (
                            <div className="flex items-center justify-end gap-1">
                              {l.status === 'pendente' && (
                                <button onClick={() => setPagandoDespesa({ id: l.id, descricao: l.descricao, valor: l.valorTotal })} title="Dar baixa" className="w-8 h-8 rounded-lg text-emerald-500 hover:bg-emerald-50 flex items-center justify-center">
                                  <i className="fa-solid fa-circle-check text-sm"></i>
                                </button>
                              )}
                              <button onClick={() => setConfirmacaoExclusao(l.id)} title="Excluir" className="w-8 h-8 rounded-lg text-rose-400 hover:bg-rose-50 flex items-center justify-center">
                                <i className="fa-solid fa-trash-can text-sm"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lancamentos.length > 8 && (
              <button onClick={() => setVerTodosLancamentos((v) => !v)} className="w-full text-center text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest">
                {verTodosLancamentos ? 'Ver menos' : 'Ver todas'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
        <p className="text-[11px] font-bold text-slate-400 text-center sm:text-left">
          Os valores apresentados são referentes ao período selecionado e à unidade escolhida.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-slate-400">
            Dados atualizados em {ultimaAtualizacao.toLocaleDateString('pt-BR')} às {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={carregarTudo} className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 flex items-center justify-center">
            <i className="fa-solid fa-arrows-rotate text-xs"></i>
          </button>
        </div>
      </div>

      {/* Modais */}
      {isModalOpen && (
        <GastosModal
          unitId={filtros.unidadeId ?? unit.id}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          initialDate={getTodayBR()}
          onClose={() => setIsModalOpen(false)}
          onRefresh={carregarTudo}
        />
      )}

      {isCategoriasModalOpen && (
        <CategoriasModal
          supabaseClient={supabaseClient}
          onClose={() => setIsCategoriasModalOpen(false)}
          onChanged={() => fetchCategorias(supabaseClient).then(setCategorias)}
        />
      )}

      {editingConta !== undefined && (
        <ContaRecorrenteModal
          unidadeId={filtros.unidadeId ?? unit.id}
          categorias={categorias}
          conta={editingConta}
          supabaseClient={supabaseClient}
          onClose={() => setEditingConta(undefined)}
          onSaved={carregarTudo}
        />
      )}

      {pagandoDespesa && (
        <PagarDespesaModal
          despesaId={pagandoDespesa.id}
          descricao={pagandoDespesa.descricao}
          valorTotal={pagandoDespesa.valor}
          supabaseClient={supabaseClient}
          onClose={() => setPagandoDespesa(null)}
          onPaid={carregarTudo}
        />
      )}

      {confirmacaoExclusao !== null && (
        <div className="app-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 border border-slate-100 animate-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-rose-50 text-rose-500">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h3 className="text-xl font-black text-slate-800">Tem certeza?</h3>
              <p className="text-sm font-bold text-slate-500 leading-relaxed">Você deseja realmente excluir este lançamento? Esta ação é irreversível.</p>
              <div className="flex w-full gap-3 pt-4">
                <button onClick={() => setConfirmacaoExclusao(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Voltar</button>
                <button onClick={handleDelete} className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-95">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gastos;
