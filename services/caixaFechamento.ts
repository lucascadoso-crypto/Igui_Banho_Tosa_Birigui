import { toCurrencyNumber } from './appointmentTotals';

export interface CaixaFechamento {
  id?: number;
  unidadeId: number;
  dataFechamento: string;
  pixEsperado: number;
  pixConferido: number;
  dinheiroEsperado: number;
  dinheiroConferido: number;
  debitoEsperado: number;
  debitoConferido: number;
  creditoEsperado: number;
  creditoConferido: number;
  diferencaTotal: number;
  observacao?: string | null;
  fechadoPorNome?: string | null;
  fechadoEm?: string | null;
}

export const fetchCaixaFechamento = async (supabaseClient: any, unidadeId: number, dataFechamento: string): Promise<CaixaFechamento | null> => {
  const { data, error } = await supabaseClient
    .from('caixa_fechamentos')
    .select('*')
    .eq('unidade_id', unidadeId)
    .eq('data_fechamento', dataFechamento)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    unidadeId: data.unidade_id,
    dataFechamento: data.data_fechamento,
    pixEsperado: toCurrencyNumber(data.pix_esperado),
    pixConferido: toCurrencyNumber(data.pix_conferido),
    dinheiroEsperado: toCurrencyNumber(data.dinheiro_esperado),
    dinheiroConferido: toCurrencyNumber(data.dinheiro_conferido),
    debitoEsperado: toCurrencyNumber(data.debito_esperado),
    debitoConferido: toCurrencyNumber(data.debito_conferido),
    creditoEsperado: toCurrencyNumber(data.credito_esperado),
    creditoConferido: toCurrencyNumber(data.credito_conferido),
    diferencaTotal: toCurrencyNumber(data.diferenca_total),
    observacao: data.observacao,
    fechadoPorNome: data.fechado_por_nome,
    fechadoEm: data.fechado_em
  };
};

export const salvarCaixaFechamento = async (supabaseClient: any, fechamento: CaixaFechamento, fechadoPorUserId?: string | null): Promise<void> => {
  const payload = {
    unidade_id: fechamento.unidadeId,
    data_fechamento: fechamento.dataFechamento,
    pix_esperado: fechamento.pixEsperado,
    pix_conferido: fechamento.pixConferido,
    dinheiro_esperado: fechamento.dinheiroEsperado,
    dinheiro_conferido: fechamento.dinheiroConferido,
    debito_esperado: fechamento.debitoEsperado,
    debito_conferido: fechamento.debitoConferido,
    credito_esperado: fechamento.creditoEsperado,
    credito_conferido: fechamento.creditoConferido,
    diferenca_total: fechamento.diferencaTotal,
    observacao: fechamento.observacao || null,
    fechado_por_user_id: fechadoPorUserId || null,
    fechado_por_nome: fechamento.fechadoPorNome || null,
    fechado_em: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from('caixa_fechamentos')
    .upsert(payload, { onConflict: 'unidade_id,data_fechamento' });
  if (error) throw error;
};
