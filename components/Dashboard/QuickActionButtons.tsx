
import React from 'react';

export interface QuickAction {
  id: string | number;
  label: string;
  icon: string;
  onClick: () => void;
  badge?: string | number;
  loading?: boolean;
  color?: 'slate' | 'amber' | 'emerald' | 'rose' | 'indigo';
}

interface QuickActionButtonsProps {
  actions: QuickAction[];
  layout?: 'grid' | 'row';
  columns?: number;
}

const colorClasses: Record<NonNullable<QuickAction['color']>, string> = {
  slate: 'bg-slate-900 hover:bg-slate-800',
  amber: 'bg-amber-500 hover:bg-amber-600',
  emerald: 'bg-emerald-500 hover:bg-emerald-600',
  rose: 'bg-rose-500 hover:bg-rose-600',
  indigo: 'bg-indigo-500 hover:bg-indigo-600'
};

const gridColsClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
};

const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({ actions, layout = 'grid', columns = 3 }) => {
  const containerClass =
    layout === 'row' ? 'flex flex-wrap gap-4' : `grid ${gridColsClasses[columns] || gridColsClasses[3]} gap-4`;

  return (
    <div className={containerClass}>
      {actions.map(action => (
        <button
          key={action.id}
          onClick={action.onClick}
          disabled={action.loading}
          className={`relative flex items-center justify-center sm:justify-start space-x-3 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            colorClasses[action.color || 'slate']
          } ${layout === 'row' ? '' : 'w-full'}`}
        >
          {action.loading ? (
            <i className="fa-solid fa-circle-notch fa-spin"></i>
          ) : (
            <i className={`fa-solid ${action.icon}`}></i>
          )}
          <span>{action.label}</span>
          {action.badge !== undefined && !action.loading && (
            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-md">
              {action.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export default QuickActionButtons;
