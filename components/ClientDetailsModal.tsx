
import React, { useState, useEffect } from 'react';
import { Client, Pet } from '../types';
import ClienteModal from './ClienteModal';
import { registrarAtividade } from '../services/logger';

interface ClientDetailsModalProps {
  client: Client;
  supabaseClient: any;
  unitId: string;
  onClose: () => void;
  onOpenNewPet: (clientId: string, clientName: string) => void;
  userProfile?: any;
}

const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ client, supabaseClient, unitId, onClose, onOpenNewPet, userProfile }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'payments' | 'history'>('details');
  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(false);
  
  const [history, setHistory] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Estados para o novo Modal de Pet
  const [isNewPetModalOpen, setIsNewPetModalOpen] = useState(false);
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [savingPet, setSavingPet] = useState(false);
  const [deletingPet, setDeletingPet] = useState(false);
  const [localToast, setLocalToast] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  // Estados para Edição
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [petSelecionado, setPetSelecionado] = useState<Pet | null>(null);
  const [currentClient, setCurrentClient] = useState<Client>(client);

  useEffect(() => {
    setCurrentClient(client);
  }, [client]);

  const [newPet, setNewPet] = useState({
    id: '',
    nome: '',
    raca: '',
    genero: 'Macho',
    porte: 'Médio',
    data_nascimento: '',
    notas_internas: ''
  });

  const tealColor = "#00BFA5";

  useEffect(() => {
    fetchPets();
  }, [client.id]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    if (activeTab === 'payments') fetchPayments();
  }, [activeTab, client.id]);

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

  const handleSavePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPet.nome) return;

    setSavingPet(true);
    try {
      const petData = {
        cliente_id: currentClient.id,
        nome: newPet.nome,
        raca: newPet.raca,
        genero: newPet.genero,
        porte: newPet.porte,
        data_nascimento: newPet.data_nascimento || null,
        notas_internas: newPet.notas_internas,
        especie: 'Cachorro'
      };

      if (petSelecionado) {
        // UPDATE
        const { error } = await supabaseClient
          .from('pets')
          .update(petData)
          .eq('id', petSelecionado.id);
        
        if (error) throw error;

        registrarAtividade(
          unitId,
          userProfile?.email || 'sistema',
          'EDICAO_PET',
          `Editou o pet ${petData.nome} do cliente ${currentClient.nome}`,
          userProfile?.nome,
          userProfile?.cargo
        );

        showToast("Pet atualizado com sucesso!");
      } else {
        // INSERT
        const { error } = await supabaseClient
          .from('pets')
          .insert([petData]);

        if (error) throw error;

        registrarAtividade(
          unitId,
          userProfile?.email || 'sistema',
          'NOVO_PET',
          `Cadastrou o pet ${petData.nome} para o cliente ${currentClient.nome}`,
          userProfile?.nome,
          userProfile?.cargo
        );

        showToast("Pet adicionado com sucesso!");
      }

      setIsNewPetModalOpen(false);
      setPetSelecionado(null);
      setNewPet({ id: '', nome: '', raca: '', genero: 'Macho', porte: 'Médio', data_nascimento: '', notas_internas: '' });
      fetchPets();
    } catch (err: any) {
      console.error("Erro ao salvar pet:", err);
      showToast("Erro ao salvar pet.", "error");
    } finally {
      setSavingPet(false);
    }
  };

  const handleOpenEditPet = (pet: Pet) => {
    setPetSelecionado(pet);
    setNewPet({
      id: pet.id,
      nome: pet.nome,
      raca: pet.raca || '',
      genero: pet.genero || 'Macho',
      porte: pet.porte || 'Médio',
      data_nascimento: pet.data_nascimento || '',
      notas_internas: pet.notas_internas || ''
    });
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      
      {/* Toast Local para Feedback */}
      {localToast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[120] px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 text-white font-black text-xs uppercase tracking-widest flex items-center space-x-2 ${localToast.type === 'success' ? 'bg-[#00BFA5]' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${localToast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
          <span>{localToast.text}</span>
        </div>
      )}

      <div className="bg-gray-50 w-[95%] mx-auto md:max-w-6xl md:w-full rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        
        {/* Top Header / Tabs */}
        <header className="bg-white px-6 md:px-10 pt-6 md:pt-10 border-b border-slate-100 shrink-0">
          <div className="flex justify-between items-start mb-6 md:mb-8">
            <div>
              <h2 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight">Prontuário do Cliente</h2>
              <p className="text-slate-400 text-[10px] md:text-sm font-bold uppercase tracking-widest mt-1">Gestão Centralizada de Cadastro</p>
            </div>
            <button 
              onClick={onClose} 
              className="relative z-50 p-2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center hover:bg-slate-100 rounded-2xl transition-colors text-xl md:text-2xl text-slate-400 cursor-pointer"
            >
              <i className="fa-solid fa-xmark pointer-events-none"></i>
            </button>
          </div>

          <div className="flex flex-wrap gap-4 md:gap-8 border-b border-slate-100">
            <button 
              onClick={() => setActiveTab('details')}
              className={`pb-4 text-[10px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'details' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Detalhes
              {activeTab === 'details' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className={`pb-4 text-[10px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'payments' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Pagamentos
              {activeTab === 'payments' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`pb-4 text-[10px] md:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'history' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Histórico
              {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
            </button>
          </div>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
          
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Coluna Esquerda: Info Pessoal */}
              <div className="lg:col-span-5 space-y-8">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center text-center relative group/client">
                  <button 
                    onClick={() => setIsEditClientModalOpen(true)}
                    className="absolute top-6 right-6 w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-[#00BFA5] hover:text-white transition-all opacity-0 group-hover/client:opacity-100 shadow-sm"
                    title="Editar Cliente"
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>

                  <div className="w-32 h-32 bg-slate-100 rounded-full border-4 border-slate-50 flex items-center justify-center text-slate-300 mb-6 overflow-hidden">
                    <img 
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(currentClient.nome)}&background=00BFA5&color=fff&size=256`} 
                      className="w-full h-full object-cover" 
                      alt={currentClient.nome}
                    />
                  </div>
                  <h3 className="text-2xl font-black text-slate-800">{currentClient.nome}</h3>
                  <p className="text-slate-500 font-bold text-sm mt-1">{currentClient.nacionalidade || 'Brasil'}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">
                    Cliente criado em {formatDate(currentClient.created_at)}
                  </p>

                  <div className="w-full border-t border-slate-50 my-8"></div>

                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <div className="flex items-center">
                        <i className="fa-brands fa-whatsapp text-emerald-500 text-xl mr-3"></i>
                        <span className="font-bold text-slate-700">{currentClient.telefone}</span>
                      </div>
                      <button className="text-[10px] font-black uppercase tracking-tighter text-emerald-600 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-all">
                        WhatsApp Logs
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço de Cobrança</h4>
                   {currentClient.logradouro ? (
                     <div className="flex items-start space-x-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#00BFA5] shrink-0">
                          <i className="fa-solid fa-map-location-dot"></i>
                        </div>
                        <div className="text-sm font-medium text-slate-600">
                          <p className="font-bold text-slate-800">{currentClient.logradouro}, {currentClient.numero}</p>
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
              <div className="lg:col-span-7 space-y-8">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-8">
                    <h4 className="text-lg font-black text-slate-800 flex items-center">
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
                          <div className="flex items-center space-x-4">
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
                              className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shrink-0 opacity-0 group-hover:opacity-100"
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
                    className="w-full mt-8 py-5 rounded-[1.5rem] border-2 border-dashed border-[#00BFA5]/30 text-[#00BFA5] font-black uppercase tracking-widest text-xs hover:bg-[#00BFA5]/5 transition-all flex items-center justify-center group"
                  >
                    <i className="fa-solid fa-plus-circle mr-3 group-hover:rotate-90 transition-transform"></i>
                    + NOVO PET
                  </button>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
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
                 <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
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
                 <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-64 h-64 bg-slate-100 rounded-full flex items-center justify-center mb-8 border-8 border-white shadow-xl">
                       <i className="fa-solid fa-dog text-8xl text-slate-200 animate-bounce duration-[3000ms]"></i>
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
                       <div key={item.uniqueId} className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="flex items-center space-x-5">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-[#00BFA5] text-xl shadow-inner border border-slate-100 group-hover:bg-[#00BFA5] group-hover:text-white transition-all">
                                   <i className="fa-solid fa-calendar-check"></i>
                                </div>
                                <div>
                                   <div className="flex items-center space-x-3">
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
                             
                             <div className="flex flex-wrap gap-2">
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
                 <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-64 h-64 bg-slate-100 rounded-full flex items-center justify-center mb-8 border-8 border-white shadow-xl">
                       <i className="fa-solid fa-cat text-8xl text-slate-200"></i>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">Histórico Limpo</h3>
                    <p className="text-slate-400 font-medium max-w-xs mx-auto mt-2">
                      Esse cliente ainda não realizou serviços no sistema.
                    </p>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      {/* NOVO MODAL: ADICIONAR/EDITAR PET (INTERNO) */}
      {isNewPetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col">
            <header className="bg-[#00BFA5] p-8 text-white flex justify-between items-center shrink-0">
               <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">{petSelecionado ? 'Detalhes do Pet' : 'Adicionar Novo Pet'}</h3>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Tutor: {currentClient.nome}</p>
               </div>
               <button 
                 onClick={() => { setIsNewPetModalOpen(false); setPetSelecionado(null); }} 
                 className="relative z-50 p-2 w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-2xl cursor-pointer"
               >
                 <i className="fa-solid fa-xmark pointer-events-none"></i>
               </button>
            </header>

            <form onSubmit={handleSavePet} className="p-8 space-y-5">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Pet *</label>
                  <input 
                    required 
                    type="text" 
                    value={newPet.nome}
                    onChange={(e) => setNewPet({...newPet, nome: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" 
                    placeholder="Ex: Rex" 
                  />
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raça</label>
                  <input 
                    type="text" 
                    value={newPet.raca}
                    onChange={(e) => setNewPet({...newPet, raca: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" 
                    placeholder="Ex: Golden Retriever" 
                  />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sexo</label>
                     <select 
                       value={newPet.genero}
                       onChange={(e) => setNewPet({...newPet, genero: e.target.value})}
                       className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                     >
                        <option value="Macho">Macho</option>
                        <option value="Fêmea">Fêmea</option>
                     </select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Porte</label>
                     <select 
                       value={newPet.porte}
                       onChange={(e) => setNewPet({...newPet, porte: e.target.value})}
                       className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                     >
                        <option value="Pequeno">Pequeno</option>
                        <option value="Médio">Médio</option>
                        <option value="Grande">Grande</option>
                        <option value="Gigante">Gigante</option>
                     </select>
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Nascimento</label>
                  <input 
                    type="date" 
                    value={newPet.data_nascimento}
                    onChange={(e) => setNewPet({...newPet, data_nascimento: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" 
                  />
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Detalhes / Obs de Saúde e Comportamento</label>
                  <textarea 
                    rows={3}
                    value={newPet.notas_internas}
                    onChange={(e) => setNewPet({...newPet, notas_internas: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-600 focus:ring-2 focus:ring-[#00BFA5] transition-all resize-none" 
                    placeholder="Ex: Alérgico a perfume, comportamento agitado..."
                  />
               </div>

               <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => { setIsNewPetModalOpen(false); setPetSelecionado(null); }}
                    className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={savingPet}
                    className="flex-[2] py-4 bg-[#00BFA5] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[#00BFA5]/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {savingPet ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'SALVAR'}
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {petToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 p-8 text-center">
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
