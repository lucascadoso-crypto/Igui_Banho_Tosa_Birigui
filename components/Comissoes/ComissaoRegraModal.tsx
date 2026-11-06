import React, { useState } from 'react';
import { ComissaoRegra, salvarComissaoRegra, getTodayBR } from '../../services/comissoes';
import { FuncionarioOpcao } from '../../services/gastos';

interface ComissaoRegraModalProps {
  unidadeId: number;
  funcionarios: FuncionarioOpcao[];
  regra: Partial<ComissaoRegra> | null;
  supabaseClient: any;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIAS = [
  { value: 'todas', label: 'Todas as categorias' },
  { value: 'banho', label: 'Banho' },
  { value: 'tosa', label: 'Tosa' },
  { value: 'outro', label: 'Outro' }
];

const ComissaoRegraModal: React.FC<ComissaoRegraModalProps> = ({ unidadeId, funcionarios, regra, supabaseClient, onClose, onSaved }) => {
  const [funcionarioId, setFuncionarioId] = useState<number | ''>(regra?.funcionarioId ?? '');
  const [categoriaServico, setCategoriaServico] = useState(regra?.categoriaServico || 'todas');
  const [tipo, setTipo] = useState(regra?.tipo || 'percentual');
  const [valor, setValor] = useState(regra?.valor ?? 0);
  const [vigenteDesde, setVigenteDesde] = useState(regra?.vigenteDesde || getTodayBR());
  const [ativo, setAtivo] = useState(regra?.ativo ?? true);
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    try {
      await salvarComissaoRegra(supabaseClient, {
        id: regra?.id,
        unidadeId,
        funcionarioId: funcionarioId === '' ? null : Number(funcionarioId),
        categoriaServico,
        tipo,
        valor: Number(valor),
        vigenteDesde,
        ativo
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert('Erro ao salvar regra de comissão: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden">
        <header className="bg-[#1E1E1E] p-6 text-white flex justify-between items-center">
          <h3 className="text-lg font-black">{regra?.id ? 'Editar Regra' : 'Nova Regra de Comissão'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profissional</label>
            <select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
              <option value="">Padrão da unidade (todos)</option>
              {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria de serviço</label>
            <select value={categoriaServico} onChange={(e) => setCategoriaServico(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
              {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as 'percentual' | 'fixo')}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
                <option value="percentual">Percentual (%)</option>
                <option value="fixo">Fixo (R$ por atendimento)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</label>
              <input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vigente desde</label>
            <input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
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

export default ComissaoRegraModal;
