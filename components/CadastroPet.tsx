
import React, { useState, useRef } from 'react';
import { Pet, UiId, UserProfile } from '../types';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';

interface CadastroPetProps {
  clientId: UiId;
  clientName: string;
  supabaseClient: any;
  unitId?: UiId;
  userProfile?: UserProfile;
  onClose: () => void;
  onSave?: (pet: Pet) => void;
  onSaveAndSchedule?: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

const CadastroPet: React.FC<CadastroPetProps> = ({ 
  clientId, 
  clientName, 
  supabaseClient, 
  unitId,
  userProfile,
  onClose, 
  onSave,
  onSaveAndSchedule,
  showToast 
}) => {
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [petData, setPetData] = useState<Partial<Pet>>({
    cliente_id: Number(clientId),
    unidade_id: unitId ? Number(unitId) : undefined,
    nome: '',
    especie: 'Cachorro',
    porte: 'Médio',
    comportamento: 'Dócil',
    genero: 'Macho',
    foto_url: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const url = await uploadToImgBB(file);
    if (url) {
      setPetData(prev => ({ ...prev, foto_url: url }));
      showToast("Foto do pet enviada!");
    } else {
      showToast("Erro no upload da foto", "error");
    }
    setUploadingImage(false);
  };

  const handleSave = async (redirect: boolean = false) => {
    if (!petData.nome) {
      showToast("O nome do Pet é obrigatório", "error");
      return;
    }

    setLoading(true);
    try {
      const activeUnitId = Number(unitId);
      if (!Number.isFinite(activeUnitId) || activeUnitId <= 0) {
        showToast("Selecione uma unidade antes de cadastrar pets.", "error");
        return;
      }

      const { data, error } = await supabaseClient
        .from('pets')
        .insert([{
          ...petData,
          cliente_id: Number(clientId),
          unidade_id: activeUnitId
        }])
        .select()
        .single();

      if (error) throw error;

      // Log de Auditoria
      if (unitId) {
        registrarAtividade(
          unitId,
          userProfile?.email || 'sistema',
          'NOVO_PET',
          `Cadastrou o pet ${petData.nome} para o cliente ${clientName}`,
          userProfile?.nome,
          userProfile?.cargo
        );
      }

      showToast("Pet cadastrado com sucesso!");
      
      if (onSave) {
        onSave(data);
      } else if (redirect && onSaveAndSchedule) {
        onSaveAndSchedule();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error("Erro ao salvar pet:", err);
      showToast("Erro ao salvar: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="app-modal-panel bg-white w-[95%] mx-auto md:max-w-5xl md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        <header className="app-modal-header bg-[#00BFA5] p-4 md:p-8 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl md:text-2xl font-black">Pet iG <i className="fa-solid fa-arrow-right mx-2 text-sm opacity-50"></i> Novo Prontuário</h3>
          </div>
          <button 
            onClick={onClose} 
            className="relative z-50 p-2 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors text-xl md:text-2xl cursor-pointer"
          >
            <i className="fa-solid fa-xmark pointer-events-none"></i>
          </button>
        </header>

        <form className="app-modal-body flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-8 custom-scrollbar">
          <div className="flex flex-col lg:flex-row gap-10">
            <div className="flex flex-col items-center space-y-4">
               <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
               <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 bg-slate-100 rounded-[2.5rem] border-4 border-slate-50 flex items-center justify-center text-slate-300 relative group cursor-pointer overflow-hidden shadow-inner"
               >
                  {uploadingImage ? (
                    <i className="fa-solid fa-circle-notch fa-spin text-4xl text-[#00BFA5]"></i>
                  ) : petData.foto_url ? (
                    <img src={petData.foto_url} alt="Foto Pet" className="w-full h-full object-cover" />
                  ) : (
                    <i className="fa-solid fa-dog text-5xl"></i>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-white font-bold uppercase">Subir Foto</span>
                  </div>
               </div>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foto do Pet</span>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome do Pet *</label>
                <input required type="text" value={petData.nome} onChange={(e) => setPetData({...petData, nome: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Rex" />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Espécie</label>
                <select value={petData.especie} onChange={(e) => setPetData({...petData, especie: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700">
                  <option value="Cachorro">Cachorro</option>
                  <option value="Gato">Gato</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Raça</label>
                <input type="text" value={petData.raca} onChange={(e) => setPetData({...petData, raca: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Poodle" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Porte</label>
                <select value={petData.porte} onChange={(e) => setPetData({...petData, porte: (e.target.value as any)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700">
                  <option value="Mini">Mini</option>
                  <option value="Pequeno">Pequeno</option>
                  <option value="Médio">Médio</option>
                  <option value="Grande">Grande</option>
                  <option value="Gigante">Gigante</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Gênero</label>
                <select value={petData.genero} onChange={(e) => setPetData({...petData, genero: (e.target.value as any)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700">
                  <option value="Macho">Macho</option>
                  <option value="Fêmea">Fêmea</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Comportamento</label>
                <select value={petData.comportamento} onChange={(e) => setPetData({...petData, comportamento: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700">
                  <option value="Dócil">Dócil</option>
                  <option value="Agitado">Agitado</option>
                  <option value="Agressivo">Agressivo</option>
                  <option value="Medroso">Medroso</option>
                  <option value="Idoso">Idoso / Especial</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Observações / Alergias</label>
                <textarea value={petData.observacoes} onChange={(e) => setPetData({...petData, observacoes: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 resize-none h-24" placeholder="Ex: Possui alergia a tal produto..." />
              </div>
            </div>
          </div>
        </form>

        <footer className="app-modal-footer p-4 md:p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 md:gap-4">
           <button onClick={onClose} className="flex-1 md:flex-none px-4 py-3 md:px-8 md:py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-colors text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
           <button onClick={() => handleSave(false)} disabled={loading || uploadingImage} className="flex-[2] md:flex-none px-4 py-3 md:px-10 md:py-4 bg-[#00BFA5] text-white rounded-2xl font-black shadow-xl transition-all disabled:opacity-50 text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center">
             {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-floppy-disk mr-2"></i>} Salvar Pet
           </button>
        </footer>
      </div>
    </div>
  );
};

export default CadastroPet;
