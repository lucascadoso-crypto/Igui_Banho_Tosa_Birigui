import React, { useState } from 'react';
import {
  baixarRelatorioFinanceiroCsv,
  baixarRelatorioFinanceiroPdf,
  RelatorioFinanceiroEntrada
} from '../../services/financeiroRelatorio';

interface BaixarRelatorioButtonProps {
  entrada: RelatorioFinanceiroEntrada | null;
  carregando: boolean;
}

const BaixarRelatorioButton: React.FC<BaixarRelatorioButtonProps> = ({ entrada, carregando }) => {
  const [aberto, setAberto] = useState(false);
  const desabilitado = carregando || !entrada;

  const baixar = (formato: 'pdf' | 'csv') => {
    setAberto(false);
    if (!entrada) return;
    try {
      if (formato === 'pdf') baixarRelatorioFinanceiroPdf(entrada);
      else baixarRelatorioFinanceiroCsv(entrada);
    } catch (err) {
      console.error('Erro ao gerar relatório financeiro:', err);
      alert('Não foi possível gerar o relatório. Tente novamente.');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={desabilitado}
        title={desabilitado ? 'Aguarde os dados carregarem' : 'Baixar relatório do período selecionado'}
        className="px-6 py-3 bg-[#00BFA5] hover:bg-[#00a893] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all"
      >
        <i className="fa-solid fa-file-arrow-down"></i>
        Baixar relatório
        <i className={`fa-solid fa-chevron-down text-[8px] transition-transform ${aberto ? 'rotate-180' : ''}`}></i>
      </button>
      {aberto && !desabilitado && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)}></div>
          <div className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl p-2">
            <button
              onClick={() => baixar('pdf')}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center gap-3"
            >
              <i className="fa-solid fa-file-pdf text-rose-500"></i>
              <span>
                <span className="block text-xs font-black text-slate-700">Relatório em PDF</span>
                <span className="block text-[10px] font-bold text-slate-400">Para ler e compartilhar</span>
              </span>
            </button>
            <button
              onClick={() => baixar('csv')}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center gap-3"
            >
              <i className="fa-solid fa-file-csv text-emerald-600"></i>
              <span>
                <span className="block text-xs font-black text-slate-700">Planilha para Excel (CSV)</span>
                <span className="block text-[10px] font-bold text-slate-400">Para analisar os números</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BaixarRelatorioButton;
