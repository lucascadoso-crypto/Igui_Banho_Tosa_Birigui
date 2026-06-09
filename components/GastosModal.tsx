
import React, { useState, useRef } from 'react';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';

interface GastosModalProps {
  unitId: string;
  supabaseClient: any;
  userProfile?: any;
  initialDate?: string;
  onClose: () => void;
  onRefresh: () => void;
}

const GastosModal: React.FC<GastosModalProps> = ({ unitId, supabaseClient, userProfile, initialDate, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    nome_item: '',
    descricao: '',
    quantidade: 1,
    valor_total: '',
    comprovante_url: '',
    data_despesa: initialDate || new Date().toLocaleDateString('en-CA')
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const url = await uploadToImgBB(file);
      if (url) {
        setFormData(prev => ({ ...prev, comprovante_url: url }));
      }
    } catch (err) {
      console.error("Erro no upload:", err);
      alert("Erro ao subir imagem.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabaseClient
        .from('despesas')
        .insert([{
          ...formData,
          valor_total: parseFloat(formData.valor_total),
          unidade_id: unitId
        }]);

      if (error) throw error;

      // Log de Auditoria
      registrarAtividade(
        unitId,
        userProfile?.email || 'sistema',
        'NOVO_GASTO',
        `Lançou um novo gasto: ${formData.nome_item} - R$ ${parseFloat(formData.valor_total).toFixed(2)}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      onRefresh();
      onClose();
    } catch (err: any) {
      console.error("Detalhe do erro Supabase:", err);
      setLoading(false);
      alert("Erro ao salvar: " + (err.message || err.error_description || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="app-modal-panel bg-white w-[95%] mx-auto md:max-w-2xl md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        <header className="app-modal-header bg-[#1E1E1E] p-6 md:p-8 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter">Lançamento de Despesa</h3>
            <p className="text-slate-400 text-[10px] md:text-sm font-medium mt-1">Registre gastos de insumos ou manutenção.</p>
          </div>
          <button onClick={onClose} className="relative z-10 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors text-xl md:text-2xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="app-modal-body flex-1 overflow-y-auto p-6 md:p-10 space-y-6 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O que foi comprado?</label>
            <input required type="text" value={formData.nome_item} onChange={(e) => setFormData({...formData, nome_item: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Shampoo 5L" />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição do Gasto (Opcional)</label>
            <textarea 
              value={formData.descricao} 
              onChange={(e) => setFormData({...formData, descricao: e.target.value})} 
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 min-h-[100px] resize-none" 
              placeholder="Detalhes adicionais sobre a compra..."
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade</label>
              <input type="number" value={formData.quantidade} onChange={(e) => setFormData({...formData, quantidade: parseInt(e.target.value)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total (R$)</label>
              <input required type="number" step="0.01" value={formData.valor_total} onChange={(e) => setFormData({...formData, valor_total: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
            <input type="date" value={formData.data_despesa} onChange={(e) => setFormData({...formData, data_despesa: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
          </div>

          <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="p-8 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center space-y-2 group hover:border-slate-400 transition-all cursor-pointer bg-slate-50"
          >
             {uploadingImage ? (
               <i className="fa-solid fa-circle-notch fa-spin text-3xl text-slate-400"></i>
             ) : formData.comprovante_url ? (
               <div className="flex flex-col items-center">
                  <i className="fa-solid fa-circle-check text-3xl text-emerald-500"></i>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase mt-2">Comprovante anexado!</p>
               </div>
             ) : (
               <>
                  <i className="fa-solid fa-file-invoice-dollar text-3xl text-slate-300 group-hover:text-slate-500"></i>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anexar Nota / Cupom Fiscal</p>
               </>
             )}
          </div>

          <div className="flex flex-row gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-colors text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
            <button type="submit" disabled={loading || uploadingImage} className="flex-[2] py-4 md:py-5 bg-[#1E1E1E] text-white rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] shadow-2xl disabled:opacity-50">
              {loading ? 'SALVANDO...' : 'SALVAR DESPESA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GastosModal;
