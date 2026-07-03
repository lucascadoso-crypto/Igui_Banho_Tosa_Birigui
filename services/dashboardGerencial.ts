import { toCurrencyNumber } from './appointmentTotals';

export type TransporteFiltro = 'todos' | 'com' | 'sem';
export type Granularidade = 'dia' | 'semana' | 'mes';

export interface DashboardFiltros {
  unidadeId: number | null; // null = Todas as unidades
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  transporte: TransporteFiltro;
}

/** Data de hoje em America/Sao_Paulo, no formato YYYY-MM-DD (mesmo padrão usado em todo o app). */
export const getTodayBR = () => {
  const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = dataLocalBR.split('/');
  return `${ano}-${mes}-${dia}`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Primeiro e último dia do mês corrente (em America/Sao_Paulo), formato do filtro padrão do dashboard. */
export const getDefaultPeriodo = () => {
  const hojeBR = getTodayBR();
  const [ano, mes] = hojeBR.split('-').map(Number);
  const inicio = `${ano}-${pad2(mes)}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${pad2(mes)}-${pad2(ultimoDia)}`;
  return { dataInicio: inicio, dataFim: fim };
};

/** Período imediatamente anterior, com a mesma quantidade de dias do período informado. */
export const getPeriodoAnterior = (dataInicio: string, dataFim: string) => {
  const start = new Date(`${dataInicio}T12:00:00`);
  const end = new Date(`${dataFim}T12:00:00`);
  const diffDias = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (diffDias - 1));

  return { dataInicioAnterior: toDateKey(prevStart), dataFimAnterior: toDateKey(prevEnd) };
};

export const calcularVariacao = (atual: number, anterior: number) => {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
};

export interface DashboardKpis {
  faturamentoAtual: number;
  faturamentoAnterior: number;
  banhosAtual: number;
  banhosAnterior: number;
  tosasAtual: number;
  tosasAnterior: number;
  pacotesAtivosAtual: number;
  pacotesAtivosAnterior: number;
  novosClientesAtual: number;
  novosClientesAnterior: number;
}

export const fetchDashboardKpis = async (supabaseClient: any, filtros: DashboardFiltros): Promise<DashboardKpis> => {
  const { dataInicioAnterior, dataFimAnterior } = getPeriodoAnterior(filtros.dataInicio, filtros.dataFim);
  const { data, error } = await supabaseClient.rpc('fn_dashboard_kpis', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_data_inicio_ant: dataInicioAnterior,
    p_data_fim_ant: dataFimAnterior,
    p_transporte: filtros.transporte
  });
  if (error) throw error;
  return {
    faturamentoAtual: toCurrencyNumber(data?.faturamento_atual),
    faturamentoAnterior: toCurrencyNumber(data?.faturamento_anterior),
    banhosAtual: toCurrencyNumber(data?.banhos_atual),
    banhosAnterior: toCurrencyNumber(data?.banhos_anterior),
    tosasAtual: toCurrencyNumber(data?.tosas_atual),
    tosasAnterior: toCurrencyNumber(data?.tosas_anterior),
    pacotesAtivosAtual: toCurrencyNumber(data?.pacotes_ativos_atual),
    pacotesAtivosAnterior: toCurrencyNumber(data?.pacotes_ativos_anterior),
    novosClientesAtual: toCurrencyNumber(data?.novos_clientes_atual),
    novosClientesAnterior: toCurrencyNumber(data?.novos_clientes_anterior)
  };
};

export interface FaturamentoPontoPeriodo { bucket: string; valor: number; }

export const fetchFaturamentoPeriodo = async (
  supabaseClient: any,
  filtros: DashboardFiltros,
  granularidade: Granularidade
): Promise<FaturamentoPontoPeriodo[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_faturamento_periodo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte,
    p_granularidade: granularidade
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({ bucket: row.bucket, valor: toCurrencyNumber(row.valor) }));
};

export interface FaturamentoCategoria { categoria: string; valor: number; }

export const fetchFaturamentoCategoria = async (supabaseClient: any, filtros: DashboardFiltros): Promise<FaturamentoCategoria[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_faturamento_categoria', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({ categoria: row.categoria, valor: toCurrencyNumber(row.valor) }));
};

export interface FaturamentoUnidade { unidadeId: number; unidadeNome: string; valor: number; }

export const fetchFaturamentoUnidade = async (
  supabaseClient: any,
  filtros: Pick<DashboardFiltros, 'dataInicio' | 'dataFim' | 'transporte'>
): Promise<FaturamentoUnidade[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_faturamento_unidade', {
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    unidadeId: row.unidade_id,
    unidadeNome: row.unidade_nome,
    valor: toCurrencyNumber(row.valor)
  }));
};

export interface FormaPagamento { forma: string; valor: number; }

/**
 * Normaliza grafias diferentes do mesmo metodo de pagamento (ex.: "Cartão Crédito"
 * e "Crédito") num rotulo canonico. Mesma regra de normalizePaymentMethod() em
 * components/Financeiro.tsx, aplicada aqui no client para nao depender do estado
 * de deploy da normalizacao equivalente no banco (fn_normaliza_forma_pagamento).
 */
