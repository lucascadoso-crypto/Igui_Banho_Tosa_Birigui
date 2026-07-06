import React from 'react';
import { MargemTone } from '../../services/rentabilidade';
import { formatDecimalBR } from '../../services/appointmentTotals';

const TONE_CLASSES: Record<MargemTone, string> = {
  verde: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amarelo: 'bg-amber-50 text-amber-700 border-amber-100',
  vermelho: 'bg-rose-50 text-rose-700 border-rose-100'
};

const TONE_DOT: Record<MargemTone, string> = {
  verde: 'bg-emerald-500',
  amarelo: 'bg-amber-500',
  vermelho: 'bg-rose-500'
};

interface MargemBadgeProps {
  margemPct: number;
  tone: MargemTone;
}

const MargemBadge: React.FC<MargemBadgeProps> = ({ margemPct, tone }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black whitespace-nowrap ${TONE_CLASSES[tone]}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`}></span>
    {formatDecimalBR(margemPct)}%
  </span>
);

export default MargemBadge;
