import React from 'react';
import { Unit } from '../../types';
import { RentabilidadeFiltros, getFiltrosDefault } from '../../services/rentabilidade';

interface RentabilidadeFiltersCardProps {
  units: Unit[];
  filtros: RentabilidadeFiltros;
  onChangeFiltros: React.Dispatch<React.SetStateAction<RentabilidadeFiltros>>;
}

const labelClass = 'flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest';
const inputClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none';

const RentabilidadeFiltersCard: React.FC<RentabilidadeFiltersCardProps> = ({ units, filtros, onChangeFiltros }) => {
  const limparFiltros = () => onChangeFiltros(getFiltrosDefault(units.length === 1 ? units[0].id : null));

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
            <i className="fa-solid fa-chart-pie text-2xl"></i>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">Rentabilidade</h2>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest truncate">Markup e margem de lucro por serviço</p>
          </div>
        </div>
        <button
          onClick={limparFiltros}
          className="text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest shrink-0"
        >
          Limpar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-calendar-day text-[9px]"></i> Início do período</span>
          <input
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-calendar-check text-[9px]"></i> Fim do período</span>
          <input
            type="date"
            value={filtros.dataFim}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataFim: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-store text-[9px]"></i> Unidade</span>
          <select
            value={filtros.unidadeId ?? 'todas'}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))}
            className={inputClass}
          >
            <option value="todas">Todas</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default RentabilidadeFiltersCard;
