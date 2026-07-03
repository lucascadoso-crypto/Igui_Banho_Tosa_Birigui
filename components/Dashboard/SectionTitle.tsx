import React from 'react';

export const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-2">
    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide leading-tight">{title}</h3>
    {subtitle && <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{subtitle}</p>}
  </div>
);

export default SectionTitle;
