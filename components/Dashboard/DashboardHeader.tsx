
import React from 'react';
import { Unit } from '../../types';
import { DashboardFiltros } from '../../services/dashboardGerencial';

interface DashboardHeaderProps {
  units: Unit[];
  filtros: DashboardFiltros;
  onChangeFiltros: React.Dispatch<React.SetStateAction<DashboardFiltros>>;
  onOpenCostModal: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ filtros, onChangeFiltros }) => {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 bg-slate-900 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
            <i className="fa-solid fa-chart-line text-2xl"></i>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">Painel de Gestão</h2>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest truncate">Visão analítica financeira e operacional</p>
          </div>
        </div>

        <div className="flex items-end gap-4 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 shrink-0">
          <label className="space-y-1.5">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Data início</span>
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => onChangeFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
              className="bg-transparent font-bold text-sm text-slate-800 outline-none"
            />
          </label>
          <span className="text-slate-300 text-xs font-bold uppercase pb-2">até</span>
          <label className="space-y-1.5">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Data término</span>
            <input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => onChangeFiltros((f) => ({ ...f, dataFim: e.target.value }))}
              className="bg-transparent font-bold text-sm text-slate-800 outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
