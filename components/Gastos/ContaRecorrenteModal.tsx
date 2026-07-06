import React, { useState } from 'react';
import { CategoriaDespesa, ContaFixaRecorrente, salvarContaFixaRecorrente } from '../../services/gastos';

interface ContaRecorrenteModalProps {
  unidadeId: number;
  categorias: CategoriaDespesa[];
  conta: Partial<ContaFixaRecorrente> | null;
  supabaseClient: any;
  onClose: () => void;
  onSaved: () => void;
}

const ContaRecorrenteModal: React.FC<ContaRecorrenteModalProps> = ({ unidadeId, categorias, conta, supabaseClient, onClose, onSaved }) => {
  const [descricao, setDescricao] = useState(conta?.descricao || '');
  const [categoriaId, setCategoriaId] = useState<number | ''>(conta?.categoriaId ?? '');
  const [diaVencimento, setDiaVencimento] = useState(conta?.diaVencimento ?? 10);
  const [valorPrevisto, setValorPrevisto] = useState(conta?.valorPrevisto ?? 0);
  const [ativo, setAtivo] = useState(conta?.ativo ?? true);
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!descricao || !categoriaId) return;
    setSaving(true);
    try {
      await salvarContaFixaRecorrente(supabaseClient, {
        id: conta?.id,
        unidadeId,
        categoriaId: Number(categoriaId),
        descricao,
        diaVencimento: Number(diaVencimento),
        valorPrevisto: Number(valorPrevisto),
        ativo
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert('Erro ao salvar conta recorrente: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden">
        <header className="bg-[#1E1E1E] p-6 text-white flex justify-between items-center">
          <h3 className="text-lg font-black">{conta?.id ? 'Editar Conta Fixa' : 'Nova Conta Fixa Recorrente'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Aluguel do salão"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
              <option value="">Selecione...</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dia do vencimento</label>
              <input type="number" min={1} max={28} value={diaVencimento} onChange={(e) => setDiaVencimento(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor previsto (R$)</label>
              <input type="number" min={0} step="0.01" value={valorPrevisto} onChange={(e) => setValorPrevisto(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa (gera pendência todo mês)
          </label>
        </div>
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-8 py-3 bg-[#1E1E1E] text-white rounded-xl font-black text-[11px] uppercase">
            {saving ? '...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ContaRecorrenteModal;
