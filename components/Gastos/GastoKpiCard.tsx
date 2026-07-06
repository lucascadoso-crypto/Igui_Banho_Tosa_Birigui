import React from 'react';
import { formatDecimalBR } from '../../services/appointmentTotals';

interface GastoKpiCardTrend {
  value: number;
  aumentou: boolean; // aumentou = ruim (vermelho); caiu = bom (verde)
}

interface GastoKpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  loading?: boolean;
  trend?: GastoKpiCardTrend;
}

const getValueFontSizeClass = (value: string | number) => {
  const length = String(value).length;
  if (length > 14) return 'text-lg sm:text-xl';
  if (length > 11) return 'text-xl sm:text-2xl';
  if (length > 8) return 'text-2xl sm:text-3xl';
  return 'text-3xl sm:text-4xl';
};

const GastoKpiCard: React.FC<GastoKpiCardProps> = ({ label, value, icon, loading = false, trend }) => {
  const trendColor = trend ? (trend.aumentou ? 'text-rose-500' : 'text-emerald-500') : '';
  const trendIcon = trend ? (trend.aumentou ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down') : '';

  return (
    <div className="relative bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">{label}</p>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm shrink-0 bg-slate-50 text-slate-500">
          <i className={`fa-solid ${icon}`}></i>
        </div>
      </div>

      {loading ? (
        <div className="h-9 w-2/3 bg-slate-100 rounded-lg animate-pulse"></div>
      ) : (
        <p className={`font-black tracking-tighter leading-tight break-words ${getValueFontSizeClass(value)} text-slate-900`}>{value}</p>
      )}

      {!loading && trend && (
        <div className={`flex items-center gap-1.5 text-[11px] font-bold mt-3 ${trendColor}`}>
          <i className={`fa-solid ${trendIcon} text-[10px]`}></i>
          <span>{formatDecimalBR(trend.value)}% vs mês anterior</span>
        </div>
      )}
    </div>
  );
};

export default GastoKpiCard;
