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

  const { error } = await supabaseClient
    .from('pacotes')
    .update(payload)
    .eq('id', pacoteId);

  if (error) throw error;

  const pacoteLabel = nomePacote || pacoteId;
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
