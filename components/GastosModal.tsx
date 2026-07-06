
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';
import {
  CategoriaDespesa,
  FuncionarioOpcao,
  fetchCategorias,
  fetchFuncionariosAtivos,
  salvarLancamentoFolha,
  getTodayBR
} from '../services/gastos';

interface GastosModalProps {
  unitId: number;
  supabaseClient: any;
  userProfile?: UserProfile;
  initialDate?: string;
  onClose: () => void;
  onRefresh: () => void;
}

const FORMAS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Outro'];

const GastosModal: React.FC<GastosModalProps> = ({ unitId, supabaseClient, userProfile, initialDate, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);

  const [formData, setFormData] = useState({
    nome_item: '',
    descricao: '',
    quantidade: 1,
    valor_total: '',
    comprovante_url: '',
    data_despesa: initialDate || getTodayBR(),
    categoria_id: '' as number | '',
    tipo: 'variavel' as 'fixo' | 'variavel',
    status: 'pago' as 'pago' | 'pendente',
    forma_pagamento: 'Pix',
    data_vencimento: initialDate || getTodayBR(),
    data_pagamento: initialDate || getTodayBR(),
    litros: '',
    km_rodado: ''
  });

  const [folha, setFolha] = useState({ funcionarioId: '' as number | '', salario: '', adiantamento: '0', encargos: '0' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategorias(supabaseClient).then(setCategorias).catch((err) => console.error('Erro ao carregar categorias:', err));
    fetchFuncionariosAtivos(supabaseClient, unitId).then(setFuncionarios).catch((err) => console.error('Erro ao carregar funcionários:', err));
  }, [supabaseClient, unitId]);

  const categoriaSelecionada = categorias.find((c) => c.id === formData.categoria_id);
  const isCombustivel = categoriaSelecionada?.nome === 'Combustível/Transporte';
  const isFolha = categoriaSelecionada?.nome === 'Folha de pagamento';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const url = await uploadToImgBB(file);
      if (url) setFormData((prev) => ({ ...prev, comprovante_url: url }));
    } catch (err) {
      console.error('Erro no upload:', err);
      alert('Erro ao subir imagem.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoria_id) { alert('Selecione uma categoria.'); return; }
    setLoading(true);
    try {
      if (isFolha) {
        if (!folha.funcionarioId || !folha.salario) { alert('Selecione o funcionário e informe o salário.'); setLoading(false); return; }
        await salvarLancamentoFolha(supabaseClient, {
          funcionarioId: Number(folha.funcionarioId),
          unidadeId: unitId,
          competencia: formData.data_despesa.slice(0, 8) + '01',
          salario: parseFloat(folha.salario) || 0,
          adiantamento: parseFloat(folha.adiantamento) || 0,
          encargos: parseFloat(folha.encargos) || 0,
          categoriaId: Number(formData.categoria_id),
          status: formData.status,
          formaPagamento: formData.status === 'pago' ? formData.forma_pagamento : undefined,
          dataPagamento: formData.status === 'pago' ? formData.data_pagamento : undefined,
          funcionarioNome: funcionarios.find((f) => f.id === folha.funcionarioId)?.nome || ''
        });

        registrarAtividade(
          unitId, userProfile?.email || 'sistema', 'NOVA_FOLHA_PAGAMENTO',
          `Lançou folha de pagamento para ${funcionarios.find((f) => f.id === folha.funcionarioId)?.nome}`,
          userProfile?.nome, userProfile?.cargo
        );
      } else {
        const payload: any = {
          nome_item: formData.nome_item,
          descricao: formData.descricao,
          quantidade: formData.quantidade,
          valor_total: parseFloat(formData.valor_total) || 0,
          comprovante_url: formData.comprovante_url,
          data_despesa: formData.data_despesa,
          unidade_id: unitId,
          categoria_id: Number(formData.categoria_id),
          tipo: formData.tipo,
          status: formData.status
        };
        if (formData.status === 'pago') {
          payload.forma_pagamento = formData.forma_pagamento;
          payload.data_pagamento = formData.data_pagamento;
        } else {
          payload.data_vencimento = formData.data_vencimento;
        }
        if (isCombustivel) {
          if (formData.litros) payload.litros = parseFloat(formData.litros);
          if (formData.km_rodado) payload.km_rodado = parseFloat(formData.km_rodado);
        }

        const { error } = await supabaseClient.from('despesas').insert([payload]);
        if (error) throw error;

        registrarAtividade(
          unitId, userProfile?.email || 'sistema', 'NOVO_GASTO',
          `Lançou um novo gasto: ${formData.nome_item} - R$ ${(parseFloat(formData.valor_total) || 0).toFixed(2)}`,
          userProfile?.nome, userProfile?.cargo
        );
      }

      onRefresh();
      onClose();
    } catch (err: any) {
      console.error('Detalhe do erro Supabase:', err);
      alert('Erro ao salvar: ' + (err.message || err.error_description || 'Erro desconhecido'));
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
            <p className="text-slate-400 text-[10px] md:text-sm font-medium mt-1">Registre custos fixos, variáveis ou folha de pagamento.</p>
          </div>
          <button onClick={onClose} className="relative z-10 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors text-xl md:text-2xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="app-modal-body flex-1 overflow-y-auto p-6 md:p-10 space-y-6 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
            <select
              required
              value={formData.categoria_id}
              onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700"
            >
              <option value="">Selecione...</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
              <div className="flex gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                {(['fixo', 'variavel'] as const).map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => setFormData({ ...formData, tipo: t })}
                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${formData.tipo === t ? 'bg-[#1E1E1E] text-white' : 'text-slate-500'}`}
                  >
                    {t === 'fixo' ? 'Fixo' : 'Variável'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
              <div className="flex gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                {(['pago', 'pendente'] as const).map((s) => (
                  <button
                    key={s} type="button"
                    onClick={() => setFormData({ ...formData, status: s })}
                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${formData.status === s ? (s === 'pago' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white') : 'text-slate-500'}`}
                  >
                    {s === 'pago' ? 'Pago' : 'Pendente'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isFolha ? (
            <div className="space-y-4 bg-violet-50 border border-violet-100 rounded-2xl p-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Funcionário</label>
                <select
                  required
                  value={folha.funcionarioId}
                  onChange={(e) => setFolha({ ...folha, funcionarioId: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-5 py-4 bg-white border border-violet-200 rounded-2xl outline-none font-bold text-slate-700"
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Salário (R$)</label>
                  <input required type="number" step="0.01" value={folha.salario} onChange={(e) => setFolha({ ...folha, salario: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Adiantamento</label>
                  <input type="number" step="0.01" value={folha.adiantamento} onChange={(e) => setFolha({ ...folha, adiantamento: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest">Encargos</label>
                  <input type="number" step="0.01" value={folha.encargos} onChange={(e) => setFolha({ ...folha, encargos: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-slate-700" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O que foi gasto?</label>
                <input required type="text" value={formData.nome_item} onChange={(e) => setFormData({ ...formData, nome_item: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" placeholder="Ex: Shampoo 5L" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição (Opcional)</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 min-h-[80px] resize-none"
                  placeholder="Detalhes adicionais..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade</label>
                  <input type="number" value={formData.quantidade} onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total (R$)</label>
                  <input required type="number" step="0.01" value={formData.valor_total} onChange={(e) => setFormData({ ...formData, valor_total: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
                </div>
              </div>

              {isCombustivel && (
                <div className="grid grid-cols-2 gap-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Litros abastecidos</label>
                    <input type="number" step="0.01" value={formData.litros} onChange={(e) => setFormData({ ...formData, litros: e.target.value })} className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl outline-none font-bold text-slate-700" placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">KM rodados</label>
                    <input type="number" step="0.01" value={formData.km_rodado} onChange={(e) => setFormData({ ...formData, km_rodado: e.target.value })} className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl outline-none font-bold text-slate-700" placeholder="Opcional" />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
              <input type="date" value={formData.data_despesa} onChange={(e) => setFormData({ ...formData, data_despesa: e.target.value, data_pagamento: e.target.value, data_vencimento: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
            </div>
            {formData.status === 'pago' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento</label>
                <select value={formData.forma_pagamento} onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700">
                  {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</label>
                <input type="date" value={formData.data_vencimento} onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" />
              </div>
            )}
          </div>

          {!isFolha && (
            <>
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
            </>
          )}

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
