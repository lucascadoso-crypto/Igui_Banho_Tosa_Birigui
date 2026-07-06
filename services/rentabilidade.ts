import { toCurrencyNumber } from './appointmentTotals';
import { getDefaultPeriodo } from './dashboardGerencial';

export interface RentabilidadeFiltros {
  unidadeId: number | null; // null = Todas as unidades
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
}

export const getFiltrosDefault = (unidadeIdInicial: number | null): RentabilidadeFiltros => {
  const periodo = getDefaultPeriodo();
  return {
    unidadeId: unidadeIdInicial,
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim
  };
};

// ---------------------------------------------------------------------------
// Fórmulas de rentabilidade (mesma fórmula usada no banco e no simulador,
// para o simulador nunca divergir do que a tela de resultados mostra).
// ---------------------------------------------------------------------------

/** Margem % = (preço - custo) / preço × 100 */
export const calcularMargemPct = (preco: number, custo: number): number => {
  if (!preco || preco <= 0) return 0;
  return ((preco - custo) / preco) * 100;
};

/** Markup = preço ÷ custo */
export const calcularMarkup = (preco: number, custo: number): number => {
  if (!custo || custo <= 0) return 0;
  return preco / custo;
};

/** Caminho inverso: dado o custo e a margem desejada (%), sugere o preço. preço = custo ÷ (1 − margem/100) */
export const sugerirPrecoPorMargem = (custo: number, margemDesejadaPct: number): number => {
  const fator = 1 - margemDesejadaPct / 100;
  if (fator <= 0) return Infinity; // margem >= 100% não é atingível com custo > 0
  return custo / fator;
};

export type MargemTone = 'verde' | 'amarelo' | 'vermelho';

export interface RentabilidadeThresholds {
  margemVerdeMin: number;
  margemAmarelaMin: number;
}

export const classificarMargem = (margemPct: number, thresholds: RentabilidadeThresholds): MargemTone => {
  if (margemPct >= thresholds.margemVerdeMin) return 'verde';
  if (margemPct >= thresholds.margemAmarelaMin) return 'amarelo';
  return 'vermelho';
};

// ---------------------------------------------------------------------------
// Thresholds de margem (config única)
// ---------------------------------------------------------------------------

export const fetchRentabilidadeThresholds = async (supabaseClient: any): Promise<RentabilidadeThresholds> => {
  const { data, error } = await supabaseClient
    .from('rentabilidade_config')
    .select('margem_verde_min, margem_amarela_min')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return {
    margemVerdeMin: toCurrencyNumber(data?.margem_verde_min ?? 60),
    margemAmarelaMin: toCurrencyNumber(data?.margem_amarela_min ?? 30)
  };
};

