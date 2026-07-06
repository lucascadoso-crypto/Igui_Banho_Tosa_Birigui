import { toCurrencyNumber } from './appointmentTotals';
import { getDefaultPeriodo, getPeriodoAnterior, calcularVariacao, getTodayBR } from './dashboardGerencial';

export { getDefaultPeriodo, getPeriodoAnterior, calcularVariacao, getTodayBR };

export type TipoDespesaFiltro = 'todos' | 'fixo' | 'variavel';

export interface GastosFiltros {
  unidadeId: number | null; // null = Todas as unidades
  dataInicio: string;
  dataFim: string;
  categoriaId: number | null; // null = Todas
  tipo: TipoDespesaFiltro;
  formaPagamento: string; // 'todas' | forma específica
}

export const getFiltrosDefault = (unidadeIdInicial: number | null): GastosFiltros => {
  const periodo = getDefaultPeriodo();
  return {
    unidadeId: unidadeIdInicial,
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
    categoriaId: null,
    tipo: 'todos',
    formaPagamento: 'todas'
  };
};

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export interface CategoriaDespesa { id: number; nome: string; icone: string; cor: string; ativo: boolean; }

export const fetchCategorias = async (supabaseClient: any): Promise<CategoriaDespesa[]> => {
  const { data, error } = await supabaseClient.from('categorias_despesa').select('*').order('nome');
  if (error) throw error;
  return data || [];
};

export const salvarCategoria = async (supabaseClient: any, categoria: Partial<CategoriaDespesa>): Promise<void> => {
  if (categoria.id) {
    const { error } = await supabaseClient.from('categorias_despesa').update({
      nome: categoria.nome, icone: categoria.icone, cor: categoria.cor, ativo: categoria.ativo
    }).eq('id', categoria.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('categorias_despesa').insert([{
      nome: categoria.nome, icone: categoria.icone || 'fa-circle-dollar-to-slot', cor: categoria.cor || '#94A3B8'
    }]);
    if (error) throw error;
  }
};

// ---------------------------------------------------------------------------
// Bloco de KPIs (Total, Fixos, Variáveis, Folha, Combustível, Insumos/Manutenção)
// ---------------------------------------------------------------------------

export interface GastosKpis {
  totalAtual: number; totalAnterior: number;
  fixosAtual: number; fixosAnterior: number;
  variaveisAtual: number; variaveisAnterior: number;
  folhaAtual: number; folhaAnterior: number;
  combustivelAtual: number; combustivelAnterior: number;
  insumosManutencaoAtual: number; insumosManutencaoAnterior: number;
}

export const fetchGastosKpis = async (supabaseClient: any, filtros: GastosFiltros): Promise<GastosKpis> => {
  const { dataInicioAnterior, dataFimAnterior } = getPeriodoAnterior(filtros.dataInicio, filtros.dataFim);
  const { data, error } = await supabaseClient.rpc('fn_gastos_kpis', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_data_inicio_ant: dataInicioAnterior,
    p_data_fim_ant: dataFimAnterior
  });
  if (error) throw error;
  return {
    totalAtual: toCurrencyNumber(data?.total_atual),
    totalAnterior: toCurrencyNumber(data?.total_anterior),
    fixosAtual: toCurrencyNumber(data?.fixos_atual),
    fixosAnterior: toCurrencyNumber(data?.fixos_anterior),
    variaveisAtual: toCurrencyNumber(data?.variaveis_atual),
    variaveisAnterior: toCurrencyNumber(data?.variaveis_anterior),
    folhaAtual: toCurrencyNumber(data?.folha_atual),
    folhaAnterior: toCurrencyNumber(data?.folha_anterior),
    combustivelAtual: toCurrencyNumber(data?.combustivel_atual),
    combustivelAnterior: toCurrencyNumber(data?.combustivel_anterior),
    insumosManutencaoAtual: toCurrencyNumber(data?.insumos_manutencao_atual),
    insumosManutencaoAnterior: toCurrencyNumber(data?.insumos_manutencao_anterior)
  };
};

