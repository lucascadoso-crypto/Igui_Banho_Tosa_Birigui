// Links rápidos (WhatsApp / Google Maps) a partir dos dados já cadastrados
// do cliente. Sem chamada ao banco -- só formatação de texto.

/** Monta o link wa.me a partir de um telefone brasileiro em qualquer formato (com/sem DDI, com/sem máscara). */
export const buildWhatsAppLink = (telefone?: string | null): string | null => {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const comDDI = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${comDDI}`;
};

/** Monta um link de busca no Google Maps a partir do endereço estruturado do cliente. */
export const buildMapsLink = (endereco: {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}): string | null => {
  const partes = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.estado, endereco.cep]
    .filter(Boolean);
  if (partes.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(', '))}`;
};