export const saveRentabilidadeThresholds = async (supabaseClient: any, thresholds: RentabilidadeThresholds): Promise<void> => {
  const { error } = await supabaseClient
    .from('rentabilidade_config')
    .update({
      margem_verde_min: thresholds.margemVerdeMin,
      margem_amarela_min: thresholds.margemAmarelaMin,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Bloco A: resumo do período
// ---------------------------------------------------------------------------

export interface RentabilidadeResumo {
  receitaTotal: number;
  custoTotal: number;
  lucroTotal: number;
  margemMediaPct: number;
  markupMedio: number;
}

export const fetchRentabilidadeResumo = async (supabaseClient: any, filtros: RentabilidadeFiltros): Promise<RentabilidadeResumo> => {
  const { data, error } = await supabaseClient.rpc('fn_rentabilidade_resumo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return {
    receitaTotal: toCurrencyNumber(data?.receita_total),
    custoTotal: toCurrencyNumber(data?.custo_total),
    lucroTotal: toCurrencyNumber(data?.lucro_total),
    margemMediaPct: toCurrencyNumber(data?.margem_media_pct),
    markupMedio: toCurrencyNumber(data?.markup_medio)
  };
};

// ---------------------------------------------------------------------------
// Bloco B: rentabilidade por serviço
// ---------------------------------------------------------------------------

export interface RentabilidadeServico {
  servicoId: number;
  servico: string;
  qtd: number;
  precoMedio: number;
  custoMedio: number;
  receitaTotal: number;
  custoTotal: number;
  lucroTotal: number;
  margemPct: number;
  markup: number;
}

export const fetchRentabilidadeServicos = async (supabaseClient: any, filtros: RentabilidadeFiltros): Promise<RentabilidadeServico[]> => {
  const { data, error } = await supabaseClient.rpc('fn_rentabilidade_servicos', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => {
    const precoMedio = toCurrencyNumber(row.preco_medio);
    const custoMedio = toCurrencyNumber(row.custo_medio);
    return {
      servicoId: row.servico_id,
      servico: row.servico,
      qtd: toCurrencyNumber(row.qtd),
      precoMedio,
      custoMedio,
      receitaTotal: toCurrencyNumber(row.receita_total),
      custoTotal: toCurrencyNumber(row.custo_total),
      lucroTotal: toCurrencyNumber(row.lucro_total),
      margemPct: calcularMargemPct(precoMedio, custoMedio),
      markup: calcularMarkup(precoMedio, custoMedio)
    };
  });
};

// ---------------------------------------------------------------------------
// Bloco C: rentabilidade por pacote
// ---------------------------------------------------------------------------

export interface RentabilidadePacote {
  catalogoPacoteId: number | null;
  pacoteNome: string;
  qtdPacotes: number;
  qtdSessoesMedia: number;
  precoMedio: number;
  custoMedio: number;
  receitaTotal: number;
  custoTotal: number;
  lucroTotal: number;
  margemPct: number;
  markup: number;
  valorEfetivoSessaoMedio: number;
  servicoId: number | null;
  servicoNome: string | null;
}

export const fetchRentabilidadePacotes = async (supabaseClient: any, filtros: RentabilidadeFiltros): Promise<RentabilidadePacote[]> => {
  const { data, error } = await supabaseClient.rpc('fn_rentabilidade_pacotes', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => {
    const precoMedio = toCurrencyNumber(row.preco_medio);
    const custoMedio = toCurrencyNumber(row.custo_medio);
    return {
      catalogoPacoteId: row.catalogo_pacote_id ?? null,
      pacoteNome: row.pacote_nome,
      qtdPacotes: toCurrencyNumber(row.qtd_pacotes),
      qtdSessoesMedia: toCurrencyNumber(row.qtd_sessoes_media),
      precoMedio,
      custoMedio,
      receitaTotal: toCurrencyNumber(row.receita_total),
      custoTotal: toCurrencyNumber(row.custo_total),
      lucroTotal: toCurrencyNumber(row.lucro_total),
      margemPct: calcularMargemPct(precoMedio, custoMedio),
      markup: calcularMarkup(precoMedio, custoMedio),
      valorEfetivoSessaoMedio: toCurrencyNumber(row.valor_efetivo_sessao_medio),
      servicoId: row.servico_id ?? null,
      servicoNome: row.servico_nome ?? null
    };
  });
};

// ---------------------------------------------------------------------------
// Cadastro de custos (usado em Configurações → Custos dos Serviços, e
// como fonte do simulador de preço).
// ---------------------------------------------------------------------------

export interface ServicoComCusto {
  id: number;
  nome: string;
  custoAtual: number;
}

/** Lista serviços com o custo vigente hoje (fn_custo_servico_em na data de hoje). */
export const fetchServicosComCustoAtual = async (supabaseClient: any): Promise<ServicoComCusto[]> => {
  const { data: servicos, error } = await supabaseClient.from('servicos').select('id, nome').order('nome');
  if (error) throw error;

  const hoje = new Date().toISOString().slice(0, 10);
  const custos = await Promise.all(
    (servicos || []).map(async (s: any) => {
      const { data, error: custoError } = await supabaseClient.rpc('fn_custo_servico_em', { p_servico_id: s.id, p_data: hoje });
      if (custoError) throw custoError;
      return { id: s.id, nome: s.nome, custoAtual: toCurrencyNumber(data) };
    })
  );
  return custos;
};

export interface CustoServicoHistoricoItem {
  id: number;
  custoInsumos: number | null;
  custoMaoObra: number | null;
  custoOutros: number | null;
  custoTotal: number;
  vigenteDesde: string;
  observacao: string | null;
  createdAt: string;
}

export const fetchHistoricoCustoServico = async (supabaseClient: any, servicoId: number): Promise<CustoServicoHistoricoItem[]> => {
  const { data, error } = await supabaseClient
    .from('servico_custo_historico')
    .select('id, custo_insumos, custo_mao_obra, custo_outros, custo_total, vigente_desde, observacao, created_at')
    .eq('servico_id', servicoId)
    .order('vigente_desde', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    custoInsumos: row.custo_insumos !== null ? toCurrencyNumber(row.custo_insumos) : null,
    custoMaoObra: row.custo_mao_obra !== null ? toCurrencyNumber(row.custo_mao_obra) : null,
    custoOutros: row.custo_outros !== null ? toCurrencyNumber(row.custo_outros) : null,
    custoTotal: toCurrencyNumber(row.custo_total),
    vigenteDesde: row.vigente_desde,
    observacao: row.observacao,
    createdAt: row.created_at
  }));
};

export interface NovoCustoServicoInput {
  servicoId: number;
  custoInsumos?: number | null;
  custoMaoObra?: number | null;
  custoOutros?: number | null;
  custoTotal?: number | null; // se informado, prevalece; senão soma os 3 acima
  vigenteDesde?: string; // default: hoje
  observacao?: string;
}

export const salvarCustoServico = async (supabaseClient: any, input: NovoCustoServicoInput): Promise<void> => {
  const soma = (input.custoInsumos || 0) + (input.custoMaoObra || 0) + (input.custoOutros || 0);
  const custoTotal = input.custoTotal !== null && input.custoTotal !== undefined ? input.custoTotal : soma;

  const { error } = await supabaseClient.from('servico_custo_historico').insert([
    {
      servico_id: input.servicoId,
      custo_insumos: input.custoInsumos ?? null,
      custo_mao_obra: input.custoMaoObra ?? null,
      custo_outros: input.custoOutros ?? null,
      custo_total: custoTotal,
      vigente_desde: input.vigenteDesde || new Date().toISOString().slice(0, 10),
      observacao: input.observacao || null
    }
  ]);
  if (error) throw error;
};

export interface CustoTransporteAtual {
  custoCombustivel: number | null;
  custoTempo: number | null;
  custoTotal: number;
  vigenteDesde: string;
}

export const fetchCustoTransporteAtual = async (supabaseClient: any): Promise<CustoTransporteAtual> => {
  const { data, error } = await supabaseClient
    .from('custo_transporte_historico')
    .select('custo_combustivel, custo_tempo, custo_total, vigente_desde')
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return {
    custoCombustivel: data?.custo_combustivel !== null && data?.custo_combustivel !== undefined ? toCurrencyNumber(data.custo_combustivel) : null,
    custoTempo: data?.custo_tempo !== null && data?.custo_tempo !== undefined ? toCurrencyNumber(data.custo_tempo) : null,
    custoTotal: toCurrencyNumber(data?.custo_total),
    vigenteDesde: data?.vigente_desde
  };
};

export interface NovoCustoTransporteInput {
  custoCombustivel?: number | null;
  custoTempo?: number | null;
  custoTotal?: number | null;
  vigenteDesde?: string;
}

export const salvarCustoTransporte = async (supabaseClient: any, input: NovoCustoTransporteInput): Promise<void> => {
  const soma = (input.custoCombustivel || 0) + (input.custoTempo || 0);
  const custoTotal = input.custoTotal !== null && input.custoTotal !== undefined ? input.custoTotal : soma;

  const { error } = await supabaseClient.from('custo_transporte_historico').insert([
    {
      custo_combustivel: input.custoCombustivel ?? null,
      custo_tempo: input.custoTempo ?? null,
      custo_total: custoTotal,
      vigente_desde: input.vigenteDesde || new Date().toISOString().slice(0, 10)
    }
  ]);
  if (error) throw error;
};
