
/**
 * Traduz mensagens de erro técnicas da API Evolution/WhatsApp para algo amigável ao usuário.
 */
export function formatarErroWhatsApp(detalheErro: string | null | undefined): string {
  if (!detalheErro) return "Erro desconhecido na comunicação com a API.";

  try {
    // Tenta fazer o parse caso venha como string JSON
    const errorData = typeof detalheErro === 'string' ? JSON.parse(detalheErro) : detalheErro;
    
    // Busca o campo de mensagem em diferentes níveis possíveis da resposta da API
    const technicalMessage = errorData.message || errorData.error || errorData.description || (errorData.response?.data?.message) || "";
    
    if (!technicalMessage) return "Erro desconhecido na comunicação com a API.";

    const msgLower = technicalMessage.toLowerCase();

    // Traduções específicas solicitadas
    if (msgLower.includes('number not registered on whatsapp')) {
      return "Número não cadastrado ou sem WhatsApp ativo.";
    }
    
    if (msgLower.includes('instance not logged in')) {
      return "WhatsApp desconectado. Por favor, verifique a conexão do QR Code.";
    }

    if (msgLower.includes('unauthorized') || msgLower.includes('401')) {
      return "Erro de autenticação com a API. Verifique o token nas configurações.";
    }

    // Se não tiver tradução específica, retorna a mensagem original ou um fallback
    return technicalMessage;
  } catch (e) {
    // Se não for JSON válido
    if (typeof detalheErro === 'string' && detalheErro.length > 0) {
      return detalheErro;
    }
    return "Erro desconhecido na comunicação com a API.";
  }
}
