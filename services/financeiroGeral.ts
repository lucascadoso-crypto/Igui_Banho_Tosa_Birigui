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

// Padrao do Financeiro Geral: do dia 1 do mes atual ate HOJE (nao ate o fim
// do mes, como getDefaultPeriodo() faz para outras telas). Mesmo motivo do
// Dashboard Gerencial (DashboardGerencial.tsx): sem isso, o periodo padrao
// inclui dias futuros do proprio mes, e qualquer lancamento com data futura
// (ex.: pagamento antecipado ja registrado) entra como "projecao" na soma de
// caixa. O usuario pode trocar o periodo manualmente depois.
export const getFiltrosDefault = (unidadeIdInicial: number | null): FinanceiroFiltros => {
  const periodo = getDefaultPeriodo();
  return {
    unidadeId: unidadeIdInicial,
    dataInicio: periodo.dataInicio,
    dataFim: getTodayBR(),
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

// ---------------------------------------------------------------------------
// Contas a Receber (idade da dívida) — migration 0065.
// ---------------------------------------------------------------------------

export interface ContaReceberPendencia {
  origem: 'avulso' | 'pacote' | 'adicional';
  referenciaId: number;
  unidadeId: number;
  clienteId: number | null;
  clienteNome: string;
  clienteTelefone: string | null;
  petId: number | null;
  petNome: string | null;
  categoria: string;
  descricao: string;
  vencimento: string; // YYYY-MM-DD
  valor: number;
  vencido: boolean;
}

/** Janela ampla (não o período de filtro) — queremos ver toda pendência aberta, não só a do mês atual. */
export const getJanelaContasReceber = () => {
  const hoje = getTodayBR();
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() + 90);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dataFim = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { dataInicio: '2000-01-01', dataFim };
};

export const fetchContasReceberDetalhe = async (supabaseClient: any, unidadeId: number | null): Promise<ContaReceberPendencia[]> => {
  const { dataInicio, dataFim } = getJanelaContasReceber();
  const { data, error } = await supabaseClient.rpc('fn_financeiro_contas_pendentes_detalhe', {
    p_unidade_id: unidadeId,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_transporte: 'todos',
    p_categoria: 'todos',
    p_forma_pagamento: 'todas',
    p_limite: 1000
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    origem: row.origem,
    referenciaId: row.referencia_id,
    unidadeId: row.unidade_id,
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    clienteTelefone: row.cliente_telefone,
    petId: row.pet_id,
    petNome: row.pet_nome,
    categoria: row.categoria,
    descricao: row.descricao,
    vencimento: row.vencimento,
    valor: toCurrencyNumber(row.valor),
    vencido: Boolean(row.vencido)
  }));
};

export type FaixaIdadeDivida = 'a_vencer' | '1_7' | '8_30' | '31_60' | 'mais_60';

export const classificarIdadeDivida = (vencimento: string, hoje = getTodayBR()): FaixaIdadeDivida => {
  const dias = Math.floor((new Date(`${hoje}T12:00:00`).getTime() - new Date(`${vencimento}T12:00:00`).getTime()) / 86400000);
  if (dias < 0) return 'a_vencer';
  if (dias <= 7) return '1_7';
  if (dias <= 30) return '8_30';
  if (dias <= 60) return '31_60';
  return 'mais_60';
};

export const FAIXAS_IDADE_LABEL: Record<FaixaIdadeDivida, string> = {
  a_vencer: 'A vencer',
  '1_7': '1 a 7 dias',
  '8_30': '8 a 30 dias',
  '31_60': '31 a 60 dias',
  mais_60: 'Mais de 60 dias'
};

export interface ClienteDevedor {
  clienteId: number | null;
  clienteNome: string;
  clienteTelefone: string | null;
  totalDevido: number;
  itemMaisAntigo: ContaReceberPendencia;
  faixaMaisCritica: FaixaIdadeDivida;
  itens: ContaReceberPendencia[];
}

const ORDEM_FAIXA: FaixaIdadeDivida[] = ['mais_60', '31_60', '8_30', '1_7', 'a_vencer'];

export const agruparPorCliente = (pendencias: ContaReceberPendencia[]): ClienteDevedor[] => {
  const grupos = new Map<string, ContaReceberPendencia[]>();
  pendencias.forEach((p) => {
    const chave = String(p.clienteId ?? p.clienteNome);
    const lista = grupos.get(chave) || [];
    lista.push(p);
    grupos.set(chave, lista);
  });

  return Array.from(grupos.values()).map((itens) => {
    const ordenados = [...itens].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const itemMaisAntigo = ordenados[0];
    const faixas = itens.map((i) => classificarIdadeDivida(i.vencimento));
    const faixaMaisCritica = ORDEM_FAIXA.find((f) => faixas.includes(f)) || 'a_vencer';
    return {
      clienteId: itemMaisAntigo.clienteId,
      clienteNome: itemMaisAntigo.clienteNome,
      clienteTelefone: itemMaisAntigo.clienteTelefone,
      totalDevido: itens.reduce((acc, i) => acc + i.valor, 0),
      itemMaisAntigo,
      faixaMaisCritica,
      itens: ordenados
    };
  }).sort((a, b) => b.totalDevido - a.totalDevido);
};

