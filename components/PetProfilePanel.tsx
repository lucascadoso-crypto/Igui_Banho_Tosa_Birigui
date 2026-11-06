
import React, { useEffect, useState } from 'react';
import { Client, Pet, UiId, UserProfile } from '../types';
import PetFormModal from './PetFormModal';
import PetSpeciesTag from './PetSpeciesTag';
import { COMPORTAMENTO_TAGS } from './petComportamentoTags';

interface PetProfilePanelProps {
  pet: Pet;
  client: Client;
  unitId: UiId;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
  onChanged?: () => void;
  zBoost?: number;
}

// Linha de public.crm_pet_retorno (ver supabase/migrations/0063_crm_pet_retorno_view.sql).
interface CrmPetRetornoRow {
  pet_id: number | string;
  total_atendimentos_finalizados: number;
  intervalo_medio_dias: number | null;
  ultimo_atendimento: string | null;
  proximo_retorno_previsto: string | null;
  dias_atraso: number;
  status_retorno: 'em_dia' | 'atrasado' | 'sem_historico';
}

interface TimelineItem {
  uniqueId: string;
  dataExibicao: string | null;
  status: string;
  valor_total: number;
  pago: boolean;
  funcionarios?: { nome: string } | null;
  agendamento_itens?: { servicos?: { nome: string } | null }[];
}

const tealColor = '#00BFA5';

