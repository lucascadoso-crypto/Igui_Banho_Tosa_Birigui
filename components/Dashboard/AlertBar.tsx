
import React from 'react';

export type AlertBarType = 'info' | 'warning' | 'error' | 'success';

export interface AlertBarAction {
  label: string;
  onClick: () => void;
}

interface AlertBarProps {
  type?: AlertBarType;
  message: string;
  action?: AlertBarAction;
  onAction?: () => void;
  onClose?: () => void;
  dismissible?: boolean;
  icon?: string;
}

const typeStyles: Record<AlertBarType, { bg: string; border: string; text: string; sub: string; iconBg: string; defaultIcon: string }> = {
  info: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-800', sub: 'text-indigo-500', iconBg: 'bg-indigo-500', defaultIcon: 'fa-circle-info' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-800', sub: 'text-amber-500', iconBg: 'bg-amber-500', defaultIcon: 'fa-triangle-exclamation' },
  error: { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-800', sub: 'text-rose-500', iconBg: 'bg-rose-500', defaultIcon: 'fa-exclamation-triangle' },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800', sub: 'text-emerald-500', iconBg: 'bg-emerald-500', defaultIcon: 'fa-circle-check' }
};

const AlertBar: React.FC<AlertBarProps> = ({
  type = 'info',
  message,
  action,
  onAction,
  onClose,
  dismissible = true,
  icon
}) => {
  const palette = typeStyles[type];
  const resolvedAction = action ?? (onAction ? { label: 'Ver mais', onClick: onAction } : undefined);

  return (
    <div className={`${palette.bg} border ${palette.border} p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
      <div className="flex items-center space-x-4">
        <div className={`w-10 h-10 ${palette.iconBg} text-white rounded-full flex items-center justify-center shadow-lg shrink-0`}>
          <i className={`fa-solid ${icon || palette.defaultIcon}`}></i>
        </div>
        <p className={`text-xs sm:text-sm font-bold ${palette.text}`}>{message}</p>
      </div>

      <div className="flex items-center space-x-3 shrink-0">
        {resolvedAction && (
          <button
            onClick={resolvedAction.onClick}
            className={`${palette.iconBg} text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md`}
          >
            {resolvedAction.label}
          </button>
        )}
        {dismissible && onClose && (
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${palette.text} hover:bg-white/60 transition-all`}
            aria-label="Fechar alerta"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default AlertBar;
