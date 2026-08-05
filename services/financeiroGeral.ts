import { toCurrencyNumber } from './appointmentTotals';
import {
  DashboardFiltros,
  TransporteFiltro,
  getTodayBR,
  getDefaultPeriodo,
  getPeriodoAnterior,
  calcularVariacao,
  normalizarFormaPagamento
} from './dashboardGerencial';

export { getTodayBR, getDefaultPeriodo, getPeriodoAnterior, calcularVariacao, normalizarFormaPagamento };

export type LinhaServicoFiltro = 'todos' | 'banho' | 'tosa' | 'pacote' | 'adicional' | 'outro';

export interface FinanceiroFiltros extends DashboardFiltros {
  formaPagamento: string; // 'todas' | rótulo canônico (Pix/Dinheiro/Débito/Crédito/Transferência/Outro/Não informado)
  linhaServico: LinhaServicoFiltro;
}

export const FORMAS_PAGAMENTO_OPCOES = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Outro', 'Não informado'];

export const getFiltrosDefault = (unidadeIdInicial: number | null): FinanceiroFiltros => {
  const periodo = getDefaultPeriodo();
  return {
    unidadeId: unidadeIdInicial,
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
    transporte: 'todos',
    formaPagamento: 'todas',
    linhaServico: 'todos'
  };
};

const rpcParams = (filtros: FinanceiroFiltros) => ({
  p_unidade_id: filtros.unidadeId,
  p_data_inicio: filtros.dataInicio,
  p_data_fim: filtros.dataFim,
  p_transporte: filtros.transporte,
  p_categoria: filtros.linhaServico,
  p_forma_pagamento: filtros.formaPagamento
});

export interface FinanceiroKpis {
  recebidoAtual: number;
  recebidoAnterior: number;
  custosAtual: number;
  custosAnterior: number;
  lucroAtual: number;
  lucroAnterior: number;
}

export const fetchFinanceiroKpis = async (supabaseClient: any, filtros: FinanceiroFiltros): Promise<FinanceiroKpis> => {
  const { dataInicioAnterior, dataFimAnterior } = getPeriodoAnterior(filtros.dataInicio, filtros.dataFim);
  const { data, error } = await supabaseClient.rpc('fn_financeiro_kpis', {
    ...rpcParams(filtros),
    p_data_inicio_ant: dataInicioAnterior,
    p_data_fim_ant: dataFimAnterior
  });
  if (error) throw error;
  return {
    recebidoAtual: toCurrencyNumber(data?.recebido_atual),
    recebidoAnterior: toCurrencyNumber(data?.recebido_anterior),
    custosAtual: toCurrencyNumber(data?.custos_atual),
    custosAnterior: toCurrencyNumber(data?.custos_anterior),
    lucroAtual: toCurrencyNumber(data?.lucro_atual),
    lucroAnterior: toCurrencyNumber(data?.lucro_anterior)
  };
};

export interface FluxoDiarioPonto { bucket: string; receita: number; custo: number; lucro: number; }

export const fetchFluxoDiario = async (supabaseClient: any, filtros: FinanceiroFiltros): Promise<FluxoDiarioPonto[]> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_fluxo_diario', rpcParams(filtros));
  if (error) throw error;
  return (data || []).map((row: any) => ({
    bucket: row.bucket,
    receita: toCurrencyNumber(row.receita),
    custo: toCurrencyNumber(row.custo),
    lucro: toCurrencyNumber(row.lucro)
  }));
};

export interface LinhaServicoValor { linha: string; valor: number; }

export const fetchFaturamentoPorLinha = async (supabaseClient: any, filtros: FinanceiroFiltros): Promise<LinhaServicoValor[]> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_faturamento_por_linha', rpcParams(filtros));
  if (error) throw error;
  return (data || []).map((row: any) => ({ linha: row.linha, valor: toCurrencyNumber(row.valor) }));
};

export interface FormaPagamentoValor { forma: string; valor: number; }

export const fetchFormasPagamentoFinanceiro = async (supabaseClient: any, filtros: FinanceiroFiltros): Promise<FormaPagamentoValor[]> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_formas_pagamento', rpcParams(filtros));
  if (error) throw error;

  const agrupado = new Map<string, number>();
  for (const row of data || []) {
    const forma = normalizarFormaPagamento(row.forma_pagamento);
    agrupado.set(forma, (agrupado.get(forma) || 0) + toCurrencyNumber(row.valor));
  }
  return Array.from(agrupado.entries())
    .map(([forma, valor]) => ({ forma, valor }))
    .sort((a, b) => b.valor - a.valor);
};

export interface Fidelidade {
  pacotesValor: number;
  pacotesContratos: number;
  avulsosValor: number;
  avulsosAtendimentos: number;
}

export const fetchFidelidade = async (supabaseClient: any, filtros: FinanceiroFiltros): Promise<Fidelidade> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_fidelidade', rpcParams(filtros));
  if (error) throw error;
  return {
    pacotesValor: toCurrencyNumber(data?.pacotes_valor),
    pacotesContratos: toCurrencyNumber(data?.pacotes_contratos),
    avulsosValor: toCurrencyNumber(data?.avulsos_valor),
    avulsosAtendimentos: toCurrencyNumber(data?.avulsos_atendimentos)
  };
};