const PetProfilePanel: React.FC<PetProfilePanelProps> = ({
  pet,
  client,
  unitId,
  supabaseClient,
  userProfile,
  onClose,
  onChanged,
  zBoost = 0
}) => {
  const [retorno, setRetorno] = useState<CrmPetRetornoRow | null>(null);
  const [loadingRetorno, setLoadingRetorno] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [localToast, setLocalToast] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ text, type });
    setTimeout(() => setLocalToast(null), 3000);
  };

  useEffect(() => {
    fetchRetorno();
    fetchTimeline();
  }, [pet.id]);

  const fetchRetorno = async () => {
    setLoadingRetorno(true);
    try {
      const { data, error } = await supabaseClient
        .from('crm_pet_retorno')
        .select('*')
        .eq('pet_id', pet.id)
        .maybeSingle();
      if (error) throw error;
      setRetorno(data || null);
    } catch (err) {
      console.error('Erro ao buscar ciclo de retorno do pet:', err);
    } finally {
      setLoadingRetorno(false);
    }
  };

  const fetchTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const { data, error } = await supabaseClient
        .from('agendamentos')
        .select(`
          id,
          data_agendamento,
          data_fim_real,
          status,
          valor_total,
          pago,
          funcionarios(nome),
          agendamento_itens(servicos(nome))
        `)
        .eq('pet_id', pet.id)
        .order('data_agendamento', { ascending: false });

      if (error) throw error;

      const processed = (data || []).map((item: any) => ({
        ...item,
        uniqueId: `pet-hist-${item.id}`,
        dataExibicao: item.data_fim_real ? String(item.data_fim_real).substring(0, 10) : item.data_agendamento
      }));
      setTimeline(processed);
    } catch (err) {
      console.error('Erro ao buscar linha do tempo do pet:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    return new Date(`${String(dateString).substring(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  };

  const calcIdade = (dataNasc?: string | null) => {
    if (!dataNasc) return null;
    const nasc = new Date(`${String(dataNasc).substring(0, 10)}T12:00:00`);
    if (isNaN(nasc.getTime())) return null;
    const now = new Date();
    let anos = now.getFullYear() - nasc.getFullYear();
    const beforeBirthday = now.getMonth() < nasc.getMonth() || (now.getMonth() === nasc.getMonth() && now.getDate() < nasc.getDate());
    if (beforeBirthday) anos -= 1;
    return anos >= 0 ? anos : null;
  };

  const idade = calcIdade(pet.data_nascimento);
  const tagsAtivas = COMPORTAMENTO_TAGS.filter(t => (pet.comportamento_tags || []).includes(t.value));

  const statusRetornoInfo = {
    em_dia: { label: 'Em dia', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: 'fa-circle-check' },
    atrasado: { label: 'Atrasado', color: 'bg-rose-50 text-rose-600 border-rose-100', icon: 'fa-triangle-exclamation' },
    sem_historico: { label: 'Sem histórico', color: 'bg-slate-100 text-slate-500 border-slate-200', icon: 'fa-circle-info' }
  } as const;

  return (
    <div className={`app-modal-overlay fixed inset-0 z-[${60 + zBoost}] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 overflow-y-auto overflow-x-hidden`}>
      {localToast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[${120 + zBoost}] px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 text-white font-black text-xs uppercase tracking-widest flex items-center space-x-2 ${localToast.type === 'success' ? 'bg-[#00BFA5]' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${localToast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
          <span>{localToast.text}</span>
        </div>
      )}
      <div className="app-modal-panel bg-gray-50 w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] mx-auto md:max-w-5xl md:w-full rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-y-auto overflow-x-hidden md:overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[calc(100vh-24px)] md:max-h-[90vh]">
        <header className="bg-white px-5 md:px-10 pt-5 md:pt-10 pb-5 md:pb-8 border-b border-slate-100 shrink-0 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 md:gap-6 min-w-0">
            <div className="w-16 h-16 md:w-24 md:h-24 rounded-[1.5rem] bg-slate-100 border-4 border-slate-50 flex items-center justify-center text-slate-300 overflow-hidden shrink-0">
              {pet.foto_url ? (
                <img src={pet.foto_url} alt={pet.nome} className="w-full h-full object-cover" />
              ) : (
                <i className="fa-solid fa-dog text-2xl md:text-3xl"></i>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-black text-slate-800 truncate">{pet.nome}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <PetSpeciesTag especie={pet.especie} raca={pet.raca} />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{pet.porte || '-'}</span>
                {idade !== null && <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">· {idade} ano(s)</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsEditOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#00BFA5] text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
            >
              <i className="fa-solid fa-pen-to-square mr-2"></i>Editar
            </button>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-xl text-xl text-slate-400">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 md:p-10 custom-scrollbar space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-5 md:p-6 rounded-[1.75rem] border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Etiquetas de Comportamento</h4>
                {tagsAtivas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tagsAtivas.map(tag => (
                      <span
                        key={tag.value}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 ${
                          tag.critica ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-50 text-slate-600 border border-slate-100'
                        }`}
                      >
                        <i className={`fa-solid ${tag.icon} text-[10px]`}></i>{tag.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Nenhuma etiqueta cadastrada.</p>
                )}
                {pet.comportamento && (
                  <p className="text-xs font-medium text-slate-500 pt-2 border-t border-slate-50">{pet.comportamento}</p>
                )}
              </div>

              <div className="bg-white p-5 md:p-6 rounded-[1.75rem] border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Tosa Preferida</h4>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                    {pet.tosa_referencia_url ? (
                      <img src={pet.tosa_referencia_url} alt="Referência de tosa" className="w-full h-full object-cover" />
                    ) : (
                      <i className="fa-solid fa-scissors"></i>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-700">{pet.tosa_preferida || 'Não informado.'}</p>
                </div>
              </div>

              <div className="bg-white p-5 md:p-6 rounded-[1.75rem] border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Ciclo de Retorno</h4>
                {loadingRetorno ? (
                  <i className="fa-solid fa-circle-notch fa-spin text-[#00BFA5]"></i>
                ) : retorno ? (
                  <div className="space-y-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest border ${statusRetornoInfo[retorno.status_retorno].color}`}>
                      <i className={`fa-solid ${statusRetornoInfo[retorno.status_retorno].icon}`}></i>
                      {statusRetornoInfo[retorno.status_retorno].label}
                      {retorno.status_retorno === 'atrasado' && retorno.dias_atraso > 0 && ` · ${retorno.dias_atraso}d`}
                    </span>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Atendimentos</p>
                        <p className="font-bold text-slate-700">{retorno.total_atendimentos_finalizados}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Intervalo médio</p>
                        <p className="font-bold text-slate-700">{retorno.intervalo_medio_dias ? `${retorno.intervalo_medio_dias}d` : '-'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Último atendimento</p>
                        <p className="font-bold text-slate-700">{formatDate(retorno.ultimo_atendimento)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Próximo previsto</p>
                        <p className="font-bold text-slate-700">{formatDate(retorno.proximo_retorno_previsto)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Sem dados de retorno.</p>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-white p-5 md:p-6 rounded-[1.75rem] border border-slate-100 shadow-sm">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Linha do Tempo de Atendimentos</h4>
                {loadingTimeline ? (
                  <div className="py-10 text-center"><i className="fa-solid fa-circle-notch fa-spin text-[#00BFA5]"></i></div>
                ) : timeline.length > 0 ? (
                  <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                    {timeline.map(item => (
                      <div key={item.uniqueId} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-black text-slate-700">{formatDate(item.dataExibicao)}</span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.agendamento_itens?.map((it, idx) => (
                            <span key={idx} className="px-2 py-1 bg-white text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-slate-100">
                              {it.servicos?.nome}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-slate-400 font-bold">{item.funcionarios?.nome || 'Sem profissional'}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-700">R$ {Number(item.valor_total || 0).toFixed(2)}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${item.pago ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                              {item.pago ? 'Pago' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-10">Nenhum atendimento registrado.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isEditOpen && (
        <PetFormModal
          pet={pet}
          clientId={client.id}
          clientName={client.nome}
          unitId={unitId}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            setIsEditOpen(false);
            onChanged?.();
          }}
          showToast={showToast}
          zBoost={40 + zBoost}
        />
      )}
    </div>
  );
};

export default PetProfilePanel;
