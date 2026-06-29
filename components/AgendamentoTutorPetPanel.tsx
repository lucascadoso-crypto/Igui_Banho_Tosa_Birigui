
import React, { useState } from 'react';
import { Client, Pet, UserProfile } from '../types';
import ClienteModal from './ClienteModal';
import ClientDetailsModal from './ClientDetailsModal';
import PetFormModal from './PetFormModal';

interface AgendamentoTutorPetPanelProps {
  appt: any;
  client: Partial<Client> | null;
  pet: Partial<Pet> | null;
  userProfile?: UserProfile;
  supabaseClient: any;
  onRefresh: () => void;
  showToast: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'carregando') => void;
}

type TabKey = 'resumo' | 'tutor' | 'pet' | 'prontuario';

const AgendamentoTutorPetPanel: React.FC<AgendamentoTutorPetPanelProps> = ({
  appt,
  client,
  pet,
  userProfile,
  supabaseClient,
  onRefresh,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('resumo');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [showVerCliente, setShowVerCliente] = useState(false);
  const [showEditarTutor, setShowEditarTutor] = useState(false);
  const [showVerPet, setShowVerPet] = useState(false);
  const [showEditarPet, setShowEditarPet] = useState(false);

  const cargo = userProfile?.cargo;
  const canEditClientPet = ['master', 'gerente', 'admin_unidade', 'administrador'].includes(cargo);
  const isTosador = cargo === 'tosador';
  const unitId = appt?.unidade_id;

  const adaptedShowToast = (text: string, type: 'success' | 'error' = 'success') => {
    showToast(text, type === 'success' ? 'sucesso' : 'erro');
  };

  const formatDateBR = (dateStr?: string) => {
    if (!dateStr) return '--/--/----';
    const dataLimpa = dateStr.split('T')[0];
    const parts = dataLimpa.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  };

  const calcIdade = (dataNasc?: string) => {
    if (!dataNasc) return null;
    const nasc = new Date(`${dataNasc.split('T')[0]}T12:00:00`);
    if (isNaN(nasc.getTime())) return null;
    const now = new Date();
    let anos = now.getFullYear() - nasc.getFullYear();
    const beforeBirthday = now.getMonth() < nasc.getMonth() || (now.getMonth() === nasc.getMonth() && now.getDate() < nasc.getDate());
    if (beforeBirthday) anos -= 1;
    return anos >= 0 ? anos : null;
  };

  const observacoesPet = [pet?.restricoes, pet?.comportamento, pet?.notas_internas].filter(Boolean) as string[];
  const idade = calcIdade(pet?.data_nascimento);

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'resumo', label: 'Resumo', icon: 'fa-circle-info' },
    { key: 'tutor', label: 'Tutor', icon: 'fa-user' },
    { key: 'pet', label: 'Pet', icon: 'fa-paw' },
    { key: 'prontuario', label: 'Prontuário', icon: 'fa-file-medical' }
  ];

  const handleAfterSave = () => {
    onRefresh();
  };

  const content = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex border-b border-slate-100 bg-slate-50/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 px-1 text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all relative flex flex-col items-center gap-1 ${activeTab === tab.key ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className={`fa-solid ${tab.icon} text-sm`}></i>
            <span>{tab.label}</span>
            {activeTab === tab.key && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-t-full"></div>}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {activeTab === 'resumo' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Agendamento</label>
              <p className="text-sm font-black text-slate-700">
                {formatDateBR(appt.data_agendamento)} • {String(appt.horario_inicio).substring(0, 5)} - {String(appt.horario_fim || '00:00').substring(0, 5)}
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Vencimento</label>
              <p className="text-sm font-black text-slate-700">{formatDateBR(appt.data_agendamento)}</p>
            </div>

            {(appt.data_inicio_real || appt.data_fim_real) && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest block">Cronometragem Real</label>
                <div className="grid grid-cols-2 gap-4">
                  {appt.data_inicio_real && (
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Início</p>
                      <p className="text-sm font-black text-slate-700">{new Date(appt.data_inicio_real).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  )}
                  {appt.data_fim_real && (
                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                      <p className="text-[8px] font-black text-emerald-600 uppercase">Fim</p>
                      <p className="text-sm font-black text-emerald-700">{new Date(appt.data_fim_real).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1 pt-3 border-t border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Responsável</label>
              <p className="text-sm font-black text-slate-600">{appt.funcionarios?.nome || 'Nenhum responsável selecionado'}</p>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tutor</label>
              <button onClick={() => setActiveTab('tutor')} className="w-full bg-slate-50 p-3 rounded-xl flex items-center justify-between hover:bg-slate-100 transition-all">
                <div className="min-w-0 text-left">
                  <p className="font-black text-slate-800 text-sm truncate">{client?.nome || 'Não identificado'}</p>
                  {!isTosador && <p className="text-[9px] font-bold text-slate-400 uppercase">{client?.telefone}</p>}
                </div>
                <i className="fa-solid fa-chevron-right text-slate-300 shrink-0"></i>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pet</label>
              <button onClick={() => setActiveTab('pet')} className="w-full bg-slate-50 p-3 rounded-xl flex items-center justify-between hover:bg-slate-100 transition-all">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-300 overflow-hidden shrink-0 border border-slate-100">
                    {pet?.foto_url ? <img src={pet.foto_url} className="w-full h-full object-cover" /> : <i className="fa-solid fa-paw text-xs"></i>}
                  </div>
                  <p className="font-black text-slate-800 text-sm truncate">{pet?.nome || 'Não identificado'}</p>
                </div>
                <i className="fa-solid fa-chevron-right text-slate-300 shrink-0"></i>
              </button>
            </div>

            {observacoesPet.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest block">Observações Importantes</label>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
                  {observacoesPet.map((obs, idx) => (
                    <p key={idx} className="text-xs font-bold text-rose-700">{obs}</p>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setActiveTab('prontuario')} className="w-full py-3 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-100 transition-all">
              <i className="fa-solid fa-file-medical mr-2"></i> Ver Prontuário
            </button>
          </div>
        )}

        {activeTab === 'tutor' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm shrink-0">
                {client?.nome?.charAt(0) || 'C'}
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-800 text-sm truncate">{client?.nome || 'Não identificado'}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">{client?.telefone || 'Sem telefone'}</p>
              </div>
            </div>

            {!isTosador && (
              <div className="space-y-2 text-xs">
                {client?.email && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Email</p>
                    <p className="font-bold text-slate-700">{client.email}</p>
                  </div>
                )}
                {(client?.logradouro || client?.cidade) && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Endereço</p>
                    <p className="font-bold text-slate-700">{[client?.logradouro, client?.numero, client?.bairro, client?.cidade, client?.estado].filter(Boolean).join(', ')}</p>
                  </div>
                )}
                {client?.restricoes && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mt-2">
                    <p className="text-[9px] font-black text-rose-400 uppercase mb-1">Restrições</p>
                    <p className="text-xs font-bold text-rose-700">{client.restricoes}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {client?.id && (
                <button onClick={() => setShowVerCliente(true)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                  VER CLIENTE
                </button>
              )}
              {canEditClientPet && client?.id && (
                <button onClick={() => setShowEditarTutor(true)} className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all">
                  EDITAR TUTOR
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pet' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 overflow-hidden shrink-0 border border-slate-100">
                {pet?.foto_url ? <img src={pet.foto_url} className="w-full h-full object-cover" /> : <i className="fa-solid fa-paw"></i>}
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-800 text-sm truncate">{pet?.nome || 'Não identificado'}</p>
                <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase border border-emerald-100">Ativo</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[8px] font-black text-slate-400 uppercase">Raça</p>
                <p className="font-bold text-slate-700">{pet?.raca || 'SRD'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[8px] font-black text-slate-400 uppercase">Porte</p>
                <p className="font-bold text-slate-700">{pet?.porte || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[8px] font-black text-slate-400 uppercase">Sexo</p>
                <p className="font-bold text-slate-700">{pet?.genero || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[8px] font-black text-slate-400 uppercase">Idade</p>
                <p className="font-bold text-slate-700">{idade !== null ? `${idade} ano(s)` : '-'}</p>
              </div>
            </div>

            {observacoesPet.length > 0 && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1">
                <p className="text-[9px] font-black text-rose-400 uppercase mb-1">Saúde e Comportamento</p>
                {observacoesPet.map((obs, idx) => (
                  <p key={idx} className="text-xs font-bold text-rose-700">{obs}</p>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {pet?.id && client?.id && (
                <button onClick={() => setShowVerPet(true)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                  VER PET
                </button>
              )}
              {canEditClientPet && pet?.id && client?.id && (
                <button onClick={() => setShowEditarPet(true)} className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all">
                  EDITAR PET
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prontuario' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Comportamento</p>
                <p className="text-xs font-bold text-slate-700">{pet?.comportamento || 'Sem registro.'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Restrições / Alergias</p>
                <p className="text-xs font-bold text-slate-700">{pet?.restricoes || 'Sem registro.'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Observações</p>
                <p className="text-xs font-bold text-slate-700">{pet?.notas_internas || 'Sem registro.'}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {pet?.id && client?.id && (
                <button onClick={() => setShowVerPet(true)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                  VER PRONTUÁRIO COMPLETO
                </button>
              )}
              {canEditClientPet && pet?.id && client?.id && (
                <button onClick={() => setShowEditarPet(true)} className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all">
                  EDITAR PRONTUÁRIO
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <button
        onClick={() => setMobileExpanded(!mobileExpanded)}
        className="lg:hidden w-full py-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        <i className={`fa-solid ${mobileExpanded ? 'fa-chevron-up' : 'fa-user-group'}`}></i>
        {mobileExpanded ? 'Fechar Dados do Tutor e Pet' : 'Dados do Tutor e Pet'}
      </button>

      <div className={`${mobileExpanded ? 'block' : 'hidden'} lg:block`}>
        {content}
      </div>

      {showVerCliente && client?.id && (
        <ClientDetailsModal
          client={client as Client}
          supabaseClient={supabaseClient}
          unitId={unitId}
          userProfile={userProfile}
          onClose={() => setShowVerCliente(false)}
          onOpenNewPet={() => {}}
          zBoost={100}
        />
      )}

      {showEditarTutor && client?.id && (
        <ClienteModal
          client={client as Client}
          unitId={unitId}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          hidePetTab
          zBoost={100}
          onClose={() => setShowEditarTutor(false)}
          onSave={() => { setShowEditarTutor(false); handleAfterSave(); }}
          showToast={adaptedShowToast}
        />
      )}

      {showVerPet && client?.id && pet?.id && (
        <ClientDetailsModal
          client={client as Client}
          supabaseClient={supabaseClient}
          unitId={unitId}
          userProfile={userProfile}
          onClose={() => { setShowVerPet(false); handleAfterSave(); }}
          onOpenNewPet={() => {}}
          focusPetId={pet.id}
          zBoost={100}
        />
      )}

      {showEditarPet && client?.id && pet?.id && (
        <PetFormModal
          pet={pet as Pet}
          clientId={client.id}
          clientName={client.nome || ''}
          unitId={unitId}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setShowEditarPet(false)}
          onSaved={() => { setShowEditarPet(false); handleAfterSave(); }}
          showToast={adaptedShowToast}
          zBoost={100}
        />
      )}
    </div>
  );
};

export default AgendamentoTutorPetPanel;
