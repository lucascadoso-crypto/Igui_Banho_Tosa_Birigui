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
      let detalhe: any = error.context || null;
      try {
        if (error.context && typeof error.context.json === 'function') {
          detalhe = await error.context.json();
        } else if (error.context && typeof error.context.text === 'function') {
          detalhe = await error.context.text();
        }
      } catch (parseError) {
        console.warn('Nao foi possivel ler o detalhe do erro da Edge Function:', parseError);
      }

      const detalheTexto = typeof detalhe === 'string'
        ? detalhe
        : detalhe?.detalhe || detalhe?.error || detalhe?.erro || null;

      return {
        ok: false,
        error: detalhe?.erro || detalhe?.error || error.message || 'Erro na Edge Function',
        detalhe: detalheTexto,
      };
    }

    if (typeof result === 'string') {
      return { ok: true, data: { mensagem: result } };
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
