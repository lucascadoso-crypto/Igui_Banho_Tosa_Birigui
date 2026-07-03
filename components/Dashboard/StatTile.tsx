import React from 'react';

export const StatTile: React.FC<{ label: string; value: React.ReactNode; tone?: 'neutral' | 'rose' | 'violet' }> = ({ label, value, tone = 'neutral' }) => (
  <div className="bg-slate-50 rounded-2xl p-5">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-xl font-black ${tone === 'rose' ? 'text-rose-600' : tone === 'violet' ? 'text-violet-600' : 'text-slate-800'}`}>{value}</p>
  </div>
);

export default StatTile;
