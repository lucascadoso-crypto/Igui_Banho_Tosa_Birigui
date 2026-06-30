
import React, { useState, useRef } from 'react';
import { Pet, UiId, UserProfile } from '../types';
import { registrarAtividade } from '../services/logger';
import { getLastImgBBUploadError, uploadToImgBB } from '../services/imgbbService';

interface PetFormModalProps {
  pet?: Pet | null;
  clientId: UiId;
  clientName: string;
  unitId: UiId;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
  onSaved: (pet: Pet) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  zBoost?: number;
}

const PetFormModal: React.FC<PetFormModalProps> = ({
  pet,
  clientId,
  clientName,
  unitId,
  supabaseClient,
  userProfile,
  onClose,
  onSaved,
  showToast,
  zBoost = 0
}) => {
  const [savingPet, setSavingPet] = useState(false);
  const [uploadingPetPhoto, setUploadingPetPhoto] = useState(false);
  const petPhotoInputRef = useRef<HTMLInputElement>(null);

  const [newPet, setNewPet] = useState({
    id: pet?.id || '',
    nome: pet?.nome || '',
    raca: pet?.raca || '',
    genero: pet?.genero || 'Macho',
    porte: pet?.porte || 'Médio',
    data_nascimento: pet?.data_nascimento || '',
    notas_internas: pet?.notas_internas || '',
    foto_url: pet?.foto_url || ''
  });

  const handlePetPhotoUpload = async (file?: File) => {
    if (!file) return;

    const allowedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      showToast('Envie uma foto JPG, PNG ou WEBP.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('A foto deve ter no máximo 5 MB.', 'error');
      return;
    }

    const previousUrl = newPet.foto_url;
    const previewUrl = URL.createObjectURL(file);
    setNewPet(prev => ({ ...prev, foto_url: previewUrl }));
    setUploadingPetPhoto(true);

    try {
      const uploadedUrl = await uploadToImgBB(file);
      if (!uploadedUrl) {
        throw new Error(getLastImgBBUploadError() || 'Não foi possível enviar a foto do pet.');
      }

      setNewPet(prev => ({ ...prev, foto_url: uploadedUrl }));
      showToast('Foto do pet enviada com sucesso!');
    } catch (err) {
      console.error('Erro ao enviar foto do pet:', err);
      setNewPet(prev => ({ ...prev, foto_url: previousUrl || '' }));
      showToast('Não foi possível enviar a foto do pet. Verifique sua conexão e tente novamente.', 'error');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingPetPhoto(false);
      if (petPhotoInputRef.current) petPhotoInputRef.current.value = '';
    }
  };

  const handleRemovePetPhoto = () => {
    if (!newPet.foto_url) return;
    if (!window.confirm('Remover a foto deste pet?')) return;
    setNewPet(prev => ({ ...prev, foto_url: '' }));
    showToast('Foto removida. Salve as alterações para concluir.');
  };

  const handleSavePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPet.nome) return;

    setSavingPet(true);
    try {
      const activeUnitId = Number(unitId);
      if (!Number.isFinite(activeUnitId) || activeUnitId <= 0) {
        showToast("Selecione uma unidade antes de cadastrar pets.", "error");
        return;
      }

      const petData = {
        unidade_id: activeUnitId,
        cliente_id: clientId,
        nome: newPet.nome,
        raca: newPet.raca,
        genero: newPet.genero,
        porte: newPet.porte,
        data_nascimento: newPet.data_nascimento || null,
        notas_internas: newPet.notas_internas,
        foto_url: newPet.foto_url || null,
        especie: pet?.especie || 'Cachorro'
      };

      let savedPet: Pet;

      if (pet?.id) {
        const { data, error } = await supabaseClient
          .from('pets')
          .update(petData)
          .eq('id', pet.id)
          .select()
          .single();

        if (error) throw error;
        savedPet = data;

        registrarAtividade(
          unitId,
          userProfile?.email || 'sistema',
          'EDICAO_PET',
          `Editou o pet ${petData.nome} do cliente ${clientName}`,
          userProfile?.nome,
          userProfile?.cargo
        );

        showToast("Pet atualizado com sucesso!");
      } else {
        const { data, error } = await supabaseClient
          .from('pets')
          .insert([petData])
          .select()
          .single();

        if (error) throw error;
        savedPet = data;

        registrarAtividade(
          unitId,
          userProfile?.email || 'sistema',
          'NOVO_PET',
          `Cadastrou o pet ${petData.nome} para o cliente ${clientName}`,
          userProfile?.nome,
          userProfile?.cargo
        );

        showToast("Pet adicionado com sucesso!");
      }

      window.dispatchEvent(new Event('refreshClientes'));
      onSaved(savedPet);
    } catch (err: any) {
      console.error("Erro ao salvar pet:", err);
      showToast("Erro ao salvar pet.", "error");
    } finally {
      setSavingPet(false);
    }
  };

  return (
    <div className={`app-modal-overlay fixed inset-0 z-[${100 + zBoost}] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 md:p-5 overflow-hidden animate-in fade-in duration-200`}>
      <div className="app-modal-panel bg-white w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] md:w-full md:max-w-[960px] rounded-[2rem] md:rounded-[2.25rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[calc(100dvh-24px)] md:max-h-[calc(100dvh-40px)]">
        <header className="app-modal-header bg-[#00BFA5] p-5 md:p-8 text-white flex justify-between items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter break-words leading-tight">{pet?.id ? 'Detalhes do Pet' : 'Adicionar Novo Pet'}</h3>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest break-words">Tutor: {clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="relative z-50 p-2 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl cursor-pointer shrink-0"
          >
            <i className="fa-solid fa-xmark pointer-events-none"></i>
          </button>
        </header>

        <form onSubmit={handleSavePet} className="app-modal-body overflow-y-auto overflow-x-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-5 md:gap-7 p-5 md:p-8">
            <aside className="w-full md:w-[280px]">
              <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50 p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => petPhotoInputRef.current?.click()}
                  className="group relative w-full aspect-square overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white flex items-center justify-center"
                  aria-label={newPet.foto_url ? 'Trocar foto do pet' : 'Adicionar foto do pet'}
                >
                  {newPet.foto_url ? (
                    <img src={newPet.foto_url} alt="Foto do pet" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center px-6">
                      <div className="mx-auto mb-4 w-16 h-16 rounded-3xl bg-teal-50 text-[#00BFA5] flex items-center justify-center text-2xl">
                        <i className="fa-solid fa-paw"></i>
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Foto do pet</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm font-black uppercase tracking-widest">
                    <i className="fa-solid fa-camera mr-2"></i>
                    {newPet.foto_url ? 'Trocar' : 'Adicionar'}
                  </div>
                </button>

                <input
                  ref={petPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handlePetPhotoUpload(e.target.files?.[0])}
                />

                <button
                  type="button"
                  onClick={() => petPhotoInputRef.current?.click()}
                  disabled={uploadingPetPhoto}
                  className="mt-4 w-full py-3.5 rounded-2xl bg-[#00BFA5] text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[#00BFA5]/15 hover:opacity-90 transition-all disabled:opacity-60"
                >
                  {uploadingPetPhoto ? (
                    <><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Enviando foto...</>
                  ) : newPet.foto_url ? 'TROCAR FOTO' : 'ADICIONAR FOTO'}
                </button>

                {newPet.foto_url && (
                  <button
                    type="button"
                    onClick={handleRemovePetPhoto}
                    disabled={uploadingPetPhoto}
                    className="mt-2 w-full py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-50"
                  >
                    REMOVER FOTO
                  </button>
                )}

                <p className="mt-3 text-[10px] font-bold text-slate-400 leading-relaxed text-center">
                  JPG, PNG ou WEBP até 5 MB.
                </p>
              </div>
            </aside>

            <div className="min-w-0 space-y-4 md:space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Pet *</label>
                  <input
                    required
                    type="text"
                    value={newPet.nome}
                    onChange={(e) => setNewPet({ ...newPet, nome: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                    placeholder="Ex: Rex"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Raça</label>
                  <input
                    type="text"
                    value={newPet.raca}
                    onChange={(e) => setNewPet({ ...newPet, raca: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                    placeholder="Ex: Golden Retriever"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sexo</label>
                  <select
                    value={newPet.genero}
                    onChange={(e) => setNewPet({ ...newPet, genero: e.target.value })}
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
                    onChange={(e) => setNewPet({ ...newPet, porte: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                  >
                    <option value="Pequeno">Pequeno</option>
                    <option value="Médio">Médio</option>
                    <option value="Grande">Grande</option>
                    <option value="Gigante">Gigante</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 md:max-w-xs">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Nascimento</label>
                <input
                  type="date"
                  value={newPet.data_nascimento}
                  onChange={(e) => setNewPet({ ...newPet, data_nascimento: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-[#00BFA5] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Detalhes / Obs de Saúde e Comportamento</label>
                <textarea
                  rows={5}
                  value={newPet.notas_internas}
                  onChange={(e) => setNewPet({ ...newPet, notas_internas: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-600 focus:ring-2 focus:ring-[#00BFA5] transition-all resize-none"
                  placeholder="Ex: Alérgico a perfume, comportamento agitado..."
                />
              </div>

              <div className="pt-4 flex flex-col-reverse md:flex-row md:justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full md:w-40 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                >Cancelar</button>
                <button
                  type="submit"
                  disabled={savingPet || uploadingPetPhoto}
                  className="w-full md:w-56 py-4 bg-[#00BFA5] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[#00BFA5]/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingPet ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'SALVAR ALTERAÇÕES'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PetFormModal;
