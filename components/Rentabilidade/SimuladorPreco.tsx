import React, { useMemo, useState } from 'react';
import { formatCurrencyBR, formatDecimalBR } from '../../services/appointmentTotals';
import {
  RentabilidadeServico,
  RentabilidadeThresholds,
  calcularMargemPct,
  calcularMarkup,
  sugerirPrecoPorMargem,
  classificarMargem
} from '../../services/rentabilidade';
import SectionTitle from '../Dashboard/SectionTitle';
import MargemBadge from './MargemBadge';
import { compareNomePtBr } from '../../services/sorting';

interface SimuladorPrecoProps {
  servicos: RentabilidadeServico[];
  thresholds: RentabilidadeThresholds;
}

const SimuladorPreco: React.FC<SimuladorPrecoProps> = ({ servicos, thresholds }) => {
  const opcoes = useMemo(() => (
    servicos.map((s) => ({ id: `s-${s.servicoId}`, nome: s.servico, custo: s.custoMedio })).sort(compareNomePtBr)
  ), [servicos]);

  const [selectedId, setSelectedId] = useState<string>('');
  const [precoTeste, setPrecoTeste] = useState<string>('');
  const [margemDesejada, setMargemDesejada] = useState<string>('');

  const selected = opcoes.find((o) => o.id === selectedId) || null;
  const custo = selected?.custo ?? 0;

  const preco = Number(precoTeste) || 0;
  const margemPct = preco > 0 ? calcularMargemPct(preco, custo) : 0;
  const markup = preco > 0 ? calcularMarkup(preco, custo) : 0;
  const lucroPorUnidade = preco > 0 ? preco - custo : 0;
  const toneTeste = preco > 0 ? classificarMargem(margemPct, thresholds) : null;

  const margemDesejadaNum = Number(margemDesejada) || 0;
  const precoSugerido = margemDesejada !== '' && custo > 0 ? sugerirPrecoPorMargem(custo, margemDesejadaNum) : null;
  const lucroSugerido = precoSugerido !== null && Number.isFinite(precoSugerido) ? precoSugerido - custo : null;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
      <SectionTitle title="Simulador de Preço" subtitle="Teste um preço novo antes de aplicar — nada aqui é salvo" />

      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-[11px] font-bold text-violet-700 leading-relaxed">
        <i className="fa-solid fa-circle-info mr-1.5"></i>
        Markup = preço ÷ custo. Margem = (preço − custo) ÷ preço × 100.
      </div>

      <label className="space-y-1.5 block">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviço</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
        >
          <option value="">Selecione...</option>
          {opcoes.length === 0 && <option disabled>Nenhum serviço com dados no período</option>}
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>{o.nome}</option>
          ))}
        </select>
      </label>

      {selected && (
        <>
          <div className="bg-slate-50 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo atual</p>
            <p className="text-xl font-black text-rose-600">{formatCurrencyBR(custo)}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Preço de teste -> margem/markup */}
            <div className="border border-slate-100 rounded-2xl p-5 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de teste → margem</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">R$</span>
                <input
                  type="number" min={0} step="0.01"
                  value={precoTeste}
                  onChange={(e) => setPrecoTeste(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                />
              </div>
              {preco > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Margem</span>
                    {toneTeste && <MargemBadge margemPct={margemPct} tone={toneTeste} />}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Markup</span>
                    <span className="text-sm font-black text-slate-800">{formatDecimalBR(markup, 2)}x</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Lucro por unidade</span>
                    <span className={`text-sm font-black ${lucroPorUnidade >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyBR(lucroPorUnidade)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Margem desejada -> preço sugerido */}
            <div className="border border-slate-100 rounded-2xl p-5 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margem desejada → preço sugerido</p>
              <div className="relative">
                <input
                  type="number" min={0} max={99} step="1"
                  value={margemDesejada}
                  onChange={(e) => setMargemDesejada(e.target.value)}
                  placeholder="0"
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
              </div>
              {precoSugerido !== null && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Preço sugerido</span>
                    <span className="text-sm font-black text-violet-700">
                      {Number.isFinite(precoSugerido) ? formatCurrencyBR(precoSugerido) : 'Margem inválida'}
                    </span>
                  </div>
                  {Number.isFinite(precoSugerido) && lucroSugerido !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Lucro por unidade</span>
                      <span className="text-sm font-black text-emerald-600">{formatCurrencyBR(lucroSugerido)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SimuladorPreco;
