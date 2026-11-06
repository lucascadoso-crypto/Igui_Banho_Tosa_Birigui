import { toCurrencyNumber } from './appointmentTotals';

export interface RelatorioFiltros {
  unidadeId: number | null;
  dataInicio: string;
  dataFim: string;
}

export interface AtendimentoPorServico { servico: string; qtd: number; faturamento: number; }

export const fetchRelatorioAtendimentosPorServico = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<AtendimentoPorServico[]> => {
  const { data, error } = await supabaseClient.rpc('fn_relatorio_atendimentos_por_servico', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: 'todos'
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    servico: row.servico,
    qtd: toCurrencyNumber(row.qtd),
    faturamento: toCurrencyNumber(row.faturamento)
  }));
};

export interface ProfissionalResumo {
  funcionarioId: number | string;
  funcionarioNome: string;
  qtdAtendimentos: number;
  faturamento: number;
  comissao: number;
}

/** Agrega fn_comissoes_periodo (0068) por profissional — sem duplicar a apuração de comissão. */
export const fetchRelatorioPorProfissional = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<ProfissionalResumo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_comissoes_periodo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;

  const porFuncionario = new Map<string, ProfissionalResumo>();
  (data || []).forEach((row: any) => {
    const key = String(row.funcionario_id);
    const atual = porFuncionario.get(key) || {
      funcionarioId: row.funcionario_id,
      funcionarioNome: row.funcionario_nome,
      qtdAtendimentos: 0,
      faturamento: 0,
      comissao: 0
    };
    atual.qtdAtendimentos += 1;
    atual.faturamento += toCurrencyNumber(row.valor_servico);
    atual.comissao += toCurrencyNumber(row.valor_comissao);
    porFuncionario.set(key, atual);
  });

  return Array.from(porFuncionario.values()).sort((a, b) => b.faturamento - a.faturamento);
};

export interface ClienteResumo { clienteId: number | string; clienteNome: string; qtdEventos: number; faturamento: number; }

export const fetchRelatorioPorCliente = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<ClienteResumo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_top_clientes', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: 'todos',
    p_limite: 2000
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    qtdEventos: toCurrencyNumber(row.qtd_eventos),
    faturamento: toCurrencyNumber(row.faturamento)
  }));
};

export interface TaxiResumo { unidadeId: number | string; unidadeNome: string; viagens: number; receita: number; custo: number; margem: number; }

export const fetchRelatorioTaxi = async (supabaseClient: any, filtros: RelatorioFiltros): Promise<TaxiResumo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_relatorio_taxi', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    unidadeId: row.unidade_id,
    unidadeNome: row.unidade_nome,
    viagens: toCurrencyNumber(row.viagens),
    receita: toCurrencyNumber(row.receita),
    custo: toCurrencyNumber(row.custo),
    margem: toCurrencyNumber(row.margem)
  }));
};

export interface PendenciaResumo {
  origem: string;
  clienteNome: string;
  clienteTelefone: string;
  petNome: string;
  categoria: string;
  descricao: string;
  vencimento: string;
  valor: number;
  vencido: boolean;
}

export const fetchRelatorioInadimplencia = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<PendenciaResumo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_contas_pendentes_detalhe', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: 'todos',
    p_categoria: 'todos',
    p_forma_pagamento: 'todas',
    p_limite: 2000
  });
  if (error) throw error;
  return (data || [])
    .filter((row: any) => row.vencido)
    .map((row: any) => ({
      origem: row.origem,
      clienteNome: row.cliente_nome,
      clienteTelefone: row.cliente_telefone || '',
      petNome: row.pet_nome || '',
      categoria: row.categoria,
      descricao: row.descricao || '',
      vencimento: row.vencimento,
      valor: toCurrencyNumber(row.valor),
      vencido: Boolean(row.vencido)
    }));
};

export interface PacotesResumoPeriodo {
  vendidosQtd: number;
  vendidosValor: number;
  concluidosQtd: number;
  renovadosQtd: number;
  naoRenovadosQtd: number;
}

export const fetchRelatorioPacotes = async (supabaseClient: any, filtros: RelatorioFiltros): Promise<PacotesResumoPeriodo> => {
  const { data, error } = await supabaseClient.rpc('fn_relatorio_pacotes_periodo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return {
    vendidosQtd: toCurrencyNumber(data?.vendidos_qtd),
    vendidosValor: toCurrencyNumber(data?.vendidos_valor),
    concluidosQtd: toCurrencyNumber(data?.concluidos_qtd),
    renovadosQtd: toCurrencyNumber(data?.renovados_qtd),
    naoRenovadosQtd: toCurrencyNumber(data?.nao_renovados_qtd)
  };
};

export interface CancelamentoResumo {
  agendamentoId: number | string;
  dataAgendamento: string;
  clienteNome: string;
  petNome: string;
  unidadeNome: string;
  valorTotal: number;
  status: string;
}

export const fetchRelatorioCancelamentos = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<CancelamentoResumo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_relatorio_cancelamentos', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    agendamentoId: row.agendamento_id,
    dataAgendamento: row.data_agendamento,
    clienteNome: row.cliente_nome || '',
    petNome: row.pet_nome || '',
    unidadeNome: row.unidade_nome || '',
    valorTotal: toCurrencyNumber(row.valor_total),
    status: row.status
  }));
};

export interface DespesaPorCategoria { categoria: string; qtd: number; valor: number; }

export const fetchRelatorioDespesasPorCategoria = async (
  supabaseClient: any,
  filtros: RelatorioFiltros
): Promise<DespesaPorCategoria[]> => {
  const { data, error } = await supabaseClient.rpc('fn_relatorio_despesas_por_categoria', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    categoria: row.categoria,
    qtd: toCurrencyNumber(row.qtd),
    valor: toCurrencyNumber(row.valor)
  }));
};
