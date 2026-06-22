type WhatsAppTipo = 'confirmacao' | 'lembrete' | 'pronto' | 'manual' | string;
type WhatsAppOrigem = 'auto' | 'manual';

interface EnviarNotificacaoWhatsAppParams {
  telefone?: string;
  mensagem?: string;
  unidadeId?: number | string;
  supabaseClient: any;
  agendamentoId?: number | string;
  tipo?: WhatsAppTipo;
  origem?: WhatsAppOrigem;
  whatsapp_nome_instancia?: string;
  whatsapp_token?: string;
  whatsapp_url_servidor?: string;
  whatsapp_ativo?: boolean;
  forceDirect?: boolean;
}

/**
 * Servico centralizado de WhatsApp.
 * O frontend chama a Edge Function autenticada; tokens da Evolution ficam apenas no Supabase.
 */
export async function enviarNotificacaoWhatsApp({
  telefone,
  mensagem,
  unidadeId,
  supabaseClient,
  agendamentoId,
  tipo = 'manual',
  origem = 'manual',
}: EnviarNotificacaoWhatsAppParams) {
  try {
    console.log(`[WhatsApp] Disparando via Edge Function lembrete-24h (Tipo: ${tipo}${agendamentoId ? ', Agendamento: ' + agendamentoId : ''})`);

    const { data: result, error } = await supabaseClient.functions.invoke('lembrete-24h', {
      body: {
        agendamentoId,
        agendamento_id: agendamentoId,
        telefone,
        mensagem,
        unidadeId,
        unidade_id: unidadeId,
        tipo,
        origem,
      },
    });

    if (error) {
      console.error('Erro na Edge Function de WhatsApp (via invoke):', error);
      return {
        ok: false,
        error: error.message || 'Erro na Edge Function',
        detalhe: error.context || null,
      };
    }

    if (result?.ok === false) {
      return {
        ok: false,
        error: result.erro || 'Mensagem de WhatsApp nao enviada.',
        detalhe: result.detalhe || null,
        data: result,
      };
    }

    console.log('Mensagem processada pela Edge Function:', result);
    return { ok: true, data: result };
  } catch (err: any) {
    console.error('Erro critico no servico de WhatsApp (Centralizado):', err);
    return { ok: false, error: err.message };
  }
}
