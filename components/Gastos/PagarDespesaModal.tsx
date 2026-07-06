import React, { useState } from 'react';
import { pagarDespesa, getTodayBR } from '../../services/gastos';
import { formatCurrencyBR } from '../../services/appointmentTotals';

interface PagarDespesaModalProps {
  despesaId: number;
  descricao: string;
  valorTotal: number;
  supabaseClient: any;
  onClose: () => void;
  onPaid: () => void;
}

const FORMAS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Outro'];

const PagarDespesaModal: React.FC<PagarDespesaModalProps> = ({ despesaId, descricao, valorTotal, supabaseClient, onClose, onPaid }) => {
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [dataPagamento, setDataPagamento] = useState(getTodayBR());
  const [saving, setSaving] = useState(false);

  const confirmar = async () => {
    setSaving(true);
    try {
      await pagarDespesa(supabaseClient, despesaId, formaPagamento, dataPagamento);
      onPaid();
      onClose();
    } catch (err: any) {
      alert('Erro ao dar baixa: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden">
        <header className="bg-emerald-600 p-6 text-white">
          <h3 className="text-lg font-black">Dar baixa</h3>
          <p className="text-emerald-100 text-xs font-medium truncate">{descricao} — {formatCurrencyBR(valorTotal)}</p>
        </header>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de pagamento</label>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
              {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data do pagamento</label>
            <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
          </div>
        </div>
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">Cancelar</button>
          <button onClick={confirmar} disabled={saving} className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase">
            {saving ? '...' : 'Confirmar Pagamento'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PagarDespesaModal;
