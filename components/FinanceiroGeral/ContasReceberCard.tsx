import React from 'react';
import { ContaPendente } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { thClass, thClassRight } from '../Dashboard/tableClasses';
import CardSkeleton from '../Dashboard/CardSkeleton';

interface ContasReceberCardProps {
  items: ContaPendente[];
  loading?: boolean;
  onVerTodas: () => void;
  limitePreview?: number;
}

const formatVencimento = (vencimento: string) => {
  const match = String(vencimento || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return vencimento;
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
};

export const ContasReceberEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-14 h-14 rounded-full bg-violet-50 text-violet-500 flex items-center justify-center text-2xl mb-4">
      <i className="fa-solid fa-circle-check"></i>
    </div>
    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhuma conta pendente no filtro selecionado</p>
  </div>
);

const ContasReceberCard: React.FC<ContasReceberCardProps> = ({ items, loading, onVerTodas, limitePreview = 8 }) => {
  if (loading) return <CardSkeleton height={280} />;

  const preview = items.slice(0, limitePreview);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Contas a Receber</h3>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
            Lista consolidada de lançamentos financeiros com status Pendente
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={onVerTodas}
            className="text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest whitespace-nowrap"
          >
            Ver todas...
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <ContasReceberEmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Descrição</th>
                <th className={thClassRight}>Vencimento</th>
                <th className={thClassRight}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item) => (
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
        </div>
      )}
    </div>
  );
};

export { formatVencimento };
export default ContasReceberCard;
