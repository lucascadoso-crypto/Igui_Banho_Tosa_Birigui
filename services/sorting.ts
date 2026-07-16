/** Comparador padrão para ordenar listas de serviços (e afins) por `nome`, A→Z, tratando acentos corretamente. */
export const compareNomePtBr = (a: { nome?: string | null }, b: { nome?: string | null }) =>
  String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' });
