import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';

interface NotaFiscalBadgeProps {
  supabaseClient: any;
  userProfile?: UserProfile;
  agendamentoId?: number | string;
  pacoteId?: number | string;
}

const statusClasses: Record<string, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600',
  AGUARDANDO_CONFIGURACAO: 'bg-amber-100 text-amber-700',
  PRONTA_PARA_EMITIR: 'bg-teal-100 text-teal-700',
  EM_PROCESSAMENTO: 'bg-indigo-100 text-indigo-700',
  EMITIDA: 'bg-emerald-100 text-emerald-700',
  REJEITADA: 'bg-rose-100 text-rose-700',
  CANCELADA: 'bg-zinc-200 text-zinc-600'
};

const statusLabels: Record<string, string> = {
  RASCUNHO: 'Nota fiscal: rascunho pendente',
  AGUARDANDO_CONFIGURACAO: 'Nota fiscal: aguardando configuração',
  PRONTA_PARA_EMITIR: 'Nota fiscal: pronta para emitir',
  EM_PROCESSAMENTO: 'Nota fiscal: em processamento',
  EMITIDA: 'Nota fiscal: emitida',
  REJEITADA: 'Nota fiscal: rejeitada',
  CANCELADA: 'Nota fiscal: cancelada'
};

/**
 * Badge somente-leitura do status fiscal do agendamento/pacote. A criação e
 * emissão/cancelamento da nota continuam em Financeiro > Notas Fiscais; aqui
 * só indicamos se já existe nota e em que status, para o atendente saber
 * onde ir sem duplicar a lógica de criação em outro lugar.
 */
const NotaFiscalBadge: React.FC<NotaFiscalBadgeProps> = ({ supabaseClient, userProfile, agendamentoId, pacoteId }) => {
  const [nota, setNota] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  const canView = ['master', 'financeiro', 'gerente', 'admin_unidade', 'administrador'].includes(userProfile?.cargo || '');

  useEffect(() => {
    if (!canView || !supabaseClient || (!agendamentoId && !pacoteId)) {
      setLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let query = supabaseClient
          .from('notas_fiscais')
          .select('id, status, numero_nota')
          .order('created_at', { ascending: false })
          .limit(1);

        query = agendamentoId ? query.eq('agendamento_id', agendamentoId) : query.eq('pacote_id', pacoteId);

        const { data, error } = await query.maybeSingle();
        if (!cancelled) {
          if (error) throw error;
          setNota(data || null);
        }
      } catch (err) {
        console.error('Erro ao carregar status fiscal:', err);
        if (!cancelled) setNota(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [supabaseClient, agendamentoId, pacoteId, canView]);

  if (!canView || !loaded) return null;

  if (!nota) {
    return (
      <span className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-400">
        Sem nota fiscal — gerar em Financeiro &gt; Notas Fiscais
      </span>
    );
  }

  return (
    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClasses[nota.status] || statusClasses.RASCUNHO}`}>
      {statusLabels[nota.status] || nota.status}{nota.numero_nota ? ` (${nota.numero_nota})` : ''}
    </span>
  );
};

export default NotaFiscalBadge;
