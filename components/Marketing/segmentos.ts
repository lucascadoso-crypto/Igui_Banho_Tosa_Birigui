export type SegmentoId = 'vip' | 'pagam_em_dia' | 'avulso_recorrente' | 'nao_renovaram' | 'inativos' | 'aniversariantes';

export interface SegmentoDef {
  id: SegmentoId;
  titulo: string;
  descricao: string;
  icon: string;
  corBg: string;
  corTexto: string;
  mensagemPadrao: string;
  brindePadrao: string;
}

export interface ClienteSegmento {
  clienteId: number | string;
  nome: string;
  telefone?: string | null;
  subtitulo?: string;
  ultimoAgendamentoId?: number | string | null;
}

// Copy inicial das mensagens/brindes por segmento. Texto editavel na tela
// antes do disparo -- nao ha catalogo de brindes no schema, entao os valores
// abaixo sao sugestoes de conteudo, nao dados de negocio.
export const SEGMENTOS: SegmentoDef[] = [
  {
    id: 'vip',
    titulo: 'VIP / mais fiéis',
    descricao: 'Pacote ativo + 2 ou mais pacotes já concluídos',
    icon: 'fa-crown',
    corBg: 'bg-amber-50',
    corTexto: 'text-amber-600',
    mensagemPadrao: 'Oi {nome}! 🐾 Você é um dos nossos clientes mais fiéis e queríamos agradecer por isso.',
    brindePadrao: '10% de desconto no próximo pacote'
  },
  {
    id: 'pagam_em_dia',
    titulo: 'Pagam em dia',
    descricao: 'Pacote ativo, sempre pago até o 2º banho',
    icon: 'fa-circle-check',
    corBg: 'bg-emerald-50',
    corTexto: 'text-emerald-600',
    mensagemPadrao: 'Oi {nome}! 🐾 Obrigado por manter seu pacote sempre em dia com a gente.',
    brindePadrao: 'Prioridade de agenda no próximo banho'
  },
  {
    id: 'avulso_recorrente',
    titulo: 'Avulso recorrente',
    descricao: '2+ banhos avulsos e nunca teve pacote',
    icon: 'fa-repeat',
    corBg: 'bg-orange-50',
    corTexto: 'text-orange-600',
    mensagemPadrao: 'Oi {nome}! 🐾 Notamos que você já trouxe seu pet algumas vezes com a gente. Que tal economizar com um pacote?',
    brindePadrao: 'Desconto especial ao fechar um pacote esta semana'
  },
  {
    id: 'nao_renovaram',
    titulo: 'Não renovaram',
    descricao: 'Pacote vencido há 30-60 dias, sem novo pacote',
    icon: 'fa-hourglass-half',
    corBg: 'bg-rose-50',
    corTexto: 'text-rose-600',
    mensagemPadrao: 'Oi {nome}! 🐾 Faz um tempinho que seu pacote venceu. Vamos renovar?',
    brindePadrao: 'Renovação com desconto nesta semana'
  },
  {
    id: 'inativos',
    titulo: 'Inativos',
    descricao: 'Sem banho finalizado há mais de 60 dias',
    icon: 'fa-moon',
    corBg: 'bg-slate-100',
    corTexto: 'text-slate-500',
    mensagemPadrao: 'Oi {nome}! 🐾 Sentimos sua falta por aqui! Vamos marcar um banho para o seu pet?',
    brindePadrao: 'Cupom de volta com desconto no próximo banho'
  },
  {
    id: 'aniversariantes',
    titulo: 'Aniversariantes',
    descricao: 'Aniversário no mês corrente',
    icon: 'fa-cake-candles',
    corBg: 'bg-purple-50',
    corTexto: 'text-purple-600',
    mensagemPadrao: 'Parabéns, {nome}! 🎉🐾 Toda a equipe deseja um mês maravilhoso!',
    brindePadrao: 'Banho de aniversário com mimo especial'
  }
];
