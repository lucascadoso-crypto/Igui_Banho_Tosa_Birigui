import React from 'react';
import { LinhaServicoValor } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';

interface ServiceTypeBarChartProps {
  data: LinhaServicoValor[];
}

const LINHA_LABEL: Record<string, string> = {
  banho: 'Banho',
  tosa: 'Tosa',
  pacote: 'Pacote',
  adicional: 'Serv. Adicionais',
  transporte: 'Transporte'
};

const LINHA_COR: Record<string, string> = {
  banho: '#0EA5E9',
  tosa: '#F59E0B',
  pacote: '#7C3AED',
  adicional: '#10B981',
  transporte: '#EC4899'
};

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const ServiceTypeBarChart: React.FC<ServiceTypeBarChartProps> = ({ data }) => {
  if (!data.length || data.every((d) => d.valor === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-bar text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm">Sem faturamento no período.</p>
      </div>
    );
  }

  const width = 420;
  // Margem esquerda larga o suficiente para caber "Serv. Adicionais" por completo,
  // sem cortar o rótulo (bug visto na referência: "Serv. dicionais"/"ansporte").
  const padLeft = 108;
  const padRight = 16;
  // Coluna de valor reservada à direita da trilha da barra (posição fixa, não depende
  // do comprimento da barra) para o texto do valor nunca vazar do viewBox/card.
  const valorColW = 78;
  const rowH = 40;
  const height = data.length * rowH + 12;
  const trackW = width - padLeft - padRight - valorColW;

  const max = niceMax(Math.max(...data.map((d) => d.valor), 1));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {data.map((d, idx) => {
          const y = idx * rowH;
          const barW = Math.max((d.valor / max) * trackW, d.valor > 0 ? 3 : 0);
          const cor = LINHA_COR[d.linha] || '#94A3B8';
          const label = LINHA_LABEL[d.linha] || d.linha;
          return (
            <g key={d.linha}>
              <text
                x={padLeft - 10}
                y={y + rowH / 2 + 4}
                fontSize={11}
                fill="#475569"
                fontWeight={700}
                textAnchor="end"
              >
                {label}
              </text>
              <rect x={padLeft} y={y + 8} width={trackW} height={rowH - 16} rx={8} fill="#F1F5F9" />
              <rect x={padLeft} y={y + 8} width={barW} height={rowH - 16} rx={8} fill={cor} />
              <text
                x={padLeft + trackW + 8}
                y={y + rowH / 2 + 4}
                fontSize={10}
                fill="#1e293b"
                fontWeight={800}
              >
                {formatCurrencyBR(d.valor)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ServiceTypeBarChart;
