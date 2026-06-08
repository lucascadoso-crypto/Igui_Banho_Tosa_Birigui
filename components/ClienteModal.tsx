
import React, { useState, useEffect, useRef } from 'react';
import { Client, Pet } from '../types';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';

interface ClienteModalProps {
  modo?: 'completo' | 'rapido';
  client?: Partial<Client> | null;
  unitId: string;
  supabaseClient: any;
  userProfile?: any;
  onClose: () => void;
  onSave: (data: { cliente: Client, pet?: Pet }) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

const ClienteModal: React.FC<ClienteModalProps> = ({ 
  modo = 'completo', 
  client, 
  unitId, 
  supabaseClient, 
  userProfile,
  onClose, 
  onSave,
  showToast 
}) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tutor' | 'pet'>('tutor');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPetImage, setUploadingPetImage] = useState(false);
  const [searchingCEP, setSearchingCEP] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Client>>({
    nome: '',
    telefone: '',
    telefone_adicional: '',
    email: '',
    cpf: '',
    data_nascimento: '',
    nacionalidade: 'Brasil',
    genero: 'Não Informado',
    receber_msgs: true,
    notas_internas: '',
    restricoes: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    complemento: '',
    cidade: '',
    estado: '',
    unidade_preferencial_id: unitId,
    foto_url: ''
  });

  const [petFormData, setPetFormData] = useState({
    nome: '',
    especie: 'Cachorro',
    raca: '',
    porte: 'Médio',
    genero: 'Macho',
    foto_url: '',
    notas_internas: ''
  });

  // Campo extra apenas para o modo rápido (legado/simplificado)
  const [petNomeRapido, setPetNomeRapido] = useState('');

