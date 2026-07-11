import { registrarAtividade } from './logger';

export interface RegistrarPagamentoPacoteParams {
  supabaseClient: any;
  unitId: number | string;
  pacoteId: number | string;
  nomePacote?: string;
  petNome?: string;
  metodo1: string;
  valor1: number;
  dividirPagamento: boolean;
  metodo2?: string;
  valor2?: number;
  /** YYYY-MM-DD. Se omitido, usa a data de hoje em America/Sao_Paulo. */
  dataPagamento?: string;
  userEmail?: string;
  userNome?: string;
  userCargo?: string;
}

const getTodayBR = () => {
  const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = dataLocalBR.split('/');
  return `${ano}-${mes}-${dia}`;
};

/** Mapeia os rótulos usados nos <select> de forma de pagamento (Pix, Dinheiro,
 * Cartão Crédito/Débito, Crédito/Débito...) para o enum public.forma_pagamento. */
export function normalizeFormaPagamento(value?: string | null): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (normalized.includes('pix')) return 'pix';
  if (normalized.includes('dinheiro')) return 'dinheiro';
  if (normalized.includes('debito')) return 'debito';
  if (normalized.includes('credito')) return 'credito';
  if (normalized.includes('transferencia')) return 'transferencia';
  return 'outro';
}

/**
 * Garante o lançamento em financeiro_movimentos/financeiro_pagamentos para uma
 * origem comercial (agendamento avulso ou pacote) já paga, sem duplicar caso já
 * exista um lançamento de receita para essa origem. Falha aqui nunca deve
 * derrubar o registro do pagamento em si (pacotes/agendamentos), por isso todo
 * erro é apenas logado.
 */
export async function garantirFinanceiroMovimento(params: {
  supabaseClient: any;
  unitId: number | string;
  agendamentoId?: number | string | null;
  pacoteId?: number | string | null;
  clienteId?: number | string | null;
  petId?: number | string | null;
  categoria: string;
  origem: string;
  descricao: string;
  dataCompetencia: string;
  metodo1: string;
  valor1: number;
  metodo2?: string;
  valor2?: number;
  observacaoBase: string;
}) {
  const {
    supabaseClient, unitId, agendamentoId, pacoteId, clienteId, petId,
    categoria, origem, descricao, dataCompetencia, metodo1, valor1, metodo2, valor2, observacaoBase
  } = params;

  try {
    let existingQuery = supabaseClient
      .from('financeiro_movimentos')
      .select('id')
      .eq('tipo', 'receita');
    existingQuery = agendamentoId
      ? existingQuery.eq('agendamento_id', agendamentoId)
      : existingQuery.eq('pacote_id', pacoteId);

    const { data: existente } = await existingQuery.maybeSingle();
    if (existente) return;

    const valorTotalPago = Number(valor1 || 0) + (metodo2 ? Number(valor2 || 0) : 0);
    if (valorTotalPago <= 0) return;

    const { data: movimento, error: movError } = await supabaseClient
      .from('financeiro_movimentos')
      .insert({
        unidade_id: unitId,
        cliente_id: clienteId ?? null,
        pet_id: petId ?? null,
        agendamento_id: agendamentoId ?? null,
        pacote_id: pacoteId ?? null,
        tipo: 'receita',
        categoria,
        descricao,
        valor_total: valorTotalPago,
        data_competencia: dataCompetencia,
        data_vencimento: dataCompetencia,
        status: 'pago',
        origem,
        origem_id: String(agendamentoId ?? pacoteId ?? '')
      })
      .select('id')
      .single();

    if (movError || !movimento) throw movError;

    const pagoEm = `${dataCompetencia}T12:00:00-03:00`;
    const pagamentos = [{
      unidade_id: unitId,
      movimento_id: movimento.id,
      forma_pagamento: normalizeFormaPagamento(metodo1),
      valor: valor1,
      pago_em: pagoEm,
      observacao: observacaoBase
    }];

    if (metodo2 && valor2) {
      pagamentos.push({
        unidade_id: unitId,
        movimento_id: movimento.id,
        forma_pagamento: normalizeFormaPagamento(metodo2),
        valor: valor2,
        pago_em: pagoEm,
        observacao: `${observacaoBase} (parcela 2)`
      });
    }

    await supabaseClient.from('financeiro_pagamentos').insert(pagamentos);
  } catch (err) {
    console.error('Erro ao gerar financeiro_movimento automatico:', err);
  }
}

/**
 * Fonte única do recebimento de pacote: grava pago/data_pagamento/formas de
 * pagamento em `pacotes` (mesma linha usada em toda a aplicação) e registra o
 * log de auditoria. Usado tanto pela tela do Pacote quanto pelo modal de
 * detalhes do Agendamento, para que os dois pontos de entrada nunca divirjam.
 */
export async function registrarPagamentoPacote(params: RegistrarPagamentoPacoteParams) {
  const {
    supabaseClient,
    unitId,
    pacoteId,
    nomePacote,
    petNome,
    metodo1,
    valor1,
    dividirPagamento,
    metodo2,
    valor2,
    dataPagamento,
    userEmail,
    userNome,
    userCargo
  } = params;

  const finalDate = dataPagamento || getTodayBR();

  const payload: any = {
    pago: true,
    data_pagamento: finalDate,
    forma_pagamento: metodo1,
    valor_total: valor1
  };

  if (dividirPagamento) {
    payload.forma_pagamento_2 = metodo2;
    payload.valor_pagamento_2 = valor2 || 0;
  } else {
    payload.forma_pagamento_2 = null;
    payload.valor_pagamento_2 = 0;
  }

  const { data: pacoteAtualizado, error } = await supabaseClient
    .from('pacotes')
    .update(payload)
    .eq('id', pacoteId)
    .select('cliente_id, pet_id')
    .single();

  if (error) throw error;

  const pacoteLabel = nomePacote || pacoteId;

  await garantirFinanceiroMovimento({
    supabaseClient,
    unitId,
    pacoteId,
    clienteId: pacoteAtualizado?.cliente_id,
    petId: pacoteAtualizado?.pet_id,
    categoria: 'pacote',
    origem: 'venda_pacote',
    descricao: `Venda de pacote${nomePacote ? `: ${nomePacote}` : ''}`,
    dataCompetencia: finalDate,
    metodo1,
    valor1,
    metodo2: dividirPagamento ? metodo2 : undefined,
    valor2: dividirPagamento ? valor2 : undefined,
    observacaoBase: `Pagamento de pacote ${pacoteLabel}`
  });

  const logMsg = dividirPagamento
    ? `Pet: ${petNome || 'Pet'} - Pagamento Dividido para Pacote ${pacoteLabel}, V1: ${valor1} (${metodo1}), V2: ${valor2 || 0} (${metodo2})`
    : `Pet: ${petNome || 'Pet'} - Pagamento Registrado para Pacote ${pacoteLabel}, Método: ${metodo1}`;

  registrarAtividade(
    unitId,
    userEmail || 'sistema',
    'Alteração de Pagamento',
    logMsg,
    userNome,
    userCargo
  );

  return payload;
}
