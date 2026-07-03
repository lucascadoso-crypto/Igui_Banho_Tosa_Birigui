import React from 'react';
import { formatDecimalBR } from '../../services/appointmentTotals';

export type FinanceKpiBarColor = 'purple' | 'green' | 'orange' | 'red';

interface FinanceKpiCardTrend {
  value: number;
  direction: 'up' | 'down';
}

interface FinanceKpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  subtextTone?: 'default' | 'red';
  icon: string;
  barColor: FinanceKpiBarColor;
  valueTone?: 'default' | 'red' | 'green';
  trend?: FinanceKpiCardTrend;
  loading?: boolean;
}

const getValueFontSizeClass = (value: string | number) => {
  const length = String(value).length;
  if (length > 14) return 'text-lg sm:text-xl';
  if (length > 11) return 'text-xl sm:text-2xl';
  if (length > 8) return 'text-2xl sm:text-3xl';
  return 'text-3xl sm:text-4xl';
};

const barColorClasses: Record<FinanceKpiBarColor, string> = {
  purple: 'bg-violet-500',
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-rose-500'
};

const iconBgClasses: Record<FinanceKpiBarColor, string> = {
  purple: 'bg-violet-50 text-violet-500',
  green: 'bg-emerald-50 text-emerald-500',
  orange: 'bg-amber-50 text-amber-500',
  red: 'bg-rose-50 text-rose-500'
};

const valueToneClasses: Record<'default' | 'red' | 'green', string> = {
  default: 'text-slate-900',
  red: 'text-rose-600',
  green: 'text-emerald-600'
};

const FinanceKpiCard: React.FC<FinanceKpiCardProps> = ({
  label,
  value,
  subtext,
  subtextTone = 'default',
  icon,
  barColor,
  valueTone = 'default',
  trend,
  loading = false
}) => {
  const trendColor = trend ? (trend.direction === 'up' ? 'text-emerald-500' : 'text-rose-500') : '';
  const trendIcon = trend?.direction === 'up' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

  return (
    <div className="relative bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-hidden">
      <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${barColorClasses[barColor]}`}></div>

      <div className="flex items-start justify-between gap-3 mb-4 pr-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">{label}</p>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm shrink-0 ${iconBgClasses[barColor]}`}>
          <i className={`fa-solid ${icon}`}></i>
        </div>
      </div>

      {loading ? (
        <div className="h-9 w-2/3 bg-slate-100 rounded-lg animate-pulse"></div>
      ) : (
        <p className={`font-black tracking-tighter leading-tight break-words pr-2 ${getValueFontSizeClass(value)} ${valueToneClasses[valueTone]}`}>{value}</p>
      )}

      {!loading && trend && (
        <div className={`flex items-center gap-1.5 text-[11px] font-bold mt-3 ${trendColor}`}>
          <i className={`fa-solid ${trendIcon} text-[10px]`}></i>
          <span>{formatDecimalBR(Math.abs(trend.value))}% vs período anterior</span>
        </div>
      )}

      {!loading && !trend && subtext && (
        <p className={`text-xs font-bold mt-3 ${subtextTone === 'red' ? 'text-rose-500' : 'text-slate-400'}`}>{subtext}</p>
      )}
    </div>
  );
};

export default FinanceKpiCard;
