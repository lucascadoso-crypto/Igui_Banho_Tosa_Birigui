
import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { formatCurrencyBR } from '../../services/appointmentTotals';

export interface RevenueChartPoint {
  date: string;
  receita: number;
  despesa: number;
  liquido: number;
}

interface RevenueChartProps {
  data: RevenueChartPoint[];
  type?: 'line' | 'bar';
  height?: number;
  title?: string;
  loading?: boolean;
  showLegend?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 px-4 py-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between space-x-6 text-xs font-bold">
          <span className="flex items-center space-x-2" style={{ color: entry.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="capitalize">{entry.name}</span>
          </span>
          <span className="text-slate-700">{formatCurrencyBR(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const RevenueChart: React.FC<RevenueChartProps> = ({
  data,
  type = 'line',
  height = 320,
  title = 'Receita vs Despesa',
  loading = false,
  showLegend = true
}) => {
  const hasData = data.length > 0 && data.some(d => d.receita > 0 || d.despesa > 0);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-black text-slate-800">{title}</h3>
        {showLegend && (
          <div className="flex space-x-4">
            <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div> Receita
            </div>
            <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase">
              <div className="w-2 h-2 bg-rose-500 rounded-full mr-2"></div> Despesa
            </div>
            <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase">
              <div className="w-2 h-2 bg-amber-500 rounded-full mr-2"></div> Líquido
            </div>
          </div>
        )}
      </div>

      <div className="w-full relative" style={{ height }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-slate-300"></i>
          </div>
        ) : !hasData ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
            <i className="fa-solid fa-chart-simple text-6xl mb-4 opacity-20"></i>
            <p className="font-bold text-sm">Sem dados financeiros para exibir.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={height}>
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[8, 8, 0, 0]} />
                <Bar dataKey="liquido" name="Líquido" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="receita" name="Receita" stroke="#10b981" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#ef4444" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="liquido" name="Líquido" stroke="#f59e0b" strokeWidth={3} dot={false} strokeDasharray="4 4" />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;
