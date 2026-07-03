import React from 'react';
import { ContaPendente } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { thClass, thClassRight } from '../Dashboard/tableClasses';
import { formatVencimento, ContasReceberEmptyState } from './ContasReceberCard';

interface ContasReceberModalProps {
  open: boolean;
  onClose: () => void;
  items: ContaPendente[];
  loading?: boolean;
}

const ContasReceberModal: React.FC<ContasReceberModalProps> = ({ open, onClose, items, loading }) => {
  if (!open) return null;

  const totalPendente = items.reduce((sum, item) => sum + item.valor, 0);

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <header className="bg-violet-600 p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-black">Contas a Receber</h3>
            <p className="text-violet-100 text-xs font-medium">{items.length} lançamento(s) pendente(s) no filtro selecionado</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-center text-slate-400 font-bold py-10">Carregando...</p>
          ) : items.length === 0 ? (
            <ContasReceberEmptyState />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 sticky top-0 bg-white">
                  <th className={thClass}>Cliente</th>
                  <th className={thClass}>Descrição</th>
                  <th className={thClassRight}>Vencimento</th>
                  <th className={thClassRight}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.origem}-${item.referenciaId}`} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-bold text-slate-700">{item.clienteNome}</td>
                    <td className="py-3 pr-4 text-slate-600 font-bold">{item.descricao}</td>
                    <td className={`py-3 pr-4 text-right font-bold whitespace-nowrap ${item.vencido ? 'text-rose-600' : 'text-slate-600'}`}>
                      {formatVencimento(item.vencimento)}
                    </td>
                    <td className="py-3 text-right font-black text-slate-800 whitespace-nowrap">{formatCurrencyBR(item.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {items.length > 0 && (
          <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Total pendente</span>
            <span className="text-lg font-black text-slate-900">{formatCurrencyBR(totalPendente)}</span>
          </footer>
        )}
      </div>
    </div>
  );
};

export default ContasReceberModal;
