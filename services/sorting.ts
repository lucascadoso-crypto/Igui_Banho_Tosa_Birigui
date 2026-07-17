/**
 * Comparador padrão para ordenar listas de serviços (e afins) por `nome`, A→Z, tratando acentos
 * corretamente. Usa `.trim()` porque alguns registros têm espaços extras no início/fim do nome
 * cadastrado (dado legado), o que faria esses itens "pularem" para o início da lista.
 */
export const compareNomePtBr = (a: { nome?: string | null }, b: { nome?: string | null }) =>
  String(a?.nome || '').trim().localeCompare(String(b?.nome || '').trim(), 'pt-BR', { sensitivity: 'base' });
