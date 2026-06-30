
import React from 'react';
import { Unit } from '../types';
import { useDashboardData } from '../hooks/useDashboardData';
import { formatCurrencyBR } from '../services/appointmentTotals';
import AlertBar from './Dashboard/AlertBar';
import KPICard from './Dashboard/KPICard';
import QuickActionButtons, { QuickAction } from './Dashboard/QuickActionButtons';
import RevenueChart from './Dashboard/RevenueChart';

interface PainelGeralProps {
  units: Unit[];
  supabaseClient: any;
}

const PainelGeral: React.FC<PainelGeralProps> = ({ units, supabaseClient }) => {
  const { kpis, alerts, isLoading, error, refetch } = useDashboardData(units, supabaseClient);
  const [dismissedAlerts, setDismissedAlerts] = React.useState<string[]>([]);

  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.includes(alert.id));

  const quickActions: QuickAction[] = [
    { id: 'novo-agendamento', label: 'Novo Agendamento', icon: 'fa-calendar-plus', color: 'amber', onClick: () => {} },
    { id: 'receber', label: 'Receber Pagamento', icon: 'fa-money-bill-wave', color: 'emerald', onClick: () => {} },
    { id: 'renovar', label: 'Renovar Pacote', icon: 'fa-rotate', color: 'indigo', onClick: () => {} }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-slate-900 text-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
            <i className="fa-solid fa-chart-line"></i>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Painel Operacional</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Visão geral da rede em tempo real</p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center justify-center space-x-2 bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md disabled:opacity-60"
        >
          <i className={`fa-solid fa-rotate ${isLoading ? 'fa-spin' : ''}`}></i>
          <span>Atualizar</span>
        </button>
      </header>

      {error && (
        <AlertBar
          type="error"
          message="O sistema encontrou um problema ao buscar os dados da rede."
          action={{ label: 'Tentar Reconectar', onClick: refetch }}
        />
      )}

      {visibleAlerts.map(alert => (
        <AlertBar
          key={alert.id}
          type={alert.type}
          message={alert.message}
          dismissible
          onClose={() => setDismissedAlerts(prev => [...prev, alert.id])}
        />
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          label="Receita"
          value={formatCurrencyBR(kpis.receita)}
          icon="fa-sack-dollar"
          color="emerald"
          loading={isLoading}
        />
        <KPICard
          label="Despesa"
          value={formatCurrencyBR(kpis.despesa)}
          icon="fa-receipt"
          color="rose"
          loading={isLoading}
        />
        <KPICard
          label="Saldo"
          value={formatCurrencyBR(kpis.saldo)}
          icon="fa-scale-balanced"
          color={kpis.saldo >= 0 ? 'indigo' : 'rose'}
          loading={isLoading}
        />
        <KPICard
          label="Agendamentos"
          value={kpis.agendamentos}
          icon="fa-calendar-check"
          color="amber"
          subtext="Últimos 7 dias"
          loading={isLoading}
        />
      </div>

      <QuickActionButtons actions={quickActions} columns={3} />

      <RevenueChart data={kpis.chartData} type="line" loading={isLoading} title="Receita vs Despesa (últimos 7 dias)" />

      <footer className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
        Última atualização: {new Date().toLocaleString('pt-BR')}
      </footer>
    </div>
  );
};

export default PainelGeral;
