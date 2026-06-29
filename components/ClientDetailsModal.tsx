
import React, { useState, useEffect, useRef } from 'react';
import { Client, Pet, UiId, UserProfile } from '../types';
import ClienteModal from './ClienteModal';
import PetFormModal from './PetFormModal';
import { registrarAtividade } from '../services/logger';
import FiscalHistory from './FiscalHistory';

interface ClientDetailsModalProps {
  client: Client;
  supabaseClient: any;
  unitId: UiId;
  onClose: () => void;
  onOpenNewPet: (clientId: UiId, clientName: string) => void;
  userProfile?: UserProfile;
  focusPetId?: UiId;
  zBoost?: number;
}

const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ client, supabaseClient, unitId, onClose, onOpenNewPet, userProfile, focusPetId, zBoost = 0 }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'payments' | 'history' | 'fiscal'>('details');
  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Estados para o novo Modal de Pet
  const [isNewPetModalOpen, setIsNewPetModalOpen] = useState(false);
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [deletingPet, setDeletingPet] = useState(false);
  const [localToast, setLocalToast] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Estados para Edição
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [petSelecionado, setPetSelecionado] = useState<Pet | null>(null);
  const [currentClient, setCurrentClient] = useState<Client>(client);
  const canViewFiscal = ['master', 'financeiro', 'gerente', 'admin_unidade', 'administrador'].includes(userProfile?.cargo);
  const hasFocusedPet = useRef(false);

  useEffect(() => {
    setCurrentClient(client);
  }, [client]);

  const tealColor = "#00BFA5";

  useEffect(() => {
    fetchPets();
  }, [client.id]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    if (activeTab === 'payments') fetchPayments();
  }, [activeTab, client.id]);

  useEffect(() => {
    if (!focusPetId || hasFocusedPet.current || loadingPets) return;
    const target = pets.find(p => String(p.id) === String(focusPetId));
    if (target) {
      hasFocusedPet.current = true;
      handleOpenEditPet(target);
    }
  }, [focusPetId, pets, loadingPets]);

  const fetchPets = async () => {
    setLoadingPets(true);
    try {
      const { data, error } = await supabaseClient
        .from('pets')
        .select('*')
        .eq('cliente_id', client.id);
      
      if (error) throw error;
      setPets(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar pets:", err);
    } finally {
      setLoadingPets(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabaseClient
        .from('agendamentos')
        .select(`
          id,
          data_agendamento,
          horario_inicio,
          status,
          pets!inner(nome, cliente_id),
          agendamento_itens(servicos(nome))
        `)
        .eq('pets.cliente_id', client.id)
        .order('data_agendamento', { ascending: false })
        .order('horario_inicio', { ascending: false });

      if (error) throw error;
      
      // Garantir IDs únicos prefixando, caso haja algum overlap inesperado
      const processedHistory = (data || []).map(item => ({
        ...item,
        uniqueId: `hist-${item.id}`
      }));
      
      setHistory(processedHistory);
    } catch (err) {
      console.error("Erro ao buscar histórico:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      // Agendamentos Avulsos Pagos
      const { data: appts, error: apptErr } = await supabaseClient
        .from('agendamentos')
        .select(`
          id,
          valor_total,
          forma_pagamento,
          data_agendamento,
          pacote_id,
          pets!inner(nome, cliente_id)
        `)
        .eq('pets.cliente_id', client.id)
        .eq('pago', true)
        .is('pacote_id', null);

      if (apptErr) throw apptErr;

      // Pacotes Pagos
      const { data: packs, error: packErr } = await supabaseClient
        .from('pacotes')
        .select(`
          id,
          valor_total,
          forma_pagamento,
          data_pagamento,
          pets(nome)
        `)
        .eq('cliente_id', client.id)
        .eq('pago', true);

      if (packErr) throw packErr;

      const combined = [
        ...(appts || []).map(a => ({
          id: `appt-${a.id}`,
          data: a.data_agendamento,
          valor: a.valor_total,
          metodo: a.forma_pagamento,
          descricao: `Banho Avulso: ${a.pets?.nome}`,
          tipo: 'avulso'
        })),
        ...(packs || []).map(p => ({
          id: `pack-${p.id}`,
          data: p.data_pagamento,
          valor: p.valor_total,
          metodo: p.forma_pagamento,
          descricao: `Pacote: ${p.pets?.nome}`,
          tipo: 'pacote'
        }))
      ].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

      setPayments(combined);
    } catch (err) {
      console.error("Erro ao buscar pagamentos:", err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ text, type });
    setTimeout(() => setLocalToast(null), 3000);
  };

  const closePetModal = () => {
    setIsNewPetModalOpen(false);
    setPetSelecionado(null);
  };

  const handlePetSaved = (savedPet: Pet) => {
    setIsNewPetModalOpen(false);
    setPetSelecionado(null);
    fetchPets();
  };

  const handleOpenEditPet = (pet: Pet) => {
    setPetSelecionado(pet);
    setIsNewPetModalOpen(true);
  };

  const handleArchivePet = async () => {
    if (!petToDelete) return;
    setDeletingPet(true);
    try {
      const { error } = await supabaseClient
        .from('pets')
        .update({ ativo: false })
        .eq('id', petToDelete.id);

      if (error) throw error;

      registrarAtividade(
        unitId,
        userProfile?.email || 'sistema',
        'ARQUIVAR_PET',
        `Arquivou o pet ${petToDelete.nome} do cliente ${currentClient.nome}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showToast("Pet arquivado com sucesso!");
      setPets(prev => prev.filter(p => p.id !== petToDelete.id));
      setPetToDelete(null);
    } catch (err: any) {
      console.error("Erro ao arquivar pet:", err);
      showToast("Erro ao arquivar pet.", "error");
    } finally {
      setDeletingPet(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Data não informada';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className={`app-modal-overlay fixed inset-0 z-[${60 + zBoost}] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 overflow-y-auto overflow-x-hidden`}>

      {/* Toast Local para Feedback */}
      {localToast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[${120 + zBoost}] px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 text-white font-black text-xs uppercase tracking-widest flex items-center space-x-2 ${localToast.type === 'success' ? 'bg-[#00BFA5]' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${localToast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
          <span>{localToast.text}</span>
        </div>
      )}

      <div className="app-modal-panel bg-gray-50 w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] mx-auto md:max-w-6xl md:w-full rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-y-auto overflow-x-hidden md:overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[calc(100vh-24px)] md:max-h-[90vh]">
        
        {/* Top Header / Tabs */}
        <header className="app-modal-header bg-white px-4 md:px-10 pt-4 md:pt-10 border-b border-slate-100 shrink-0">
          <div className="flex justify-between items-start gap-3 mb-4 md:mb-8">
            <div className="min-w-0 pr-1">
              <h2 className="text-[clamp(18px,5.5vw,22px)] md:text-3xl font-black text-slate-800 tracking-tight leading-tight break-words">Prontuário do Cliente</h2>
              <p className="text-slate-400 text-[9px] md:text-sm font-bold uppercase tracking-widest mt-1 leading-tight">Gestão Centralizada de Cadastro</p>
            </div>
            <button 
              onClick={onClose} 
              className="relative z-50 p-2 w-9 h-9 md:w-12 md:h-12 flex items-center justify-center hover:bg-slate-100 rounded-2xl transition-colors text-xl md:text-2xl text-slate-400 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-xmark pointer-events-none"></i>
            </button>
          </div>

          <div className="flex gap-3 md:gap-8 border-b border-slate-100 overflow-x-auto overflow-y-hidden custom-scrollbar -mx-1 px-1">
            <button 
              onClick={() => setActiveTab('details')}
              className={`pb-3 md:pb-4 text-[9px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0 ${activeTab === 'details' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Detalhes
              {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className={`pb-3 md:pb-4 text-[9px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0 ${activeTab === 'payments' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Pagamentos
              {activeTab === 'payments' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`pb-3 md:pb-4 text-[9px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0 ${activeTab === 'history' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Histórico
              {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
            {canViewFiscal && (
              <button
                onClick={() => setActiveTab('fiscal')}
                className={`pb-3 md:pb-4 text-[9px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0 ${activeTab === 'fiscal' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Notas Fiscais
                {activeTab === 'fiscal' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
              </button>
            )}
          </div>
        </header>

        {/* Modal Body */}
        <div className="app-modal-body flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10 custom-scrollbar">
          
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Coluna Esquerda: Info Pessoal */}
              <div className="lg:col-span-5 space-y-6 md:space-y-8 min-w-0">
                <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center text-center relative group/client overflow-hidden">
                  <button 
                    onClick={() => setIsEditClientModalOpen(true)}
                    className="absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-[#00BFA5] hover:text-white transition-all opacity-100 md:opacity-0 md:group-hover/client:opacity-100 shadow-sm"
                    title="Editar Cliente"
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>

                  <div className="w-24 h-24 md:w-32 md:h-32 bg-slate-100 rounded-full border-4 border-slate-50 flex items-center justify-center text-slate-300 mb-5 md:mb-6 overflow-hidden">
                    <img 
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(currentClient.nome)}&background=00BFA5&color=fff&size=256`} 
                      className="w-full h-full object-cover" 
                      alt={currentClient.nome}
                    />
                  </div>
                  <h3 className="text-xl md:text-2xl font-black text-slate-800 break-words max-w-full">{currentClient.nome}</h3>
                  <p className="text-slate-500 font-bold text-sm mt-1">{currentClient.nacionalidade || 'Brasil'}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">
                    Cliente criado em {formatDate(currentClient.created_at)}
                  </p>

                  <div className="w-full border-t border-slate-50 my-6 md:my-8"></div>

                  <div className="w-full space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <div className="flex items-center min-w-0">
                        <i className="fa-brands fa-whatsapp text-emerald-500 text-xl mr-3"></i>
                        <span className="font-bold text-slate-700 break-all">{currentClient.telefone}</span>
                      </div>
                      <button className="w-full md:w-auto text-[10px] font-black uppercase tracking-tighter text-emerald-600 bg-white px-3 py-2 md:py-1.5 rounded-lg shadow-sm border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-all">
                        WhatsApp Logs
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 overflow-hidden">
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço de Cobrança</h4>
                   {currentClient.logradouro ? (
                     <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#00BFA5] shrink-0">
                          <i className="fa-solid fa-map-location-dot"></i>
                        </div>
                        <div className="text-sm font-medium text-slate-600 min-w-0">
                          <p className="font-bold text-slate-800 break-words">{currentClient.logradouro}, {currentClient.numero}</p>
                          <p>{currentClient.bairro} - {currentClient.cidade}/{currentClient.estado}</p>
                          <p className="text-xs text-slate-400 mt-1">CEP: {currentClient.cep}</p>
                        </div>
                     </div>
                   ) : (
                     <p className="text-sm text-slate-400 italic">Endereço não cadastrado.</p>
                   )}
                </div>
              </div>

              {/* Coluna Direita: Pets & Dependentes */}
              <div className="lg:col-span-7 space-y-6 md:space-y-8 min-w-0">
                <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6 md:mb-8">
                    <h4 className="text-base md:text-lg font-black text-slate-800 flex items-center">
                       <i className="fa-solid fa-paw mr-3 text-[#00BFA5]"></i>
                       Dependentes & Pets
                    </h4>
                    <span className="bg-slate-50 text-slate-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {pets.length} Registrados
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loadingPets ? (
                      <div className="col-span-2 py-10 text-center">
                        <i className="fa-solid fa-circle-notch fa-spin text-[#00BFA5]"></i>
                      </div>
                    ) : pets.length > 0 ? (
                      pets.filter(pet => pet.ativo !== false).map(pet => (
                        <div 
                          key={pet.id} 
                          onClick={() => handleOpenEditPet(pet)}
                          className="group p-4 bg-slate-50 rounded-3xl border border-transparent hover:border-[#00BFA5]/20 hover:bg-white hover:shadow-xl hover:shadow-[#00BFA5]/5 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm border border-slate-100 overflow-hidden shrink-0">
                               {pet.foto_url ? (
                                 <img src={pet.foto_url} className="w-full h-full object-cover" />
                               ) : (
                                 <i className="fa-solid fa-dog text-2xl group-hover:text-[#00BFA5] transition-colors"></i>
                               )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-slate-800 truncate">{pet.nome}</p>
                              <p className="text-xs text-slate-400 font-bold truncate uppercase tracking-tighter">{pet.raca || 'SRD'}</p>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPetToDelete(pet);
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              title="Excluir Pet"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-emerald-100">
                              Ativo
                            </span>
                            <i className="fa-solid fa-arrow-right text-slate-200 group-hover:text-[#00BFA5] transition-all group-hover:translate-x-1"></i>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 py-10 text-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
                        <i className="fa-solid fa-bone text-2xl text-slate-200 mb-2"></i>
                        <p className="text-xs text-slate-400 font-bold">Nenhum pet vinculado</p>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setIsNewPetModalOpen(true)}
                    className="w-full mt-6 md:mt-8 py-4 md:py-5 rounded-[1.5rem] border-2 border-dashed border-[#00BFA5]/30 text-[#00BFA5] font-black uppercase tracking-widest text-xs hover:bg-[#00BFA5]/5 transition-all flex items-center justify-center group"
                  >
                    <i className="fa-solid fa-plus-circle mr-3 group-hover:rotate-90 transition-transform"></i>
                    + NOVO PET
                  </button>
                </div>

                <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Notas Internas & Restrições</h4>
                  <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100">
                    <p className="text-sm font-bold text-rose-700">
                      {client.restricoes || "Nenhuma restrição de saúde ou comportamento anotada."}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'payments' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               {loadingPayments ? (
                 <div className="py-20 text-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#00BFA5]"></i>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-4">Carregando Pagamentos...</p>
                 </div>
               ) : payments.length > 0 ? (
                 <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 overflow-x-auto overflow-y-hidden shadow-sm">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                       <thead>
                          <tr className="bg-slate-50/50">
                             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</th>
                             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {payments.map((pay) => (
                             <tr key={pay.id} className="hover:bg-slate-50/30 transition-colors">
                                <th className="px-8 py-6 font-bold text-slate-600 text-sm">{formatDate(pay.data)}</th>
                                <th className="px-8 py-6">
                                   <p className="font-black text-slate-800 text-sm">{pay.descricao}</p>
                                   <p className="text-[9px] font-black text-[#00BFA5] uppercase tracking-widest mt-0.5">{pay.tipo}</p>
                                </th>
                                <th className="px-8 py-6">
                                   <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                      pay.metodo?.toLowerCase() === 'pix' ? 'bg-emerald-50 text-emerald-600' :
                                      pay.metodo?.toLowerCase() === 'cartão' ? 'bg-indigo-50 text-indigo-600' :
                                      'bg-amber-50 text-amber-600'
                                   }`}>
                                      {pay.metodo || 'N/A'}
                                   </span>
                                </th>
                                <th className="px-8 py-6 text-right font-black text-slate-800 text-sm">
                                   R$ {Number(pay.valor).toFixed(2)}
                                </th>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
                    <div className="w-40 h-40 md:w-64 md:h-64 bg-slate-100 rounded-full flex items-center justify-center mb-8 border-8 border-white shadow-xl">
                       <i className="fa-solid fa-dog text-5xl md:text-8xl text-slate-200 animate-bounce duration-[3000ms]"></i>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">Tudo em dia por aqui!</h3>
                    <p className="text-slate-400 font-medium max-w-xs mx-auto mt-2">
                      Esse cliente não possui pagamentos registrados no sistema.
                    </p>
                 </div>
               )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               {loadingHistory ? (
                 <div className="py-20 text-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#00BFA5]"></i>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-4">Carregando Histórico...</p>
                 </div>
               ) : history.length > 0 ? (
                 <div className="space-y-6">
                    {history.map((item) => (
                       <div key={item.uniqueId} className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="flex items-center gap-4 md:gap-5 min-w-0">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-[#00BFA5] text-xl shadow-inner border border-slate-100 group-hover:bg-[#00BFA5] group-hover:text-white transition-all">
                                   <i className="fa-solid fa-calendar-check"></i>
                                </div>
                                <div className="min-w-0">
                                   <div className="flex flex-wrap items-center gap-2 md:gap-3">
                                      <span className="text-sm font-black text-slate-800">{formatDate(item.data_agendamento)}</span>
                                      <span className="px-2 py-0.5 bg-[#00BFA5]/10 text-[#00BFA5] text-[9px] font-black uppercase tracking-widest rounded-md">
                                         {item.pets?.nome}
                                      </span>
                                   </div>
                                   <p className="text-xs font-bold text-slate-400 mt-1">
                                      {item.horario_inicio?.substring(0, 5)} • {item.status}
                                   </p>
                                </div>
                             </div>
                             
                             <div className="flex flex-wrap gap-2 min-w-0">
                                {item.agendamento_itens?.map((it: any, idx: number) => (
                                   <span key={idx} className="px-3 py-1.5 bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-xl border border-slate-100">
                                      {it.servicos?.nome}
                                   </span>
                                ))}
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
                    <div className="w-40 h-40 md:w-64 md:h-64 bg-slate-100 rounded-full flex items-center justify-center mb-8 border-8 border-white shadow-xl">
                       <i className="fa-solid fa-cat text-5xl md:text-8xl text-slate-200"></i>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">Histórico Limpo</h3>
                    <p className="text-slate-400 font-medium max-w-xs mx-auto mt-2">
                      Esse cliente ainda não realizou serviços no sistema.
                    </p>
                 </div>
               )}
            </div>
          )}

          {activeTab === 'fiscal' && canViewFiscal && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <FiscalHistory supabaseClient={supabaseClient} clientId={Number(client.id)} compact />
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADICIONAR/EDITAR PET (componente compartilhado) */}
      {isNewPetModalOpen && (
        <PetFormModal
          pet={petSelecionado}
          clientId={currentClient.id}
          clientName={currentClient.nome}
          unitId={unitId}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={closePetModal}
          onSaved={handlePetSaved}
          showToast={showToast}
          zBoost={40 + zBoost}
        />
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {petToDelete && (
        <div className={`app-modal-overlay fixed inset-0 z-[${110 + zBoost}] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200`}>
          <div className="app-modal-panel bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 p-8 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">Arquivar Pet?</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">
              Tem a certeza que deseja arquivar o pet <span className="font-black text-slate-800">'{petToDelete.nome}'</span>? O seu histórico será preservado, mas não aparecerá nas opções de agendamento.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPetToDelete(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleArchivePet}
                disabled={deletingPet}
                className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50"
              >
                {deletingPet ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'ARQUIVAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE CLIENTE */}
      {isEditClientModalOpen && (
        <ClienteModal
          client={currentClient}
          unitId={unitId}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          hidePetTab
          zBoost={40 + zBoost}
          onClose={() => setIsEditClientModalOpen(false)}
          onSave={(data) => {
            setCurrentClient(data.cliente);
            setIsEditClientModalOpen(false);
            showToast("Cliente atualizado com sucesso!");
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default ClientDetailsModal;
