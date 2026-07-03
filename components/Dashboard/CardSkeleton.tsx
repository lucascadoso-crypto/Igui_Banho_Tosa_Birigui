import React from 'react';

export const CardSkeleton: React.FC<{ height?: number }> = ({ height = 280 }) => (
  <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-100 animate-pulse" style={{ minHeight: height }}>
    <div className="h-4 w-1/3 bg-slate-100 rounded mb-6"></div>
    <div className="h-full w-full bg-slate-50 rounded-xl"></div>
  </div>
);

export default CardSkeleton;
