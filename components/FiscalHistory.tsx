import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../types';

interface FiscalHistoryProps {
  supabaseClient: any;
  unit?: Unit;
  clientId?: number;
  compact?: boolean;
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

const FiscalHistory: React.FC<FiscalHistoryProps> = ({ supabaseClient, unit, clientId, compact = false }) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedNote, setSelectedNote] = useState<any | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [unit?.id, clientId, statusFilter, periodStart, periodEnd]);

  const fetchNotes = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    try {
      let query = supabaseClient
        .from('notas_fiscais')
        .select(`
          *,
          clientes(nome, cpf),
          agendamentos(id, data_agendamento, pets(nome)),
          pacotes(id, pets(nome)),
          financeiro_movimentos(id, descricao),
          nota_fiscal_itens(*)
        `)
        .order('created_at', { ascending: false });

      if (unit?.id) query = query.eq('unidade_id', unit.id);
      if (clientId) query = query.eq('cliente_id', clientId);
      if (statusFilter) query = query.eq('status', statusFilter);
      if (periodStart) query = query.gte('data_competencia', periodStart);
      if (periodEnd) query = query.lte('data_competencia', periodEnd);

      const { data, error } = await query;
      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Erro ao carregar historico fiscal:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter(note => {
      const text = [
        note.tomador_nome,
        note.clientes?.nome,
        note.tomador_cpf_cnpj,
        note.descricao_servico,
        note.numero_nota,
        note.agendamento_id,
        note.pacote_id
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [notes, search]);

  const formatDate = (date?: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') : '-';
  const formatDateTime = (date?: string) => date ? new Date(date).toLocaleString('pt-BR') : '-';
  const formatCurrency = (value: any) => `R$ ${Number(value || 0).toFixed(2)}`;

  const getOrigin = (note: any) => {
    if (note.agendamento_id) return `Agendamento #${note.agendamento_id}`;
    if (note.pacote_id) return `Pacote #${note.pacote_id}`;
    if (note.financeiro_movimento_id) return `Financeiro #${note.financeiro_movimento_id}`;
    return 'Rascunho manual';
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {!compact && (
        <header className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 md:p-8">
          <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em]">Financeiro &gt; Notas Fiscais</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">Historico Fiscal</h3>
          <p className="text-sm font-bold text-slate-400 mt-1">Rascunhos e historico interno. Nenhuma NFS-e real e emitida nesta fase.</p>
        </header>
      )}

      {!compact && (
        <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, CPF/CNPJ, agendamento..." className="md:col-span-2 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm" />
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm" />
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm">
              <option value="">Todos os status</option>
              <option value="RASCUNHO">Rascunho</option>
              <option value="AGUARDANDO_CONFIGURACAO">Aguardando configuracao</option>
              <option value="PRONTA_PARA_EMITIR">Pronta para emitir</option>
              <option value="EMITIDA">Emitida</option>
              <option value="REJEITADA">Rejeitada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
        </section>
      )}

      <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 font-black uppercase tracking-widest">
            <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Carregando notas...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <i className="fa-solid fa-file-invoice text-4xl mb-4"></i>
            <p className="font-black uppercase tracking-widest text-sm">Nenhum rascunho fiscal encontrado</p>
            <p className="text-xs font-bold mt-2">Os rascunhos criados aparecerao aqui.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Origem</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Competencia</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Numero</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredNotes.map(note => (
                    <tr key={note.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClasses[note.status] || statusClasses.RASCUNHO}`}>
                          {note.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-800">{note.tomador_nome || note.clientes?.nome || 'Cliente nao informado'}</p>
                        <p className="text-[10px] font-bold text-slate-400">{note.tomador_cpf_cnpj || note.clientes?.cpf || 'CPF/CNPJ pendente'}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{getOrigin(note)}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDate(note.data_competencia)}</td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">{formatCurrency(note.valor_total)}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-400">{note.numero_nota || 'Futuro'}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedNote(note)} className="px-4 py-2 rounded-xl bg-teal-50 text-teal-700 font-black text-[10px] uppercase tracking-widest">
                          Ver rascunho
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {filteredNotes.map(note => (
                <article key={note.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-slate-900">{note.tomador_nome || note.clientes?.nome || 'Cliente'}</p>
                      <p className="text-xs font-bold text-slate-400 mt-1">{getOrigin(note)}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${statusClasses[note.status] || statusClasses.RASCUNHO}`}>
                      {note.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold text-slate-500">
                    <span>Competencia: {formatDate(note.data_competencia)}</span>
                    <span className="text-right text-slate-900 font-black">{formatCurrency(note.valor_total)}</span>
                    <span>Numero: {note.numero_nota || 'Futuro'}</span>
                    <button onClick={() => setSelectedNote(note)} className="text-right text-teal-700 font-black uppercase">
                      Ver rascunho
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedNote && (
        <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl max-h-[calc(100dvh-24px)] overflow-y-auto">
            <header className="sticky top-0 bg-white p-6 border-b border-slate-100 flex items-start justify-between gap-4 rounded-t-[2rem]">
              <div>
                <h3 className="text-xl font-black text-slate-900">Rascunho fiscal #{selectedNote.id}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Emissao oficial ainda nao configurada</p>
              </div>
              <button onClick={() => setSelectedNote(null)} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descricao</p>
                <p className="text-sm font-bold text-slate-700 mt-1 whitespace-pre-wrap">{selectedNote.descricao_servico || 'Sem descricao fiscal.'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data confirmacao pagamento</p>
                  <p className="text-sm font-black text-slate-800">{formatDateTime(selectedNote.data_confirmacao_pagamento)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data competencia</p>
                  <p className="text-sm font-black text-slate-800">{formatDate(selectedNote.data_competencia)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data emissao</p>
                  <p className="text-sm font-black text-slate-800">{formatDateTime(selectedNote.data_emissao)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tomador</p>
                  <p className="text-sm font-black text-slate-800">{selectedNote.tomador_nome || '-'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                  <p className="text-sm font-black text-slate-800">{formatCurrency(selectedNote.valor_total)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens</p>
                {(selectedNote.nota_fiscal_itens || []).map((item: any) => (
                  <div key={item.id} className="flex justify-between gap-4 rounded-2xl bg-white border border-slate-100 p-4 text-sm">
                    <span className="font-bold text-slate-700">{item.descricao}</span>
                    <span className="font-black text-slate-900">{formatCurrency(item.valor_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalHistory;