/** Para gastos, aumentar é ruim: GastoKpiCard usa `aumentou` para colorir (aumentou = vermelho), com a seta refletindo a direção real. */
export const trendGastoFrom = (atual: number, anterior: number) => ({
  value: Math.abs(calcularVariacao(atual, anterior)),
  aumentou: atual > anterior
});

// ---------------------------------------------------------------------------
// Evolução dos gastos (gráfico) + por categoria (donut)
// ---------------------------------------------------------------------------

export type Granularidade = 'dia' | 'semana' | 'mes';

export interface GastoPontoPeriodo { bucket: string; valor: number; }

export const fetchGastosEvolucao = async (
  supabaseClient: any,
  filtros: GastosFiltros,
  granularidade: Granularidade
): Promise<GastoPontoPeriodo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_gastos_evolucao', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_granularidade: granularidade
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({ bucket: row.bucket, valor: toCurrencyNumber(row.valor) }));
};

export interface GastoCategoriaValor { categoriaId: number; categoriaNome: string; icone: string; cor: string; valor: number; }

export const fetchGastosPorCategoria = async (supabaseClient: any, filtros: GastosFiltros): Promise<GastoCategoriaValor[]> => {
  const { data, error } = await supabaseClient.rpc('fn_gastos_por_categoria', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    categoriaId: row.categoria_id,
    categoriaNome: row.categoria_nome,
    icone: row.icone,
    cor: row.cor,
    valor: toCurrencyNumber(row.valor)
  }));
};

// ---------------------------------------------------------------------------
// Combustível (litros, km, custo médio por km)
// ---------------------------------------------------------------------------

export interface CombustivelResumo { litrosTotal: number; kmTotal: number; custoTotal: number; custoMedioKm: number; }

export const fetchCombustivelResumo = async (supabaseClient: any, filtros: GastosFiltros): Promise<CombustivelResumo> => {
  const { data, error } = await supabaseClient.rpc('fn_gastos_combustivel_resumo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return {
    litrosTotal: toCurrencyNumber(data?.litros_total),
    kmTotal: toCurrencyNumber(data?.km_total),
    custoTotal: toCurrencyNumber(data?.custo_total),
    custoMedioKm: toCurrencyNumber(data?.custo_medio_km)
  };
};

// ---------------------------------------------------------------------------
// Funcionários / Folha de pagamento (card lateral)
// ---------------------------------------------------------------------------

export interface FolhaResumo { totalFolha: number; adiantamentos: number; encargos: number; salariosPagos: number; }

export const fetchFolhaResumo = async (supabaseClient: any, unidadeId: number | null, dataInicio: string, dataFim: string): Promise<FolhaResumo> => {
  let query = supabaseClient
    .from('folha_pagamento')
    .select('salario, adiantamento, encargos, data_pagamento, despesas(status)')
    .gte('competencia', dataInicio.slice(0, 8) + '01')
    .lte('competencia', dataFim);
  if (unidadeId !== null) query = query.eq('unidade_id', unidadeId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];
  return {
    totalFolha: rows.reduce((acc: number, r: any) => acc + toCurrencyNumber(r.salario), 0),
    adiantamentos: rows.reduce((acc: number, r: any) => acc + toCurrencyNumber(r.adiantamento), 0),
    encargos: rows.reduce((acc: number, r: any) => acc + toCurrencyNumber(r.encargos), 0),
    salariosPagos: rows
      .filter((r: any) => r.despesas?.status === 'pago')
      .reduce((acc: number, r: any) => acc + toCurrencyNumber(r.salario) + toCurrencyNumber(r.encargos), 0)
  };
};

export interface FuncionarioOpcao { id: number; nome: string; }

