import { toCurrencyNumber } from './appointmentTotals';

/**
 * "Ações do dia" do Dashboard Gerencial: contadores que reaproveitam as
 * mesmas views/funções já usadas pelos filtros rápidos de Clientes (CRM,
 * Prompt 1) e pelo Financeiro Geral (Prompt 2) — sem duplicar regra nenhuma.
 * Resolvidos numa única função SQL (fn_dashboard_acoes_do_dia, 0072) para
 * não somar 5 round-trips concorrentes às várias chamadas que o Dashboard já
 * dispara ao carregar.
 */
export interface AcoesDoDia {
  petsAtrasados: number;
  pacotesAcabando: number;
  clientesNaoRenovaram: number;
  pendenciasACobrar: { qtd: number; valor: number };
  aniversariantesSemana: number;
}

export const fetchAcoesDoDia = async (
  supabaseClient: any,
  unidadeId: number | null,
  dataInicio: string,
  dataFim: string,
  hojeBR: string
): Promise<AcoesDoDia> => {
  const { data, error } = await supabaseClient.rpc('fn_dashboard_acoes_do_dia', {
    p_unidade_id: unidadeId,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_hoje: hojeBR
  });
  if (error) throw error;

  return {
    petsAtrasados: toCurrencyNumber(data?.pets_atrasados),
    pacotesAcabando: toCurrencyNumber(data?.pacotes_acabando),
    clientesNaoRenovaram: toCurrencyNumber(data?.clientes_nao_renovaram),
    pendenciasACobrar: {
      qtd: toCurrencyNumber(data?.pendencias_qtd),
      valor: toCurrencyNumber(data?.pendencias_valor)
    },
    aniversariantesSemana: toCurrencyNumber(data?.aniversariantes_semana)
  };
};
