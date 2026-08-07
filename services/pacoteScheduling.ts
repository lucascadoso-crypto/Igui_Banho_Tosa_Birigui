// Regras de recorrência dos pacotes de fidelidade.
//
// Antes desta correção, o intervalo (7/14 dias) era sempre reconstruído a
// partir de qtd_sessoes e a próxima data era gerada somando esse intervalo
// em cima da ÚLTIMA sessão salva no banco — inclusive quando essa sessão
// tinha sido remarcada manualmente para outro dia da semana. Isso fazia o
// "padrão" (ex.: sempre sexta-feira) derivar silenciosamente para outros
// dias a cada renovação. Aqui a geração sempre realinha para o dia da
// semana original do pacote (dia_semana_preferido), mesmo partindo de uma
// última data já torta.

export const NOMES_DIA_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'
];

export const getIntervaloDias = (pacote: any): number => {
  if (pacote?.intervalo_dias) return Number(pacote.intervalo_dias);
  // Fallback para pacotes criados antes deste campo existir.
  return pacote?.qtd_sessoes === 2 ? 14 : 7;
};

// sessoesOrdenadas deve estar ordenado por data_agendamento ascendente.
export const getDiaSemanaPreferido = (pacote: any, sessoesOrdenadas: any[]): number | null => {
  if (pacote?.dia_semana_preferido !== null && pacote?.dia_semana_preferido !== undefined) {
    return Number(pacote.dia_semana_preferido);
  }
  // Fallback: usa a 1ª sessão do pacote como referência do dia "certo" —
  // é a data mais próxima da intenção original, antes de qualquer remarcação.
  const primeira = sessoesOrdenadas?.[0]?.data_agendamento;
  if (!primeira) return null;
  return new Date(`${primeira}T12:00:00`).getDay();
};

// Avança a partir de `fromDateStr` por `intervaloDias` dias e, se um dia da
// semana preferido for conhecido, ajusta para a próxima ocorrência desse dia
// (no máximo +6 dias). Como intervaloDias já é múltiplo de 7, esse ajuste só
// atua na primeira sessão gerada — as seguintes já nascem alinhadas.
export const proximaDataSessao = (fromDateStr: string, intervaloDias: number, diaSemanaPreferido: number | null): string => {
  const d = new Date(`${fromDateStr}T12:00:00`);
  d.setDate(d.getDate() + intervaloDias);
  if (diaSemanaPreferido !== null && diaSemanaPreferido !== undefined) {
    const diff = (diaSemanaPreferido - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
  }
  return d.toISOString().split('T')[0];
};