export const fetchFuncionariosAtivos = async (supabaseClient: any, unidadeId: number | null): Promise<FuncionarioOpcao[]> => {
  let query = supabaseClient.from('funcionarios').select('id, nome').eq('ativo', true).order('nome');
  if (unidadeId !== null) query = query.eq('unidade_id', unidadeId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// ---------------------------------------------------------------------------
// Próximos vencimentos / Contas fixas recorrentes
// ---------------------------------------------------------------------------

export interface DespesaPendente {
  id: number;
  descricao: string;
  categoriaNome: string | null;
  icone: string | null;
  cor: string | null;
  dataVencimento: string | null;
  valorTotal: number;
}

export const fetchProximosVencimentos = async (supabaseClient: any, unidadeId: number | null, limite = 6): Promise<DespesaPendente[]> => {
  let query = supabaseClient
    .from('despesas')
    .select('id, nome_item, data_vencimento, valor_total, categorias_despesa(nome, icone, cor)')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
    .limit(limite);
  if (unidadeId !== null) query = query.eq('unidade_id', unidadeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    descricao: row.nome_item,
    categoriaNome: row.categorias_despesa?.nome ?? null,
    icone: row.categorias_despesa?.icone ?? null,
    cor: row.categorias_despesa?.cor ?? null,
    dataVencimento: row.data_vencimento,
    valorTotal: toCurrencyNumber(row.valor_total)
  }));
};

// ---------------------------------------------------------------------------
// Contas fixas recorrentes (modelos)
// ---------------------------------------------------------------------------

export interface ContaFixaRecorrente {
  id: number;
  unidadeId: number;
  categoriaId: number | null;
  categoriaNome: string | null;
  descricao: string;
  diaVencimento: number;
  valorPrevisto: number;
  ativo: boolean;
}

export const fetchContasFixasRecorrentes = async (supabaseClient: any, unidadeId: number | null): Promise<ContaFixaRecorrente[]> => {
  let query = supabaseClient
    .from('contas_fixas_recorrentes')
    .select('id, unidade_id, categoria_id, descricao, dia_vencimento, valor_previsto, ativo, categorias_despesa(nome)')
    .order('dia_vencimento');
  if (unidadeId !== null) query = query.eq('unidade_id', unidadeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    unidadeId: row.unidade_id,
    categoriaId: row.categoria_id,
    categoriaNome: row.categorias_despesa?.nome ?? null,
    descricao: row.descricao,
    diaVencimento: row.dia_vencimento,
    valorPrevisto: toCurrencyNumber(row.valor_previsto),
    ativo: row.ativo
  }));
};