  const numeroInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const petFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (client) {
      setFormData({ ...formData, ...client });
    }
  }, [client]);

  const handleCEPSearch = async () => {
    const cleanCEP = formData.cep?.replace(/\D/g, '');
    if (!cleanCEP || cleanCEP.length !== 8) return;

    setSearchingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();

      if (data.erro) {
        showToast("CEP não encontrado", "error");
      } else {
        setFormData(prev => ({
          ...prev,
          logradouro: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade,
          estado: data.uf
        }));
        setTimeout(() => numeroInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      showToast("Erro ao buscar CEP", "error");
    } finally {
      setSearchingCEP(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'tutor' | 'pet') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (target === 'tutor') setUploadingImage(true);
    else setUploadingPetImage(true);

    const url = await uploadToImgBB(file);
    if (url) {
      if (target === 'tutor') setFormData(prev => ({ ...prev, foto_url: url }));
      else setPetFormData(prev => ({ ...prev, foto_url: url }));
      showToast("Foto carregada com sucesso!");
    } else {
      showToast("Erro no upload da imagem", "error");
    }
    
    setUploadingImage(false);
    setUploadingPetImage(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) return;

    setLoading(true);
    try {
      // 1. Salvar Dados do Tutor
      const clientPayload: any = { 
        ...formData,
        unidade_preferencial_id: formData.unidade_preferencial_id || unitId
      };
      
      const optionalFields = [
        'data_nascimento', 'email', 'cpf', 'telefone_adicional', 
        'cep', 'logradouro', 'numero', 'bairro', 'complemento', 
        'cidade', 'estado', 'foto_url', 'notas_internas', 'restricoes'
      ];

      optionalFields.forEach(field => {
        if (clientPayload[field] === '') clientPayload[field] = null;
      });

      const isUpdate = !!clientPayload.id;
      let finalClient: any;

      if (isUpdate) {
        const { data, error } = await supabaseClient
          .from('clientes')
          .update(clientPayload)
          .eq('id', clientPayload.id)
          .select()
          .single();
        if (error) throw error;
        finalClient = data;

        // Log de Auditoria
        registrarAtividade(
          unitId, 
          userProfile?.email || 'sistema', 
          'EDICAO_CLIENTE', 
          `Editou o cliente ${finalClient.nome}`,
          userProfile?.nome,
          userProfile?.cargo
        );
      } else {
        const { data, error } = await supabaseClient
          .from('clientes')
          .insert([clientPayload])
          .select()
          .single();
        if (error) throw error;
        finalClient = data;

        // Log de Auditoria
        registrarAtividade(
          unitId, 
          userProfile?.email || 'sistema', 
          'NOVO_CLIENTE', 
          `Cadastrou o cliente ${finalClient.nome}`,
          userProfile?.nome,
          userProfile?.cargo
        );
      }

      // 2. Salvar Dados do Pet (Se preenchido)
      let finalPet: any = null;
      
      // Lógica para Modo Completo (Aba Pet)
      if (modo === 'completo' && petFormData.nome) {
        const { data: petData, error: petError } = await supabaseClient
          .from('pets')
          .insert([{
            cliente_id: finalClient.id,
            nome: petFormData.nome,
            especie: petFormData.especie,
            raca: petFormData.raca,
            porte: petFormData.porte,
            genero: petFormData.genero,
            foto_url: petFormData.foto_url,
            notas_internas: petFormData.notas_internas
          }])
          .select()
          .single();
        if (petError) throw petError;
        finalPet = petData;
      } 
      // Lógica para Modo Rápido (Campo Único)
      else if (modo === 'rapido' && petNomeRapido) {
        const { data: petData, error: petError } = await supabaseClient
          .from('pets')
          .insert([{
            cliente_id: finalClient.id,
            nome: petNomeRapido,
            especie: 'Cachorro'
          }])
          .select()
          .single();
        if (petError) throw petError;
        finalPet = petData;
      }

      showToast(isUpdate ? "Dados atualizados!" : "Cadastro realizado com sucesso!");

      // --- GATILHO WHATSAPP BOAS-VINDAS (NÃO-BLOQUEANTE) ---
      if (!isUpdate && finalClient?.telefone) {
        const petName = finalPet?.nome || petNomeRapido || petFormData.nome || 'seu pet';
        const msg = `Olá, ${finalClient.nome}! Seja bem-vindo(a) à Igui Banho e Tosa! 🐾 Já estamos com a ficha do(a) ${petName} pronta aqui. ✨`;
        
        enviarNotificacaoWhatsApp({
          telefone: finalClient.telefone,
          mensagem: msg,
          unidadeId: unitId,
          supabaseClient
        });
      }

      onSave({ cliente: finalClient, pet: finalPet });
      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar cadastro:", err);
      showToast(err.message || "Erro ao processar cadastro", "error");
    } finally {
      setLoading(false);
    }
  };

  const headerColor = modo === 'completo' ? 'bg-[#00BFA5]' : 'bg-indigo-600';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className={`bg-white w-[95%] mx-auto ${modo === 'completo' ? 'md:max-w-5xl' : 'md:max-w-md'} md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]`}>
        
        <header className={`${headerColor} p-4 md:p-8 text-white flex justify-between items-center shrink-0`}>
          <div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter">
              {modo === 'completo' ? (formData.id ? 'Editar Cadastro' : 'Novo Cliente') : 'Cadastro Expresso'}
            </h3>
            <p className="text-white/70 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1">
              Rede iG Banho e Tosa
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        {modo === 'completo' && (
          <nav className="flex flex-wrap bg-slate-50 border-b border-slate-100 shrink-0 px-4 md:px-8 gap-2">
             <button 
               onClick={() => setActiveTab('tutor')}
               className={`py-4 md:py-5 px-4 md:px-6 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'tutor' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
             >
                <i className="fa-solid fa-user mr-2"></i> Tutor
                {activeTab === 'tutor' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
             </button>
             <button 
               onClick={() => setActiveTab('pet')}
               className={`py-4 md:py-5 px-4 md:px-6 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === 'pet' ? 'text-[#00BFA5]' : 'text-slate-400 hover:text-slate-600'}`}
             >
                <i className="fa-solid fa-paw mr-2"></i> Pet
                {activeTab === 'pet' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#00BFA5] rounded-t-full"></div>}
             </button>
          </nav>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-8 custom-scrollbar">
          
          {modo === 'completo' ? (
            <div className="animate-in fade-in duration-300">
              
              {/* ABA TUTOR */}
              {activeTab === 'tutor' && (
                <div className="space-y-10">
                  <div className="flex flex-col lg:flex-row gap-10">
                    <div className="flex flex-col items-center space-y-3">
                       <input type="file" ref={fileInputRef} onChange={(e) => handleImageUpload(e, 'tutor')} className="hidden" accept="image/*" />
                       <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-32 h-32 bg-slate-50 rounded-full border-4 border-slate-100 flex items-center justify-center text-slate-300 relative group cursor-pointer overflow-hidden shadow-inner"
                       >
                          {uploadingImage ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#00BFA5]"></i>
                          ) : formData.foto_url ? (
                            <img src={formData.foto_url} alt="Foto Tutor" className="w-full h-full object-cover" />
                          ) : (
                            <i className="fa-solid fa-camera text-3xl"></i>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-white font-bold uppercase">Alterar</span>
                          </div>
                       </div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Foto do Tutor</span>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-3 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo *</label>
                        <input required type="text" value={formData.nome || ''} onChange={(e) => setFormData({...formData, nome: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" placeholder="Ex: João da Silva" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp Principal *</label>
                        <input required type="tel" value={formData.telefone || ''} onChange={(e) => setFormData({...formData, telefone: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" placeholder="(00) 00000-0000" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                        <input type="text" value={formData.cpf || ''} onChange={(e) => setFormData({...formData, cpf: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                        <input type="email" value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-6 gap-6 pt-6 border-t border-slate-50">
                    <div className="md:col-span-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                      <div className="relative">
                        <input type="text" value={formData.cep || ''} onChange={(e) => setFormData({...formData, cep: e.target.value})} onBlur={handleCEPSearch} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" placeholder="00000-000" />
                        {searchingCEP && <i className="fa-solid fa-circle-notch fa-spin absolute right-4 top-1/2 -translate-y-1/2 text-[#00BFA5]"></i>}
                      </div>
                    </div>
                    <div className="md:col-span-3 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Logradouro</label>
                      <input type="text" value={formData.logradouro || ''} onChange={(e) => setFormData({...formData, logradouro: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
                    </div>
                    <div className="md:col-span-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº</label>
                      <input ref={numeroInputRef} type="text" value={formData.numero || ''} onChange={(e) => setFormData({...formData, numero: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
                    </div>
                    <div className="md:col-span-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                      <input type="text" value={formData.bairro || ''} onChange={(e) => setFormData({...formData, bairro: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">Restrições / Observações Importantes</label>
                    <textarea rows={3} value={formData.restricoes || ''} onChange={(e) => setFormData({...formData, restricoes: e.target.value})} className="w-full px-5 py-4 bg-rose-50 border border-rose-100 rounded-2xl outline-none font-bold text-rose-700 resize-none" placeholder="Ex: Cliente problemático, pet tem alergia grave, etc..."></textarea>
                  </div>
                </div>
              )}

              {/* ABA PET */}
              {activeTab === 'pet' && (
                <div className="space-y-10">
                  <div className="flex flex-col lg:flex-row gap-10">
                    <div className="flex flex-col items-center space-y-3">
                       <input type="file" ref={petFileInputRef} onChange={(e) => handleImageUpload(e, 'pet')} className="hidden" accept="image/*" />
                       <div 
                        onClick={() => petFileInputRef.current?.click()}
                        className="w-32 h-32 bg-slate-50 rounded-[2.5rem] border-4 border-slate-100 flex items-center justify-center text-slate-300 relative group cursor-pointer overflow-hidden shadow-inner"
                       >
                          {uploadingPetImage ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#00BFA5]"></i>
                          ) : petFormData.foto_url ? (
                            <img src={petFormData.foto_url} alt="Foto Pet" className="w-full h-full object-cover" />
                          ) : (
                            <i className="fa-solid fa-dog text-4xl"></i>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-white font-bold uppercase">Subir Foto</span>
                          </div>
                       </div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Foto do Animal</span>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Pet *</label>
                        <input type="text" value={petFormData.nome || ''} onChange={(e) => setPetFormData({...petFormData, nome: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all" placeholder="Ex: Rex" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Espécie</label>
                        <select value={petFormData.especie || 'Cachorro'} onChange={(e) => setPetFormData({...petFormData, especie: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700">
                          <option value="Cachorro">Cachorro</option>
                          <option value="Gato">Gato</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raça</label>
                        <input type="text" value={petFormData.raca || ''} onChange={(e) => setPetFormData({...petFormData, raca: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Golden Retriever" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Porte</label>
                           <select value={petFormData.porte || 'Médio'} onChange={(e) => setPetFormData({...petFormData, porte: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700">
                             <option value="Pequeno">P</option>
                             <option value="Médio">M</option>
                             <option value="Grande">G</option>
                             <option value="Gigante">GG</option>
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sexo</label>
                           <select value={petFormData.genero || 'Macho'} onChange={(e) => setPetFormData({...petFormData, genero: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700">
                             <option value="Macho">Macho</option>
                             <option value="Fêmea">Fêmea</option>
                           </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações do Pet</label>
                    <textarea rows={3} value={petFormData.notas_internas || ''} onChange={(e) => setPetFormData({...petFormData, notas_internas: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-600 resize-none" placeholder="Ex: Medo de soprador, bravo no banho, problemas de pele..."></textarea>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* MODO RÁPIDO (SIMPLIFICADO) */
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Tutor *</label>
                <div className="relative">
                  <i className="fa-solid fa-user absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                  <input required type="text" value={formData.nome || ''} onChange={(e) => setFormData({...formData, nome: e.target.value})} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Maria Clara" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp *</label>
                <div className="relative">
                  <i className="fa-brands fa-whatsapp absolute left-5 top-1/2 -translate-y-1/2 text-emerald-400"></i>
                  <input required type="tel" value={formData.telefone || ''} onChange={(e) => setFormData({...formData, telefone: e.target.value})} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Pet</label>
                <div className="relative">
                  <i className="fa-solid fa-dog absolute left-5 top-1/2 -translate-y-1/2 text-amber-400"></i>
                  <input type="text" value={petNomeRapido || ''} onChange={(e) => setPetNomeRapido(e.target.value)} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Totó" />
                </div>
              </div>
            </div>
          )}
        </form>

        <footer className="p-4 md:p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 md:gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 md:flex-none px-4 py-3 md:px-8 md:py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-colors text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
          <button 
            onClick={handleSubmit} 
            disabled={loading || uploadingImage || uploadingPetImage} 
            className={`flex-[2] md:flex-none px-4 py-3 md:px-10 md:py-4 ${headerColor} text-white rounded-2xl font-black shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center text-[10px] md:text-xs uppercase tracking-widest`}
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2 md:mr-3"></i> : <i className="fa-solid fa-floppy-disk mr-2 md:mr-3"></i>} 
            {modo === 'completo' ? 'Salvar Cadastro' : 'Criar Registro'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ClienteModal;
