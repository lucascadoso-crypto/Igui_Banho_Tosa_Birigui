import React from 'react';
import { Unit } from '../../types';
import { TransporteFiltro } from '../../services/dashboardGerencial';
import { FinanceiroFiltros, FORMAS_PAGAMENTO_OPCOES, LinhaServicoFiltro, getFiltrosDefault } from '../../services/financeiroGeral';

interface FinanceiroFiltersCardProps {
  units: Unit[];
  filtros: FinanceiroFiltros;
  onChangeFiltros: React.Dispatch<React.SetStateAction<FinanceiroFiltros>>;
}

const LINHA_SERVICO_OPCOES: { value: LinhaServicoFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos os Serviços' },
  { value: 'banho', label: 'Banho' },
  { value: 'tosa', label: 'Tosa' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'adicional', label: 'Serviços Adicionais' },
  { value: 'outro', label: 'Outros' }
];

const selectClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none';
const labelClass = 'flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest';

const FinanceiroFiltersCard: React.FC<FinanceiroFiltersCardProps> = ({ units, filtros, onChangeFiltros }) => {
  const limparFiltros = () => onChangeFiltros(getFiltrosDefault(units.length === 1 ? units[0].id : null));

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wide">
          <i className="fa-solid fa-filter text-violet-600"></i> Filtros Operacionais Ativos
        </span>
        <button
          onClick={limparFiltros}
          className="text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest"
        >
          Limpar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-calendar-day text-[9px]"></i> Início do período</span>
          <input
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
            className={selectClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-calendar-check text-[9px]"></i> Fim do período</span>
          <input
            type="date"
            value={filtros.dataFim}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataFim: e.target.value }))}
            className={selectClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-store text-[9px]"></i> Unidade Organizacional</span>
          <select
            value={filtros.unidadeId ?? 'todas'}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))}
            className={selectClass}
          >
            <option value="todas">Todas as Unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-money-bill-wave text-[9px]"></i> Forma de Pagamento</span>
          <select
            value={filtros.formaPagamento}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, formaPagamento: e.target.value }))}
            className={selectClass}
          >
            <option value="todas">Todas as Formas</option>
            {FORMAS_PAGAMENTO_OPCOES.map((forma) => (
              <option key={forma} value={forma}>{forma}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-shower text-[9px]"></i> Linha de Serviço</span>
          <select
            value={filtros.linhaServico}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, linhaServico: e.target.value as LinhaServicoFiltro }))}
            className={selectClass}
          >
            {LINHA_SERVICO_OPCOES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}><i className="fa-solid fa-taxi text-[9px]"></i> Transporte / Táxi Dog</span>
          <select
            value={filtros.transporte}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, transporte: e.target.value as TransporteFiltro }))}
            className={selectClass}
          >
            <option value="todos">Com ou Sem Táxi</option>
            <option value="com">Com serviço de táxi</option>
            <option value="sem">Sem serviço de táxi</option>
          </select>
        </label>
      </div>
    </div>
  );
};

export default FinanceiroFiltersCard;