export const normalizarFormaPagamento = (raw: string): string => {
  const semAcento = String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

  if (!semAcento) return 'Não informado';
  if (semAcento.includes('pix')) return 'Pix';
  if (semAcento.includes('dinheiro')) return 'Dinheiro';
  if (semAcento.includes('debito')) return 'Débito';
  if (semAcento.includes('credito')) return 'Crédito';
  if (semAcento.includes('transferencia')) return 'Transferência';
  return 'Outro';
};

export const fetchFormasPagamento = async (supabaseClient: any, filtros: DashboardFiltros): Promise<FormaPagamento[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_formas_pagamento', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte
  });
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

export interface CustoServicoPacote { servico: string; qtd: number; custoUnitario: number; custoTotal: number; }

export const fetchCustosPacotes = async (supabaseClient: any, filtros: DashboardFiltros): Promise<CustoServicoPacote[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_custos_pacotes', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    servico: row.servico,
    qtd: toCurrencyNumber(row.qtd),
    custoUnitario: toCurrencyNumber(row.custo_unitario),
    custoTotal: toCurrencyNumber(row.custo_total)
  }));
};

export interface TransporteResumo { petsTransportados: number; faturamentoTransporte: number; }

export const fetchTransporteResumo = async (
  supabaseClient: any,
  filtros: Pick<DashboardFiltros, 'unidadeId' | 'dataInicio' | 'dataFim'>
): Promise<TransporteResumo> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_transporte', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return {
    petsTransportados: toCurrencyNumber(data?.pets_transportados),
    faturamentoTransporte: toCurrencyNumber(data?.faturamento_transporte)
  };
};

export interface TopAdicional { servico: string; qtd: number; faturamento: number; }

export const fetchTopAdicionais = async (supabaseClient: any, filtros: DashboardFiltros, limite = 10): Promise<TopAdicional[]> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_top_adicionais', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte,
    p_limite: limite
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    servico: row.servico,
    qtd: toCurrencyNumber(row.qtd),
    faturamento: toCurrencyNumber(row.faturamento)
  }));
};

export interface AgendamentosCards { agendados: number; concluidos: number; cancelados: number; taxaConclusao: number; }

export const fetchAgendamentosCards = async (supabaseClient: any, filtros: DashboardFiltros): Promise<AgendamentosCards> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_agendamentos_cards', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_transporte: filtros.transporte
  });
  if (error) throw error;
  return {
    agendados: toCurrencyNumber(data?.agendados),
    concluidos: toCurrencyNumber(data?.concluidos),
    cancelados: toCurrencyNumber(data?.cancelados),
    taxaConclusao: toCurrencyNumber(data?.taxa_conclusao)
  };
};

export interface ProximoAgendamento {
  id: number | string;
  horario: string;
  petNome: string;
  petRaca: string;
  clienteNome: string;
  unidadeNome: string;
  valor: number;
  servicos: string;
  temTaxi: boolean;
  numeroSessao: number | null;
}

/** Próximos agendamentos a partir de hoje (America/Sao_Paulo), incluindo sessões de pacote. */
export const fetchProximosAgendamentos = async (
  supabaseClient: any,
  filtros: Pick<DashboardFiltros, 'unidadeId' | 'transporte'>,
  limite = 8
): Promise<ProximoAgendamento[]> => {
  const hoje = getTodayBR();
  let query = supabaseClient
    .from('agendamentos')
    .select('id, data_agendamento, horario_inicio, tem_taxi, numero_sessao, status, unidade_id, valor_total, pets(nome, raca), clientes(nome), unidades(nome), agendamento_itens(tipo, servicos(nome))')
    .in('status', ['Agendado', 'Em Andamento'])
    .gte('data_agendamento', hoje)
    .order('data_agendamento', { ascending: true })
    .order('horario_inicio', { ascending: true })
    .limit(limite);

  if (filtros.unidadeId !== null) query = query.eq('unidade_id', filtros.unidadeId);
  if (filtros.transporte === 'com') query = query.eq('tem_taxi', true);
  if (filtros.transporte === 'sem') query = query.eq('tem_taxi', false);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((a: any) => ({
    id: a.id,
    horario: `${a.data_agendamento.split('-').reverse().join('/')} ${String(a.horario_inicio || '').substring(0, 5)}`,
    petNome: a.pets?.nome || 'Pet',
    petRaca: a.pets?.raca || '',
    clienteNome: a.clientes?.nome || '',
    unidadeNome: a.unidades?.nome || '',
    valor: toCurrencyNumber(a.valor_total),
    servicos: (a.agendamento_itens || [])
      .filter((it: any) => it.tipo === 'principal')
      .map((it: any) => it.servicos?.nome)
      .filter(Boolean)
      .join(', ') || 'Serviço não especificado',
    temTaxi: Boolean(a.tem_taxi),
    numeroSessao: a.numero_sessao ?? null
  }));
};
