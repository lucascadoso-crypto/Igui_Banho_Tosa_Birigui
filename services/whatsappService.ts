
/**
 * Serviço de Integração com WhatsApp (Mega API)
 * Preparado para múltiplas instâncias por unidade.
 */
export async function enviarNotificacaoWhatsApp({ 
  telefone, 
  mensagem, 
  unidadeId, 
  supabaseClient,
  agendamentoId,
  tipo = 'manual',
  whatsapp_nome_instancia,
  whatsapp_token,
  whatsapp_url_servidor,
  whatsapp_ativo,
  forceDirect = false
}: { 
  telefone?: string; 
  mensagem?: string; 
  unidadeId?: string; 
  supabaseClient: any;
  agendamentoId?: string;
  tipo?: string;
  whatsapp_nome_instancia?: string;
  whatsapp_token?: string;
  whatsapp_url_servidor?: string;
  whatsapp_ativo?: boolean;
  forceDirect?: boolean;
}) {
  try {
    // Agora sempre enviamos via Edge Function para evitar erros de CORS e centralizar a lógica no robô
    console.log(`[WhatsApp] Disparando via Edge Function (Tipo: ${tipo}${agendamentoId ? ', Agendamento: ' + agendamentoId : ''})`);
    
    // Se não for passado telefone/mensagem mas tiver agendamentoId, o robô buscará no banco
    // Se for um disparo manual (telefone + mensagem), o robô enviará diretamente
    
    // Usamos o invoke do próprio cliente Supabase (mais limpo e gerencia Auth automaticamente)
    const { data: result, error } = await supabaseClient.functions.invoke('whatsapp-reminder', {
      body: { 
        agendamento_id: agendamentoId,
        telefone: telefone,
        mensagem: mensagem,
        unidade_id: unidadeId,
        tipo: tipo
      }
    });

    if (error) {
      console.error('Erro na Edge Function de WhatsApp (via invoke):', error);
      return { ok: false, error: error.message || 'Erro na Edge Function' };
    }

    console.log('Mensagem processada com sucesso pela Edge Function:', result);
    return { ok: true, data: result };

  } catch (err: any) {
    console.error('Erro crítico no serviço de WhatsApp (Centralizado):', err);
    return { ok: false, error: err.message };
  }
}