// ---------------------------------------------------------------------------
// Contas a Pagar com calendário — migration 0066.
// ---------------------------------------------------------------------------

export interface ContaAPagarItem {
  origem: 'despesa' | 'conta_fixa_projetada';
  referenciaId: number;
  categoriaNome: string;
  descricao: string;
  vencimento: string;
  valor: number;
  vencida: boolean;
}

export const fetchContasAPagarCalendario = async (supabaseClient: any, unidadeId: number | null, diasAFrente = 30): Promise<ContaAPagarItem[]> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_contas_a_pagar_calendario', {
    p_unidade_id: unidadeId,
    p_dias_a_frente: diasAFrente
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    origem: row.origem,
    referenciaId: row.referencia_id,
    categoriaNome: row.categoria_nome,
    descricao: row.descricao,
    vencimento: row.vencimento,
    valor: toCurrencyNumber(row.valor),
    vencida: Boolean(row.vencida)
  }));
};

// ---------------------------------------------------------------------------
// Projeção de caixa — migration 0066.
// ---------------------------------------------------------------------------

export interface ProjecaoCaixaResultado {
  saldoAtual: number;
  pontos: FluxoDiarioPonto[];
}

export const fetchProjecaoCaixa = async (supabaseClient: any, unidadeId: number | null, diasAFrente = 30): Promise<ProjecaoCaixaResultado> => {
  const hoje = getTodayBR();
  const periodo = { dataInicio: hoje.slice(0, 8) + '01', dataFim: hoje };
  const filtrosSaldo: FinanceiroFiltros = {
    unidadeId,
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
    transporte: 'todos',
    formaPagamento: 'todas',
    linhaServico: 'todos'
  };

  const [kpis, { data: deltas, error }] = await Promise.all([
    fetchFinanceiroKpis(supabaseClient, filtrosSaldo),
    supabaseClient.rpc('fn_financeiro_projecao_caixa', { p_unidade_id: unidadeId, p_dias_a_frente: diasAFrente })
  ]);
  if (error) throw error;

  let saldoAcumulado = kpis.lucroAtual;
  const pontos = (deltas || []).map((row: any) => {
    const recebido = toCurrencyNumber(row.recebido_previsto);
    const pago = toCurrencyNumber(row.pago_previsto);
    saldoAcumulado += recebido - pago;
    return { bucket: row.bucket, receita: recebido, custo: pago, lucro: saldoAcumulado };
  });

  return { saldoAtual: kpis.lucroAtual, pontos };
};

// ---------------------------------------------------------------------------
// DRE simplificado mensal — migration 0067.
// ---------------------------------------------------------------------------

export interface DreLinha { linha: string; valor: number; }
export interface DreSnapshot {
  receitaBrutaLinhas: DreLinha[];
  descontos: number;
  taxasCartao: number;
  receitaBrutaTotal: number;
  receitaLiquida: number;
  custosDiretos: number;
  margemContribuicao: number;
  despesasFixasCategorias: { categoria: string; valor: number }[];
  despesasFixasTotal: number;
  resultadoOperacional: number;
}

export interface DreMensal extends DreSnapshot {
  mesInicio: string;
  mesFim: string;
  anterior: DreSnapshot;
}

const mapDreSnapshot = (data: any): DreSnapshot => ({
  receitaBrutaLinhas: (data?.receita_bruta_linhas || []).map((l: any) => ({ linha: l.linha, valor: toCurrencyNumber(l.valor) })),
  descontos: toCurrencyNumber(data?.descontos),
  taxasCartao: toCurrencyNumber(data?.taxas_cartao),
  receitaBrutaTotal: toCurrencyNumber(data?.receita_bruta_total),
  receitaLiquida: toCurrencyNumber(data?.receita_liquida),
  custosDiretos: toCurrencyNumber(data?.custos_diretos),
  margemContribuicao: toCurrencyNumber(data?.margem_contribuicao),
  despesasFixasCategorias: (data?.despesas_fixas_categorias || []).map((d: any) => ({ categoria: d.categoria, valor: toCurrencyNumber(d.valor) })),
  despesasFixasTotal: toCurrencyNumber(data?.despesas_fixas_total),
  resultadoOperacional: toCurrencyNumber(data?.resultado_operacional)
});

export const fetchDreMensal = async (supabaseClient: any, unidadeId: number | null, anoMes: string): Promise<DreMensal> => {
  const { data, error } = await supabaseClient.rpc('fn_financeiro_dre_mensal', { p_unidade_id: unidadeId, p_ano_mes: anoMes });
  if (error) throw error;
  return {
    ...mapDreSnapshot(data),
    mesInicio: data?.mes_inicio,
    mesFim: data?.mes_fim,
    anterior: mapDreSnapshot(data?.anterior)
  };
};

export const LINHA_RECEITA_LABEL: Record<string, string> = {
  banho: 'Banho',
  tosa: 'Tosa',
  pacote: 'Pacote',
  adicional: 'Extras',
  taxi: 'Táxi / Transporte',
  outro: 'Outros serviços avulsos'
};
