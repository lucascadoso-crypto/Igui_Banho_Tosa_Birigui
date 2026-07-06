import React, { useEffect, useState } from 'react';
import { CategoriaDespesa, fetchCategorias, salvarCategoria } from '../../services/gastos';

interface CategoriasModalProps {
  supabaseClient: any;
  onClose: () => void;
  onChanged: () => void;
}

const ICONES_SUGERIDOS = [
  'fa-users', 'fa-building', 'fa-bolt', 'fa-gas-pump', 'fa-boxes-stacked', 'fa-screwdriver-wrench',
  'fa-bullhorn', 'fa-phone', 'fa-laptop', 'fa-landmark', 'fa-ellipsis', 'fa-circle-dollar-to-slot'
];

const CategoriasModal: React.FC<CategoriasModalProps> = ({ supabaseClient, onClose, onChanged }) => {
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CategoriaDespesa> | null>(null);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      setCategorias(await fetchCategorias(supabaseClient));
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!editing?.nome) return;
    setSaving(true);
    try {
      await salvarCategoria(supabaseClient, editing);
      setEditing(null);
      await carregar();
      onChanged();
    } catch (err: any) {
      alert('Erro ao salvar categoria: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <header className="bg-[#1E1E1E] p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-black">Categorias de Despesa</h3>
            <p className="text-slate-400 text-xs font-medium">Crie ou edite categorias usadas nos lançamentos</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <p className="text-center text-slate-300 font-bold italic py-8">Carregando...</p>
          ) : (
            categorias.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.cor}20`, color: c.cor }}>
                    <i className={`fa-solid ${c.icone}`}></i>
                  </span>
                  <span className="font-bold text-slate-700 truncate">{c.nome}</span>
                </span>
                <button onClick={() => setEditing(c)} className="text-slate-400 hover:text-indigo-600 p-2 shrink-0">
                  <i className="fa-solid fa-pen"></i>
                </button>
              </div>
            ))
          )}

          {editing ? (
            <div className="border border-slate-200 rounded-2xl p-4 space-y-3 mt-4">
              <input
                type="text" placeholder="Nome da categoria" value={editing.nome || ''}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
              />
              <div className="flex items-center gap-3">
                <input
                  type="color" value={editing.cor || '#94A3B8'}
                  onChange={(e) => setEditing({ ...editing, cor: e.target.value })}
                  className="w-12 h-10 rounded-lg border border-slate-200"
                />
                <select
                  value={editing.icone || 'fa-circle-dollar-to-slot'}
                  onChange={(e) => setEditing({ ...editing, icone: e.target.value })}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                >
                  {ICONES_SUGERIDOS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="flex-1 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">Cancelar</button>
                <button onClick={salvar} disabled={saving} className="flex-1 py-2.5 bg-[#1E1E1E] text-white rounded-xl font-black text-[11px] uppercase">
                  {saving ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing({ nome: '', icone: 'fa-circle-dollar-to-slot', cor: '#94A3B8' })}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:border-slate-300 font-black text-xs uppercase mt-2"
            >
              <i className="fa-solid fa-plus mr-2"></i> Nova categoria
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoriasModal;
