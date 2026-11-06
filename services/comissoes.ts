import { toCurrencyNumber } from './appointmentTotals';
import { getDefaultPeriodo, getTodayBR } from './dashboardGerencial';

export interface ComissaoFiltros {
  unidadeId: number | null;
  dataInicio: string;
  dataFim: string;
}

export const getFiltrosDefault = (unidadeIdInicial: number | null): ComissaoFiltros => {
  const periodo = getDefaultPeriodo();
  return { unidadeId: unidadeIdInicial, dataInicio: periodo.dataInicio, dataFim: periodo.dataFim };
};

export interface ComissaoAtendimento {
  funcionarioId: number;
  funcionarioNome: string;
  agendamentoId: number;
  petNome: string | null;
  dataAtendimento: string;
  categoria: string;
  valorServico: number;
  tipoRegra: 'percentual' | 'fixo' | null;
  valorRegra: number | null;
  valorComissao: number;
}

export const fetchComissoesPeriodo = async (supabaseClient: any, filtros: ComissaoFiltros): Promise<ComissaoAtendimento[]> => {
  const { data, error } = await supabaseClient.rpc('fn_comissoes_periodo', {
    p_unidade_id: filtros.unidadeId,
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    funcionarioId: row.funcionario_id,
    funcionarioNome: row.funcionario_nome,
    agendamentoId: row.agendamento_id,
    petNome: row.pet_nome,
    dataAtendimento: row.data_atendimento,
    categoria: row.categoria,
    valorServico: toCurrencyNumber(row.valor_servico),
    tipoRegra: row.tipo_regra,
    valorRegra: row.valor_regra !== null ? toCurrencyNumber(row.valor_regra) : null,
    valorComissao: toCurrencyNumber(row.valor_comissao)
  }));
};

export interface ComissaoPorProfissional {
  funcionarioId: number;
  funcionarioNome: string;
  qtdAtendimentos: number;
  totalServicos: number;
  totalComissao: number;
}

export const agruparComissaoPorProfissional = (itens: ComissaoAtendimento[]): ComissaoPorProfissional[] => {
  const mapa = new Map<number, ComissaoPorProfissional>();
  itens.forEach((item) => {
    const atual = mapa.get(item.funcionarioId) || {
      funcionarioId: item.funcionarioId,
      funcionarioNome: item.funcionarioNome,
      qtdAtendimentos: 0,
      totalServicos: 0,
      totalComissao: 0
    };
    atual.qtdAtendimentos += 1;
    atual.totalServicos += item.valorServico;
    atual.totalComissao += item.valorComissao;
    mapa.set(item.funcionarioId, atual);
  });
  return Array.from(mapa.values()).sort((a, b) => b.totalComissao - a.totalComissao);
};

export const exportarComissoesCsv = (itens: ComissaoAtendimento[]): string => {
  const cabecalho = ['Profissional', 'Data', 'Pet', 'Categoria', 'Valor do serviço', 'Tipo de regra', 'Valor da regra', 'Comissão'];
  const linhas = itens.map((i) => [
    i.funcionarioNome,
    i.dataAtendimento,
    i.petNome || '',
    i.categoria,
    i.valorServico.toFixed(2),
    i.tipoRegra || '',
    i.valorRegra !== null ? i.valorRegra.toFixed(2) : '',
    i.valorComissao.toFixed(2)
  ]);
  return [cabecalho, ...linhas].map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
};

// ---------------------------------------------------------------------------
// Regras de comissão (CRUD simples sobre comissao_regras)
// ---------------------------------------------------------------------------

export interface ComissaoRegra {
  id: number;
  unidadeId: number;
  funcionarioId: number | null;
  categoriaServico: 'todas' | 'banho' | 'tosa' | 'outro';
  tipo: 'percentual' | 'fixo';
  valor: number;
  vigenteDesde: string;
  ativo: boolean;
}

export const fetchComissaoRegras = async (supabaseClient: any, unidadeId: number | null): Promise<ComissaoRegra[]> => {
  let query = supabaseClient.from('comissao_regras').select('*').order('vigente_desde', { ascending: false });
  if (unidadeId !== null) query = query.eq('unidade_id', unidadeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    unidadeId: row.unidade_id,
    funcionarioId: row.funcionario_id,
    categoriaServico: row.categoria_servico,
    tipo: row.tipo,
    valor: toCurrencyNumber(row.valor),
    vigenteDesde: row.vigente_desde,
    ativo: row.ativo
  }));
};

export const salvarComissaoRegra = async (supabaseClient: any, regra: {
  id?: number; unidadeId: number; funcionarioId: number | null; categoriaServico: string; tipo: string; valor: number; vigenteDesde: string; ativo: boolean;
}): Promise<void> => {
  const payload = {
    unidade_id: regra.unidadeId,
    funcionario_id: regra.funcionarioId,
    categoria_servico: regra.categoriaServico,
    tipo: regra.tipo,
    valor: regra.valor,
    vigente_desde: regra.vigenteDesde,
    ativo: regra.ativo
  };
  if (regra.id) {
    const { error } = await supabaseClient.from('comissao_regras').update(payload).eq('id', regra.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('comissao_regras').insert([payload]);
    if (error) throw error;
  }
};

export const excluirComissaoRegra = async (supabaseClient: any, id: number): Promise<void> => {
  const { error } = await supabaseClient.from('comissao_regras').delete().eq('id', id);
  if (error) throw error;
};

export { getTodayBR };