export const salvarContaFixaRecorrente = async (supabaseClient: any, conta: {
  id?: number; unidadeId: number; categoriaId: number | null; descricao: string; diaVencimento: number; valorPrevisto: number; ativo: boolean;
}): Promise<void> => {
  const payload = {
    unidade_id: conta.unidadeId,
    categoria_id: conta.categoriaId,
    descricao: conta.descricao,
    dia_vencimento: conta.diaVencimento,
    valor_previsto: conta.valorPrevisto,
    ativo: conta.ativo
  };
  if (conta.id) {
    const { error } = await supabaseClient.from('contas_fixas_recorrentes').update(payload).eq('id', conta.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('contas_fixas_recorrentes').insert([payload]);
    if (error) throw error;
  }
};

/** Gera as pendências do mês de referência a partir das contas fixas ativas (idempotente). */
export const gerarPendenciasDoMes = async (supabaseClient: any, unidadeId: number | null, referencia = getTodayBR()): Promise<number> => {
  const { data, error } = await supabaseClient.rpc('fn_gerar_despesas_recorrentes', {
    p_unidade_id: unidadeId,
    p_referencia: referencia
  });
  if (error) throw error;
  return toCurrencyNumber(data);
};

/** Dá baixa numa despesa pendente (fixa ou avulsa): marca como paga com data/forma reais. */
export const pagarDespesa = async (supabaseClient: any, despesaId: number, formaPagamento: string, dataPagamento: string): Promise<void> => {
  const { error } = await supabaseClient
    .from('despesas')
    .update({ status: 'pago', forma_pagamento: formaPagamento, data_pagamento: dataPagamento })
    .eq('id', despesaId);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Lançamentos recentes (lista completa filtrada)
// ---------------------------------------------------------------------------

export interface LancamentoDespesa {
  id: number;
  data: string;
  categoriaNome: string | null;
  icone: string | null;
  cor: string | null;
  descricao: string;
  unidadeNome: string | null;
  formaPagamento: string | null;
  valorTotal: number;
  status: 'pago' | 'pendente';
  tipo: 'fixo' | 'variavel';
}

export const fetchLancamentos = async (supabaseClient: any, filtros: GastosFiltros, limite = 100): Promise<LancamentoDespesa[]> => {
  let query = supabaseClient
    .from('despesas')
    .select('id, data_despesa, data_pagamento, nome_item, descricao, forma_pagamento, valor_total, status, tipo, categorias_despesa(nome, icone, cor), unidades(nome)')
    .gte('data_despesa', filtros.dataInicio)
    .lte('data_despesa', filtros.dataFim)
    .order('data_despesa', { ascending: false })
    .limit(limite);

  if (filtros.unidadeId !== null) query = query.eq('unidade_id', filtros.unidadeId);
  if (filtros.categoriaId !== null) query = query.eq('categoria_id', filtros.categoriaId);
  if (filtros.tipo !== 'todos') query = query.eq('tipo', filtros.tipo);
  if (filtros.formaPagamento !== 'todas') query = query.eq('forma_pagamento', filtros.formaPagamento);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    data: row.data_despesa,
    categoriaNome: row.categorias_despesa?.nome ?? null,
    icone: row.categorias_despesa?.icone ?? null,
    cor: row.categorias_despesa?.cor ?? null,
    descricao: row.nome_item + (row.descricao ? ` — ${row.descricao}` : ''),
    unidadeNome: row.unidades?.nome ?? null,
    formaPagamento: row.forma_pagamento,
    valorTotal: toCurrencyNumber(row.valor_total),
    status: row.status,
    tipo: row.tipo
  }));
};

export const excluirDespesa = async (supabaseClient: any, id: number): Promise<void> => {
  const { error } = await supabaseClient.from('despesas').delete().eq('id', id);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Folha de pagamento: lançamento (cria a folha_pagamento + a despesa espelho)
// ---------------------------------------------------------------------------

export interface NovoLancamentoFolhaInput {
  funcionarioId: number;
  unidadeId: number;
  competencia: string; // YYYY-MM-01
  salario: number;
  adiantamento: number;
  encargos: number;
  categoriaId: number;
  status: 'pago' | 'pendente';
  formaPagamento?: string;
  dataPagamento?: string;
  funcionarioNome: string;
}

export const salvarLancamentoFolha = async (supabaseClient: any, input: NovoLancamentoFolhaInput): Promise<void> => {
  const valorTotal = input.salario + input.adiantamento + input.encargos;

  const { data: despesa, error: despesaError } = await supabaseClient
    .from('despesas')
    .insert([{
      unidade_id: input.unidadeId,
      nome_item: `Folha de pagamento — ${input.funcionarioNome}`,
      descricao: `Salário + adiantamento + encargos (${input.competencia.slice(0, 7)})`,
      quantidade: 1,
      valor_total: valorTotal,
      data_despesa: input.dataPagamento || input.competencia,
      categoria_id: input.categoriaId,
      tipo: 'fixo',
      status: input.status,
      forma_pagamento: input.formaPagamento || null,
      data_pagamento: input.status === 'pago' ? (input.dataPagamento || input.competencia) : null,
      data_vencimento: input.competencia
    }])
    .select()
    .single();
  if (despesaError) throw despesaError;

  const { error: folhaError } = await supabaseClient.from('folha_pagamento').insert([{
    funcionario_id: input.funcionarioId,
    unidade_id: input.unidadeId,
    competencia: input.competencia,
    salario: input.salario,
    adiantamento: input.adiantamento,
    encargos: input.encargos,
    data_pagamento: input.status === 'pago' ? (input.dataPagamento || input.competencia) : null,
    forma_pagamento: input.formaPagamento || null,
    despesa_id: despesa.id
  }]);
  if (folhaError) throw folhaError;
};
