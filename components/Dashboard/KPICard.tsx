
import React from 'react';
import { formatDecimalBR } from '../../services/appointmentTotals';

export type KPICardColor = 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'blue' | 'purple' | 'orange';

export interface KPICardTrend {
  value: number;
  label?: string;
  direction?: 'up' | 'down' | 'neutral';
}

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: string;
  color?: KPICardColor;
  trend?: KPICardTrend;
  onClick?: () => void;
  loading?: boolean;
  fullWidth?: boolean;
}

const getValueFontSizeClass = (value: string | number) => {
  const length = String(value).length;
  if (length > 14) return 'text-lg sm:text-xl';
  if (length > 11) return 'text-xl sm:text-2xl';
  if (length > 8) return 'text-2xl sm:text-3xl';
  return 'text-3xl sm:text-4xl';
};

const colorClasses: Record<KPICardColor, { bg: string; text: string; ring: string }> = {
  slate: { bg: 'bg-slate-50', text: 'text-slate-500', ring: 'group-hover:border-slate-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-500', ring: 'group-hover:border-amber-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500', ring: 'group-hover:border-emerald-100' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-500', ring: 'group-hover:border-rose-100' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500', ring: 'group-hover:border-indigo-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-500', ring: 'group-hover:border-blue-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-500', ring: 'group-hover:border-purple-100' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-500', ring: 'group-hover:border-orange-100' }
};

const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  subtext,
  icon = 'fa-chart-simple',
  color = 'slate',
  trend,
  onClick,
  loading = false,
  fullWidth = false
}) => {
  const palette = colorClasses[color];
  const trendDirection = trend?.direction ?? (trend && trend.value > 0 ? 'up' : trend && trend.value < 0 ? 'down' : 'neutral');
  const trendColor = trendDirection === 'up' ? 'text-emerald-500' : trendDirection === 'down' ? 'text-rose-500' : 'text-slate-400';
  const trendIcon = trendDirection === 'up' ? 'fa-arrow-trend-up' : trendDirection === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-100 transition-all group ${palette.ring} ${
        onClick ? 'cursor-pointer hover:shadow-xl' : ''
      } ${fullWidth ? 'col-span-full' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">{label}</p>
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-base shrink-0 ${palette.bg} ${palette.text}`}>
          <i className={`fa-solid ${icon}`}></i>
        </div>
      </div>

      {loading ? (
        <div className="h-9 w-2/3 bg-slate-100 rounded-lg animate-pulse"></div>
      ) : (
        <p className={`font-black text-slate-900 tracking-tighter leading-tight break-words ${getValueFontSizeClass(value)}`}>{value}</p>
      )}
      {subtext && !loading && <p className="text-xs font-bold text-slate-400 mt-2">{subtext}</p>}
      {trend && !loading && (
        <div className={`flex items-center gap-1.5 text-[11px] font-bold mt-3 ${trendColor}`}>
          <i className={`fa-solid ${trendIcon} text-[10px]`}></i>
          <span>{formatDecimalBR(Math.abs(trend.value))}%{trend.label ? ` ${trend.label}` : ''}</span>
        </div>
      )}
    </div>
  );
};

export default KPICard;
