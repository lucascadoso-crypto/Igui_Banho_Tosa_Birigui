import React, { useEffect, useMemo, useState } from 'react';
import { Unit, UserProfile } from '../types';

interface FiscalHistoryProps {
  supabaseClient: any;
  unit?: Unit;
  clientId?: number;
  compact?: boolean;
  userProfile?: UserProfile;
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

const FiscalHistory: React.FC<FiscalHistoryProps> = ({ supabaseClient, unit, clientId, compact = false, userProfile }) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedNote, setSelectedNote] = useState<any | null>(null);

  const canManageNotes = ['master', 'financeiro'].includes(userProfile?.cargo || '');

  const [issuingNote, setIssuingNote] = useState<any | null>(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [codigoVerificacao, setCodigoVerificacao] = useState('');
  const [urlDocumento, setUrlDocumento] = useState('');
  const [issuingSaving, setIssuingSaving] = useState(false);
  const [issuingError, setIssuingError] = useState('');

  const [cancelingNote, setCancelingNote] = useState<any | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelingSaving, setCancelingSaving] = useState(false);
  const [cancelingError, setCancelingError] = useState('');

  const [deletingNote, setDeletingNote] = useState<any | null>(null);
  const [deletingSaving, setDeletingSaving] = useState(false);
  const [deletingError, setDeletingError] = useState('');

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

  const resumo = useMemo(() => {
    return filteredNotes.reduce(
      (acc, note) => {
        if (note.status === 'RASCUNHO') acc.totalRascunho += Number(note.valor_total || 0);
        if (note.status === 'EMITIDA') acc.totalEmitido += Number(note.valor_total || 0);
        return acc;
      },
      { totalRascunho: 0, totalEmitido: 0 }
    );
  }, [filteredNotes]);

  const openIssueModal = (note: any) => {
    setIssuingError('');
    setNumeroNota('');
    setDataEmissao(new Date().toISOString().slice(0, 10));
    setCodigoVerificacao('');
    setUrlDocumento('');
    setIssuingNote(note);
  };

  const handleMarkIssued = async () => {
    if (!issuingNote) return;
    setIssuingSaving(true);
    setIssuingError('');
    try {
      const { error } = await supabaseClient.rpc('marcar_nota_fiscal_emitida', {
        p_nota_fiscal_id: issuingNote.id,
        p_numero_nota: numeroNota,
        p_data_emissao: dataEmissao ? new Date(`${dataEmissao}T12:00:00`).toISOString() : null,
        p_codigo_verificacao: codigoVerificacao || null,
        p_url_documento: urlDocumento || null
      });
      if (error) throw error;
      setIssuingNote(null);
      await fetchNotes();
    } catch (err: any) {
      console.error('Erro ao marcar nota como emitida:', err);
      setIssuingError(err.message || 'Falha ao marcar nota como emitida.');
    } finally {
      setIssuingSaving(false);
    }
  };

  const openCancelModal = (note: any) => {
    setCancelingError('');
    setMotivoCancelamento('');
    setCancelingNote(note);
  };

  const handleCancelNote = async () => {
    if (!cancelingNote) return;
    setCancelingSaving(true);
    setCancelingError('');
    try {
      const { error } = await supabaseClient.rpc('cancelar_nota_fiscal', {
        p_nota_fiscal_id: cancelingNote.id,
        p_motivo: motivoCancelamento
      });
      if (error) throw error;
      setCancelingNote(null);
      await fetchNotes();
    } catch (err: any) {
      console.error('Erro ao cancelar nota fiscal:', err);
      setCancelingError(err.message || 'Falha ao cancelar nota fiscal.');
    } finally {
      setCancelingSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!deletingNote) return;
    setDeletingSaving(true);
    setDeletingError('');
    try {
      const { error } = await supabaseClient.from('notas_fiscais').delete().eq('id', deletingNote.id);
      if (error) throw error;
      setDeletingNote(null);
      await fetchNotes();
    } catch (err: any) {
      console.error('Erro ao excluir rascunho fiscal:', err);
      setDeletingError(err.message || 'Falha ao excluir rascunho fiscal.');
    } finally {
      setDeletingSaving(false);
    }
  };

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

      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pendente de emissao (rascunho)</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(resumo.totalRascunho)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Emitido no periodo filtrado</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(resumo.totalEmitido)}</p>
          </div>
        </div>
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
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button onClick={() => setSelectedNote(note)} className="px-4 py-2 rounded-xl bg-teal-50 text-teal-700 font-black text-[10px] uppercase tracking-widest">
                            Ver rascunho
                          </button>
                          {canManageNotes && note.status === 'RASCUNHO' && (
                            <>
                              <button onClick={() => openIssueModal(note)} className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase tracking-widest">
                                Marcar como emitida
                              </button>
                              <button onClick={() => setDeletingNote(note)} className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 font-black text-[10px] uppercase tracking-widest">
                                Excluir
                              </button>
                            </>
                          )}
                          {canManageNotes && note.status === 'EMITIDA' && (
                            <button onClick={() => openCancelModal(note)} className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 font-black text-[10px] uppercase tracking-widest">
                              Cancelar
                            </button>
                          )}
                        </div>
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
                  {canManageNotes && (note.status === 'RASCUNHO' || note.status === 'EMITIDA') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {note.status === 'RASCUNHO' && (
                        <>
                          <button onClick={() => openIssueModal(note)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase tracking-widest">
                            Marcar como emitida
                          </button>
                          <button onClick={() => setDeletingNote(note)} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 font-black text-[10px] uppercase tracking-widest">
                            Excluir
                          </button>
                        </>
                      )}
                      {note.status === 'EMITIDA' && (
                        <button onClick={() => openCancelModal(note)} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 font-black text-[10px] uppercase tracking-widest">
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
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
              <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest">Dados do tomador (para emitir no Portal Nacional)</p>
                  <button
                    onClick={() => {
                      const texto = [
                        `Nome: ${selectedNote.tomador_nome || '-'}`,
                        `CPF/CNPJ: ${selectedNote.tomador_cpf_cnpj || '-'}`,
                        `E-mail: ${selectedNote.tomador_email || '-'}`,
                        `Telefone: ${selectedNote.tomador_telefone || '-'}`,
                        `Endereco: ${selectedNote.tomador_endereco || '-'}`,
                        `Valor: ${formatCurrency(selectedNote.valor_total)}`,
                        `Descricao: ${selectedNote.descricao_servico || '-'}`
                      ].join('\n');
                      navigator.clipboard?.writeText(texto);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-black text-[9px] uppercase tracking-widest shrink-0"
                  >
                    Copiar dados
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome</p>
                    <p className="text-sm font-black text-slate-800">{selectedNote.tomador_nome || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">CPF/CNPJ</p>
                    <p className="text-sm font-black text-slate-800">{selectedNote.tomador_cpf_cnpj || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">E-mail</p>
                    <p className="text-sm font-black text-slate-800">{selectedNote.tomador_email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Telefone</p>
                    <p className="text-sm font-black text-slate-800">{selectedNote.tomador_telefone || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Endereco</p>
                    <p className="text-sm font-black text-slate-800">{selectedNote.tomador_endereco || '-'}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                <p className="text-sm font-black text-slate-800">{formatCurrency(selectedNote.valor_total)}</p>
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

      {issuingNote && (
        <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel w-full max-w-lg bg-white rounded-[2rem] shadow-2xl max-h-[calc(100dvh-24px)] overflow-y-auto">
            <header className="sticky top-0 bg-white p-6 border-b border-slate-100 flex items-start justify-between gap-4 rounded-t-[2rem]">
              <div>
                <h3 className="text-xl font-black text-slate-900">Marcar nota #{issuingNote.id} como emitida</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">Emitida manualmente no Portal Nacional de NFS-e. Registre os dados aqui.</p>
              </div>
              <button onClick={() => setIssuingNote(null)} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 shrink-0">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-4">
              {issuingError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-rose-700 font-bold text-sm">{issuingError}</div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Numero da NFS-e *</label>
                <input value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de emissao *</label>
                <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chave/codigo de verificacao (opcional)</label>
                <input value={codigoVerificacao} onChange={(e) => setCodigoVerificacao(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link do documento (opcional)</label>
                <input value={urlDocumento} onChange={(e) => setUrlDocumento(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
              </div>
              <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
                <button onClick={() => setIssuingNote(null)} className="w-full md:flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                  Cancelar
                </button>
                <button
                  onClick={handleMarkIssued}
                  disabled={issuingSaving || !numeroNota.trim() || !dataEmissao}
                  className="w-full md:flex-[2] py-4 rounded-2xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {issuingSaving ? 'Salvando...' : 'Marcar como emitida'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelingNote && (
        <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel w-full max-w-lg bg-white rounded-[2rem] shadow-2xl max-h-[calc(100dvh-24px)] overflow-y-auto">
            <header className="sticky top-0 bg-white p-6 border-b border-slate-100 flex items-start justify-between gap-4 rounded-t-[2rem]">
              <div>
                <h3 className="text-xl font-black text-slate-900">Cancelar nota #{cancelingNote.id}</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">Numero {cancelingNote.numero_nota || '-'}. Informe o motivo do cancelamento.</p>
              </div>
              <button onClick={() => setCancelingNote(null)} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 shrink-0">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-4">
              {cancelingError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-rose-700 font-bold text-sm">{cancelingError}</div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo do cancelamento *</label>
                <textarea value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none resize-none" />
              </div>
              <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
                <button onClick={() => setCancelingNote(null)} className="w-full md:flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                  Voltar
                </button>
                <button
                  onClick={handleCancelNote}
                  disabled={cancelingSaving || !motivoCancelamento.trim()}
                  className="w-full md:flex-[2] py-4 rounded-2xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-500/20 disabled:opacity-50"
                >
                  {cancelingSaving ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingNote && (
        <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel w-full max-w-md bg-white rounded-[2rem] shadow-2xl">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-black text-slate-900">Excluir rascunho #{deletingNote.id}?</h3>
              <p className="text-sm font-bold text-slate-500">Essa acao nao pode ser desfeita. O rascunho fiscal sera removido permanentemente.</p>
              {deletingError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-rose-700 font-bold text-sm">{deletingError}</div>
              )}
              <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
                <button onClick={() => setDeletingNote(null)} className="w-full md:flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                  Voltar
                </button>
                <button
                  onClick={handleDeleteDraft}
                  disabled={deletingSaving}
                  className="w-full md:flex-[2] py-4 rounded-2xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-500/20 disabled:opacity-50"
                >
                  {deletingSaving ? 'Excluindo...' : 'Excluir rascunho'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalHistory;
