
import { supabase } from './supabaseClient';

const toBusinessId = (val: unknown): number | null => {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
  return null;
};

/**
 * Registra uma ação na tabela de auditoria.
 * @param unidade_id ID da unidade onde a ação ocorreu.
 * @param usuario_email Email do usuário que realizou a ação.
 * @param acao Tipo da ação (ex: 'NOVO_CLIENTE', 'EDICAO_GASTO').
 * @param descricao Descrição detalhada da ação.
 */
export const registrarAtividade = async (
  unidade_id: number | string | null | undefined,
  usuario_email: string,
  acao: string,
  descricao: string,
  nome?: string,
  role?: string
) => {
  try {
    const validUnidadeId = toBusinessId(unidade_id);

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
