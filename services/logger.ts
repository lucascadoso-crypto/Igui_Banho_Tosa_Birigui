
import { supabase } from './supabaseClient';

const isUuid = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  const generalUuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return generalUuidRegex.test(val);
};

/**
 * Registra uma ação na tabela de auditoria.
 * @param unidade_id ID da unidade onde a ação ocorreu.
 * @param usuario_email Email do usuário que realizou a ação.
 * @param acao Tipo da ação (ex: 'NOVO_CLIENTE', 'EDICAO_GASTO').
 * @param descricao Descrição detalhada da ação.
 */
export const registrarAtividade = async (
  unidade_id: string | null | undefined,
  usuario_email: string,
  acao: string,
  descricao: string,
  nome?: string,
  role?: string
) => {
  try {
    const validUnidadeId = isUuid(unidade_id) ? unidade_id : null;

    const { error } = await supabase
      .from('auditoria_logs')
      .insert([
        {
          unidade_id: validUnidadeId,
          usuario_email,
          acao,
          descricao,
          usuario_nome: nome || usuario_email,
          criado_em: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Erro ao registrar log de auditoria:', error);
    } else {
      // Dispara evento para atualizar a listagem se o componente estiver aberto
      window.dispatchEvent(new Event('refreshAuditoria'));
    }
  } catch (err) {
    console.error('Falha crítica ao registrar log:', err);
  }
};

export const registrarLog = registrarAtividade;
