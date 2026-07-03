import React from 'react';

interface FinanceStatusBarProps {
  syncing: boolean;
  onSync: () => void;
}

const FinanceStatusBar: React.FC<FinanceStatusBarProps> = ({ syncing, onSync }) => (
  <div className="bg-violet-50 border border-violet-100 rounded-[2rem] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <div className="w-11 h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
        <i className="fa-solid fa-database"></i>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black text-violet-800 uppercase tracking-widest truncate">Conectado à base de dados Supabase</p>
        <p className="text-[11px] font-bold text-violet-500/80 truncate">Exibindo faturamento e despesas operacionais reais da rede.</p>
      </div>
    </div>
    <button
      onClick={onSync}
      disabled={syncing}
      className="shrink-0 px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all"
    >
      <i className={`fa-solid fa-rotate ${syncing ? 'fa-spin' : ''}`}></i>
      {syncing ? 'Sincronizando...' : 'Sincronizar'}
    </button>
  </div>
);

export default FinanceStatusBar;
