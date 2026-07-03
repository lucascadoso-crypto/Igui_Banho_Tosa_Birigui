
import React from 'react';
import { Unit, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardFiltros, TransporteFiltro } from '../../services/dashboardGerencial';

interface DashboardHeaderProps {
  units: Unit[];
  filtros: DashboardFiltros;
  onChangeFiltros: React.Dispatch<React.SetStateAction<DashboardFiltros>>;
  onOpenCostModal: () => void;
}

const ROLE_LABEL: Record<UserRole, string> = {
  master: 'MASTER',
  financeiro: 'FINANCEIRO',
  admin_unidade: 'ADMIN UNIDADE',
  administrador: 'ADMIN UNIDADE',
  gerente: 'GERENTE',
  atendente: 'COLABORADOR',
  tosador: 'COLABORADOR',
  somente_leitura: 'COLABORADOR',
  comum: 'COLABORADOR'
};

const getInitials = (nome?: string) => {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ units, filtros, onChangeFiltros, onOpenCostModal }) => {
  const { userProfile, userRole } = useAuth();
  const roleLabel = ROLE_LABEL[userRole] || 'COLABORADOR';
  const acessoConsolidado = userRole === 'master' || userRole === 'financeiro';
  const nome = userProfile?.nome || 'Usuário';

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
            <i className="fa-solid fa-gauge-high text-2xl"></i>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">Dashboard</h2>
              <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest">{roleLabel}</span>
            </div>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest truncate">Igui Banho &amp; Tosa • Relatório consolidado de unidades</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenCostModal}
            title="Configurar custos de serviço"
            className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <i className="fa-solid fa-sliders"></i>
          </button>
          <div className="text-right">
            <p className="text-sm font-black text-slate-900 leading-tight">{nome}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {acessoConsolidado ? `Acesso ${roleLabel.toLowerCase()} global` : `Acesso ${roleLabel.toLowerCase()} da unidade`}
            </p>
          </div>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-lg shadow-violet-500/20">
            {getInitials(nome)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-calendar-day text-[9px]"></i> Início do período
          </span>
          <input
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-calendar-check text-[9px]"></i> Fim do período
          </span>
          <input
            type="date"
            value={filtros.dataFim}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, dataFim: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-store text-[9px]"></i> Unidade selecionada
          </span>
          <select
            value={filtros.unidadeId ?? 'todas'}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
          >
            <option value="todas">Todas</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i className="fa-solid fa-taxi text-[9px]"></i> Filtro de transporte (táxi)
          </span>
          <select
            value={filtros.transporte}
            onChange={(e) => onChangeFiltros((f) => ({ ...f, transporte: e.target.value as TransporteFiltro }))}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
          >
            <option value="todos">Todos</option>
            <option value="com">Com serviço de táxi</option>
            <option value="sem">Sem serviço de táxi</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Sincronizado em tempo real com Supabase
        </div>
        <span className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest">
          {acessoConsolidado ? `Acesso ${roleLabel.toLowerCase()} consolidado` : 'Acesso restrito à unidade'}
        </span>
      </div>
    </div>
  );
};

export default DashboardHeader;
