
import React from 'react';

interface BlockErrorProps {
  message?: string;
  onRetry: () => void;
  height?: number;
}

/**
 * Estado de erro padrao para um bloco do Dashboard: mostra "Indisponivel"
 * em vez do conteudo e um botao para tentar novamente so aquele bloco
 * (sem recarregar o Dashboard inteiro).
 */
const BlockError: React.FC<BlockErrorProps> = ({ message = 'Não foi possível carregar estes dados agora.', onRetry, height }) => (
  <div
    className="flex flex-col items-center justify-center text-center py-8 gap-3"
    style={height ? { minHeight: height } : undefined}
  >
    <i className="fa-solid fa-triangle-exclamation text-rose-300 text-2xl"></i>
    <p className="text-rose-500 font-bold text-sm max-w-xs">{message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
    >
      <i className="fa-solid fa-rotate-right mr-1.5"></i> Tentar novamente
    </button>
  </div>
);

export default BlockError;
