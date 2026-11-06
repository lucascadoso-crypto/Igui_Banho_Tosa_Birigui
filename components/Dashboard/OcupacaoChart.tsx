
import React from 'react';
import { OcupacaoDiaSemana, faixaOcupacao } from '../../services/dashboardGerencial';

interface OcupacaoChartProps {
  data: OcupacaoDiaSemana[];
}

const DIA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const FAIXA_COR: Record<string, string> = {
  ocioso: '#38BDF8',
  normal: '#10B981',
  lotado: '#F43F5E'
};

const OcupacaoChart: React.FC<OcupacaoChartProps> = ({ data }) => {
  if (!data.length || data.every((d) => d.capacidadeTotal === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-300">
        <i className="fa-solid fa-chart-simple text-5xl mb-3 opacity-30"></i>
        <p className="font-bold text-sm text-center">Capacidade não configurada para o período.<br/>Configure em Configurações → Capacidade.</p>
      </div>
    );
  }

  const ordenado = [...data].sort((a, b) => a.diaSemana - b.diaSemana);

  const width = 320;
  const height = 220;
  const padTop = 12;
  const padBottom = 34;
  const padSide = 30;
  const chartH = height - padTop - padBottom;
  const chartW = width - padSide;

  const max = 100;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const barGap = 0.4;
  const barSlot = chartW / ordenado.length;
  const barWidth = Math.min(40, barSlot * (1 - barGap));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {gridLines.map((g) => {
          const y = padTop + chartH - g * chartH;
          return (
            <g key={g}>
              <line x1={padSide} x2={width} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 4" />
              <text x={0} y={y + 3} fontSize={10} fill="#94a3b8" fontWeight={700}>{Math.round(max * g)}%</text>
            </g>
          );
        })}

        {ordenado.map((d, idx) => {
          const faixa = faixaOcupacao(d.percentual);
          const barH = (Math.min(d.percentual, 100) / max) * chartH;
          const x = padSide + idx * barSlot + (barSlot - barWidth) / 2;
          const y = padTop + chartH - barH;
          return (
            <g key={d.diaSemana}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barH, 2)} rx={8} fill={FAIXA_COR[faixa]} />
              <text x={x + barWidth / 2} y={height - 8} fontSize={9} fill="#94a3b8" textAnchor="middle" fontWeight={700}>
                {DIA_LABEL[d.diaSemana]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
        {Object.entries(FAIXA_COR).map(([faixa, cor]) => (
          <div key={faixa} className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }}></span>
            <span>{faixa === 'ocioso' ? 'Ocioso (<50%)' : faixa === 'normal' ? 'Normal (50-85%)' : 'Lotado (>85%)'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OcupacaoChart;
