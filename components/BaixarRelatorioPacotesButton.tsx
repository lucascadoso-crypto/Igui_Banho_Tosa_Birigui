import React, { useState } from 'react';
import {
  baixarPacotesCsv,
  baixarPacotesPdf,
  PacotesRelatorioEntrada
} from '../services/pacotesRelatorio';

interface BaixarRelatorioPacotesButtonProps {
  entrada: PacotesRelatorioEntrada;
  carregando: boolean;
}

const BaixarRelatorioPacotesButton: React.FC<BaixarRelatorioPacotesButtonProps> = ({ entrada, carregando }) => {
  const [aberto, setAberto] = useState(false);

  const baixar = (formato: 'pdf' | 'csv') => {
    setAberto(false);
    try {
      if (formato === 'pdf') baixarPacotesPdf(entrada);
      else baixarPacotesCsv(entrada);
    } catch (err) {
      console.error('Erro ao gerar relatório de pacotes:', err);
      alert('Não foi possível gerar o relatório. Tente novamente.');
    }
  };

  return (
    <div className="relative order-2 md:order-3 shrink-0">
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={carregando}
        title={carregando ? 'Aguarde os pacotes carregarem' : 'Baixar relatório dos pacotes ativos'}
        className="bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 border border-slate-200 px-5 md:px-6 py-3.5 rounded-2xl font-black shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
      >
        <i className="fa-solid fa-file-arrow-down text-[#00897B]"></i>
        <span>Relatório</span>
        <i className={`fa-solid fa-chevron-down text-[9px] transition-transform ${aberto ? 'rotate-180' : ''}`}></i>
      </button>
      {aberto && !carregando && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)}></div>
          <div className="absolute right-0 top-full mt-2 z-40 w-72 bg-white border border-slate-100 rounded-2xl shadow-xl p-2">
            <button
              onClick={() => baixar('csv')}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center gap-3"
            >
              <i className="fa-solid fa-file-csv text-emerald-600"></i>
              <span>
                <span className="block text-xs font-black text-slate-700">Planilha completa (Excel)</span>
                <span className="block text-[10px] font-bold text-slate-400">Todos os dados, para analisar e reajustar</span>
              </span>
            </button>
            <button
              onClick={() => baixar('pdf')}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center gap-3"
            >
              <i className="fa-solid fa-file-pdf text-rose-500"></i>
              <span>
                <span className="block text-xs font-black text-slate-700">Resumo em PDF</span>
                <span className="block text-[10px] font-bold text-slate-400">Panorama por tipo e lista dos pacotes</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BaixarRelatorioPacotesButton;
