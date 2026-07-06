
import React, { useEffect, useState } from 'react';
import { Client, ClienteDuplicadoPendente, ClienteMergeLog, Unit, UserProfile } from '../types';
import { registrarAtividade } from '../services/logger';

interface ClientesViaLinkProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
}

const BRAND = '#00BFA5';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
};

const ClientesViaLink: React.FC<ClientesViaLinkProps> = ({ unit, supabaseClient, userProfile, onClose }) => {
  const isMaster = userProfile?.cargo === 'master';
  const [tab, setTab] = useState<'duplicados' | 'merges'>('duplicados');
  const [loading, setLoading] = useState(false);
  const [pendentes, setPendentes] = useState<ClienteDuplicadoPendente[]>([]);
  const [merges, setMerges] = useState<ClienteMergeLog[]>([]);
  const [processingId, setProcessingId] = useState<number | string | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    try {
      const [pendentesResult, mergesResult] = await Promise.all([
        supabaseClient
          .from('clientes_duplicados_pendentes')
          .select('*, cliente_existente:clientes!cliente_id_existente(*), cliente_novo:clientes!cliente_id_novo(*)')
          .eq('status', 'pendente')
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('clientes_merge_log')
          .select('*, cliente:clientes!cliente_id(*)')
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (pendentesResult.error) throw pendentesResult.error;
      if (mergesResult.error) throw mergesResult.error;

      setPendentes(pendentesResult.data || []);
      setMerges(mergesResult.data || []);
    } catch (err: any) {
      console.error('Erro ao carregar cadastros via link:', err);
      showToast('Erro ao carregar dados de revisão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [unit.id]);

  const handleMesclar = async (item: ClienteDuplicadoPendente) => {
    setProcessingId(item.id);
    try {
      const { error } = await supabaseClient.rpc('mesclar_clientes', {
        p_manter_id: item.cliente_id_existente,
        p_remover_id: item.cliente_id_novo
      });
      if (error) throw error;

      await registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'MESCLAR_CLIENTES',
        `Mesclou o cliente #${item.cliente_id_novo} no cliente #${item.cliente_id_existente}.`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showToast('Clientes mesclados com sucesso.');
      window.dispatchEvent(new Event('refreshClientes'));
      fetchData();
    } catch (err: any) {
      console.error('Erro ao mesclar clientes:', err);
      showToast(err.message || 'Erro ao mesclar clientes.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejeitar = async (item: ClienteDuplicadoPendente) => {
    setProcessingId(item.id);
    try {
      const { error } = await supabaseClient.rpc('rejeitar_duplicado_cliente', { p_id: item.id });
      if (error) throw error;

      showToast('Marcado como clientes diferentes.');
      fetchData();
    } catch (err: any) {
      console.error('Erro ao rejeitar duplicado:', err);
      showToast(err.message || 'Erro ao atualizar revisão.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDetectarRetroativos = async () => {
    setDetectando(true);
    try {
      const { data, error } = await supabaseClient.rpc('detectar_duplicados_retroativos');
      if (error) throw error;

      showToast(`Fila atualizada (${data ?? 0} duplicados pendentes por telefone).`);
      fetchData();
    } catch (err: any) {
      console.error('Erro ao detectar duplicados retroativos:', err);
      showToast(err.message || 'Erro ao detectar duplicados retroativos.', 'error');
    } finally {
      setDetectando(false);
    }
  };

  const renderClientResumo = (client?: Client) => {
    if (!client) return <p className="text-sm text-slate-400 italic">Cadastro não encontrado.</p>;
    return (
      <div className="space-y-1">
        <p className="font-black text-slate-800">{client.nome}</p>
        <p className="text-xs font-bold text-slate-500">
          <i className="fa-brands fa-whatsapp mr-1.5 text-emerald-500"></i>{client.telefone || 'sem telefone'}
        </p>
        <p className="text-xs font-bold text-slate-500">CPF: {client.cpf || '-'}</p>
        <p className="text-xs text-slate-400">
          {[client.logradouro, client.numero, client.bairro, client.cidade, client.estado].filter(Boolean).join(', ') || 'sem endereço'}
        </p>
      </div>
    );
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 overflow-y-auto">
      {toast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[130] px-6 py-3 rounded-2xl shadow-2xl text-white font-bold ${toast.type === 'success' ? 'bg-[#00BFA5]' : 'bg-rose-500'}`}>
          {toast.text}
        </div>
      )}

      <div className="app-modal-panel bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: BRAND }}>Clientes &gt; Cadastros via link</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">Revisão de cadastros via link</h3>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="px-6 md:px-8 pt-5 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setTab('duplicados')}
            className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${tab === 'duplicados' ? 'text-white shadow-lg' : 'bg-slate-50 text-slate-500'}`}
            style={tab === 'duplicados' ? { backgroundColor: BRAND } : undefined}
          >
            Possíveis duplicados {pendentes.length > 0 && `(${pendentes.length})`}
          </button>
          <button
            onClick={() => setTab('merges')}
            className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${tab === 'merges' ? 'text-white shadow-lg' : 'bg-slate-50 text-slate-500'}`}
            style={tab === 'merges' ? { backgroundColor: BRAND } : undefined}
          >
            Merges automáticos
          </button>

          {isMaster && tab === 'duplicados' && (
            <button
              onClick={handleDetectarRetroativos}
              disabled={detectando}
              className="ml-auto px-5 py-3 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {detectando ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-magnifying-glass mr-2"></i>}
              Detectar duplicados retroativos
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 font-black uppercase tracking-widest">
              <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Carregando...
            </div>
          ) : tab === 'duplicados' ? (
            pendentes.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center">
                <i className="fa-solid fa-circle-check text-5xl text-slate-100 mb-4"></i>
                <p className="text-slate-400 font-bold">Nenhum duplicado pendente de revisão.</p>
              </div>
            ) : (
              pendentes.map(item => (
                <div key={item.id} className="rounded-3xl border border-amber-100 bg-amber-50/40 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">
                      {item.motivo === 'nome_similar' ? 'Nome parecido' : item.motivo === 'retroativo_telefone' ? 'Mesmo telefone (retroativo)' : item.motivo}
                    </span>
                    {item.similaridade != null && (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Similaridade: {(Number(item.similaridade) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Cadastro existente</p>
                      {renderClientResumo(item.cliente_existente)}
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Cadastro novo (via link)</p>
                      {renderClientResumo(item.cliente_novo)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button
                      onClick={() => handleMesclar(item)}
                      disabled={processingId === item.id}
                      className="flex-1 py-3 rounded-2xl text-white font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-50"
                      style={{ backgroundColor: BRAND }}
                    >
                      É o mesmo cliente (mesclar)
                    </button>
                    <button
                      onClick={() => handleRejeitar(item)}
                      disabled={processingId === item.id}
                      className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest disabled:opacity-50"
                    >
                      São clientes diferentes (criar novo)
                    </button>
                  </div>
                </div>
              ))
            )
          ) : merges.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center">
              <i className="fa-solid fa-link text-5xl text-slate-100 mb-4"></i>
              <p className="text-slate-400 font-bold">Nenhum merge automático registrado ainda.</p>
            </div>
          ) : (
            merges.map(log => (
              <div key={log.id} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h5 className="font-black text-slate-900">{log.cliente?.nome || `Cliente #${log.cliente_id}`}</h5>
                    <span className="shrink-0 bg-indigo-50 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-indigo-100">
                      <i className="fa-solid fa-link mr-1"></i>Atualizado via link
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">{formatDate(log.created_at)}</span>
                </div>
                {log.cliente_removido_id && (
                  <p className="text-xs font-bold text-slate-500 mb-2">Mesclado com o cadastro #{log.cliente_removido_id} (marcado como inativo).</p>
                )}
                {Object.keys(log.campos_alterados || {}).filter(k => k !== 'cliente_removido_id' && k !== 'cliente_removido_nome').length > 0 && (
                  <div className="text-xs text-slate-500 space-y-1">
                    {Object.entries(log.campos_alterados || {})
                      .filter(([campo]) => campo !== 'cliente_removido_id' && campo !== 'cliente_removido_nome')
                      .map(([campo, diff]: [string, any]) => (
                        <p key={campo}>
                          <span className="font-black text-slate-600 capitalize">{campo}:</span>{' '}
                          <span className="line-through text-slate-400">{diff?.antes || '(vazio)'}</span>{' '}
                          <i className="fa-solid fa-arrow-right mx-1 text-slate-300"></i>
                          <span className="font-bold text-slate-700">{diff?.depois}</span>
                        </p>
                      ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientesViaLink;
