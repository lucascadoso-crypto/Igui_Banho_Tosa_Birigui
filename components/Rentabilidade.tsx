import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Unit } from '../types';
import { formatCurrencyBR, formatDecimalBR } from '../services/appointmentTotals';
import {
  RentabilidadeFiltros,
  RentabilidadeResumo,
  RentabilidadeServico,
  RentabilidadePacote,
  RentabilidadeThresholds,
  getFiltrosDefault,
  fetchRentabilidadeResumo,
  fetchRentabilidadeServicos,
  fetchRentabilidadePacotes,
  fetchRentabilidadeThresholds,
  classificarMargem
} from '../services/rentabilidade';
import KPICard from './Dashboard/KPICard';
import SectionTitle from './Dashboard/SectionTitle';
import CardSkeleton from './Dashboard/CardSkeleton';
import { thClass, thClassRight } from './Dashboard/tableClasses';
import RentabilidadeFiltersCard from './Rentabilidade/RentabilidadeFiltersCard';
import MargemBadge from './Rentabilidade/MargemBadge';
import SimuladorPreco from './Rentabilidade/SimuladorPreco';

interface RentabilidadeProps {
  units: Unit[];
  supabaseClient: any;
}

type SortDir = 'asc' | 'desc';

function useSort<T extends Record<string, any>>(data: T[], defaultKey: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av) || 0;
      const bn = Number(bv) || 0;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}

const SortableTh: React.FC<{ label: string; sortKey: string; activeKey: string; dir: SortDir; onClick: (k: any) => void; align?: 'left' | 'right' }> = ({
  label, sortKey, activeKey, dir, onClick, align = 'right'
}) => (
  <th className={align === 'right' ? thClassRight : thClass}>
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 ${align === 'right' ? 'ml-auto' : ''} hover:text-slate-600 transition-colors`}
    >
      {label}
      {activeKey === sortKey && <i className={`fa-solid ${dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'} text-[8px]`}></i>}
    </button>
  </th>
);

const Rentabilidade: React.FC<RentabilidadeProps> = ({ units, supabaseClient }) => {
  const [filtros, setFiltros] = useState<RentabilidadeFiltros>(() => getFiltrosDefault(units.length === 1 ? units[0].id : null));

  const [resumo, setResumo] = useState<RentabilidadeResumo | null>(null);
  const [resumoLoading, setResumoLoading] = useState(true);
  const [resumoError, setResumoError] = useState<string | null>(null);

  const [servicos, setServicos] = useState<RentabilidadeServico[]>([]);
  const [servicosLoading, setServicosLoading] = useState(true);

  const [pacotes, setPacotes] = useState<RentabilidadePacote[]>([]);
  const [pacotesLoading, setPacotesLoading] = useState(true);

  const [thresholds, setThresholds] = useState<RentabilidadeThresholds>({ margemVerdeMin: 60, margemAmarelaMin: 30 });

  const carregarTudo = useCallback(() => {
    setResumoLoading(true);
    setResumoError(null);
    fetchRentabilidadeResumo(supabaseClient, filtros)
      .then(setResumo)
      .catch((err) => { console.error('Erro ao carregar resumo de rentabilidade:', err); setResumoError(err?.message || 'Falha ao carregar resumo.'); })
      .finally(() => setResumoLoading(false));

    setServicosLoading(true);
    fetchRentabilidadeServicos(supabaseClient, filtros)
      .then(setServicos)
      .catch((err) => console.error('Erro ao carregar rentabilidade por serviço:', err))
      .finally(() => setServicosLoading(false));

    setPacotesLoading(true);
    fetchRentabilidadePacotes(supabaseClient, filtros)
      .then(setPacotes)
      .catch((err) => console.error('Erro ao carregar rentabilidade por pacote:', err))
      .finally(() => setPacotesLoading(false));

    fetchRentabilidadeThresholds(supabaseClient)
      .then(setThresholds)
      .catch((err) => console.error('Erro ao carregar thresholds de margem:', err));
  }, [supabaseClient, filtros]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const servicosSort = useSort<RentabilidadeServico>(servicos, 'lucroTotal');
  const pacotesSort = useSort<RentabilidadePacote>(pacotes, 'lucroTotal');

  const alertasServicos = servicos
    .filter((s) => s.margemPct < thresholds.margemAmarelaMin)
    .map((s) => ({ nome: s.servico, margemPct: s.margemPct, lucroTotal: s.lucroTotal, tipo: 'Serviço' as const }));
  const alertasPacotes = pacotes
    .filter((p) => p.margemPct < thresholds.margemAmarelaMin)
    .map((p) => ({ nome: p.pacoteNome, margemPct: p.margemPct, lucroTotal: p.lucroTotal, tipo: 'Pacote' as const }));
  const alertas = [...alertasServicos, ...alertasPacotes].sort((a, b) => a.margemPct - b.margemPct);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <RentabilidadeFiltersCard units={units} filtros={filtros} onChangeFiltros={setFiltros} />

      {resumoError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {resumoError}
        </div>
      )}

      {/* Bloco E: Alertas de prejuízo/margem baixa */}
      <div className={`p-6 sm:p-8 rounded-[2rem] shadow-sm border space-y-4 ${alertas.length > 0 ? 'bg-rose-50/60 border-rose-100' : 'bg-emerald-50/60 border-emerald-100'}`}>
        <SectionTitle
          title="Alertas de Rentabilidade"
          subtitle={alertas.length > 0 ? `${alertas.length} item(ns) com margem abaixo do mínimo (${formatDecimalBR(thresholds.margemAmarelaMin, 0)}%)` : 'Nenhum alerta no período'}
        />
        {servicosLoading || pacotesLoading ? (
          <CardSkeleton height={80} />
        ) : alertas.length === 0 ? (
          <p className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <i className="fa-solid fa-circle-check"></i> Todos os serviços e pacotes com margem saudável.
          </p>
        ) : (
          <div className="space-y-2">
            {alertas.map((a, idx) => {
              const critico = a.lucroTotal < 0;
              return (
                <div
                  key={`${a.tipo}-${a.nome}-${idx}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${critico ? 'bg-rose-100 border-rose-200' : 'bg-white border-rose-100'}`}
                >
                  <i className={`fa-solid ${critico ? 'fa-circle-exclamation text-rose-600' : 'fa-triangle-exclamation text-amber-500'}`}></i>
                  <p className={`text-sm font-bold ${critico ? 'text-rose-700' : 'text-slate-700'}`}>
                    <span className="font-black">{a.tipo} "{a.nome}"</span> está com margem de {formatDecimalBR(a.margemPct)}% — abaixo do mínimo configurado ({formatDecimalBR(thresholds.margemAmarelaMin, 0)}%){critico ? '. PREJUÍZO: custo maior que o preço cobrado.' : '.'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bloco A: resumo do período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
        <KPICard
          label="Receita Total"
          value={formatCurrencyBR(resumo?.receitaTotal ?? 0)}
          icon="fa-sack-dollar"
          color="purple"
          loading={resumoLoading}
        />
        <KPICard
          label="Custo Total"
          value={formatCurrencyBR(resumo?.custoTotal ?? 0)}
          icon="fa-file-invoice-dollar"
          color="rose"
          loading={resumoLoading}
        />
        <KPICard
          label="Lucro Bruto"
          value={formatCurrencyBR(resumo?.lucroTotal ?? 0)}
          icon="fa-chart-line"
          color="emerald"
          loading={resumoLoading}
        />
        <KPICard
          label="Margem Média"
          value={`${formatDecimalBR(resumo?.margemMediaPct ?? 0)}%`}
          icon="fa-percent"
          color="indigo"
          loading={resumoLoading}
        />
        <KPICard
          label="Markup Médio"
          value={`${formatDecimalBR(resumo?.markupMedio ?? 0, 2)}x`}
          icon="fa-arrow-trend-up"
          color="orange"
          loading={resumoLoading}
        />
      </div>

      {/* Bloco B: rentabilidade por serviço */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <SectionTitle title="Rentabilidade por Serviço" subtitle="Preço médio real cobrado x custo do serviço no período" />
        {servicosLoading ? (
          <CardSkeleton height={220} />
        ) : servicos.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-8">Nenhum serviço avulso ou adicional pago no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={thClass}>Serviço</th>
                  <SortableTh label="Preço cobrado" sortKey="precoMedio" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                  <SortableTh label="Custo unitário" sortKey="custoMedio" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                  <th className={thClassRight}>Lucro/unidade</th>
                  <SortableTh label="Margem" sortKey="margemPct" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                  <SortableTh label="Markup" sortKey="markup" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                  <SortableTh label="Qtd." sortKey="qtd" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                  <SortableTh label="Lucro total" sortKey="lucroTotal" activeKey={servicosSort.sortKey as string} dir={servicosSort.sortDir} onClick={servicosSort.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {servicosSort.sorted.map((s) => {
                  const tone = classificarMargem(s.margemPct, thresholds);
                  const lucroUnidade = s.precoMedio - s.custoMedio;
                  return (
                    <tr key={s.servicoId} className={`border-b border-slate-50 ${tone === 'vermelho' ? 'bg-rose-50/60' : ''}`}>
                      <td className="py-3 pr-4 font-bold text-slate-700">{s.servico}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(s.precoMedio)}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(s.custoMedio)}</td>
                      <td className={`py-3 pr-4 text-right font-black ${lucroUnidade >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyBR(lucroUnidade)}</td>
                      <td className="py-3 pr-4 text-right"><MargemBadge margemPct={s.margemPct} tone={tone} /></td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatDecimalBR(s.markup, 2)}x</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{s.qtd}</td>
                      <td className={`py-3 text-right font-black ${s.lucroTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyBR(s.lucroTotal)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-3 pr-4 font-black text-slate-900 uppercase text-xs">Total</td>
                  <td colSpan={6}></td>
                  <td className="py-3 text-right font-black text-slate-900">{formatCurrencyBR(servicos.reduce((acc, s) => acc + s.lucroTotal, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bloco C: rentabilidade por pacote */}
      <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <SectionTitle title="Rentabilidade por Pacote" subtitle="Vale sempre o valor do pacote, nunca a soma dos serviços" />
        {pacotesLoading ? (
          <CardSkeleton height={220} />
        ) : pacotes.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-8">Nenhum pacote pago no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={thClass}>Pacote</th>
                  <SortableTh label="Preço" sortKey="precoMedio" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <SortableTh label="Nº sessões" sortKey="qtdSessoesMedia" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <SortableTh label="Custo total" sortKey="custoMedio" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <SortableTh label="Lucro" sortKey="lucroTotal" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <SortableTh label="Margem" sortKey="margemPct" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <SortableTh label="Markup" sortKey="markup" activeKey={pacotesSort.sortKey as string} dir={pacotesSort.sortDir} onClick={pacotesSort.toggleSort} />
                  <th className={thClassRight}>R$/sessão x avulso</th>
                </tr>
              </thead>
              <tbody>
                {pacotesSort.sorted.map((p) => {
                  const tone = classificarMargem(p.margemPct, thresholds);
                  const servicoAvulso = servicos.find((s) => s.servicoId === p.servicoId);
                  const descontoPct = servicoAvulso && servicoAvulso.precoMedio > 0
                    ? ((servicoAvulso.precoMedio - p.valorEfetivoSessaoMedio) / servicoAvulso.precoMedio) * 100
                    : null;
                  return (
                    <tr key={`${p.catalogoPacoteId ?? p.pacoteNome}`} className={`border-b border-slate-50 ${tone === 'vermelho' ? 'bg-rose-50/60' : ''}`}>
                      <td className="py-3 pr-4 font-bold text-slate-700">{p.pacoteNome}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(p.precoMedio)}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatDecimalBR(p.qtdSessoesMedia, 1)}</td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatCurrencyBR(p.custoMedio)}</td>
                      <td className={`py-3 pr-4 text-right font-black ${p.lucroTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyBR(p.lucroTotal)}</td>
                      <td className="py-3 pr-4 text-right"><MargemBadge margemPct={p.margemPct} tone={tone} /></td>
                      <td className="py-3 pr-4 text-right font-bold text-slate-600">{formatDecimalBR(p.markup, 2)}x</td>
                      <td className="py-3 text-right">
                        <p className="font-bold text-slate-700">{formatCurrencyBR(p.valorEfetivoSessaoMedio)}<span className="text-slate-300"> /sessão</span></p>
                        {servicoAvulso && descontoPct !== null ? (
                          <p className="text-[10px] font-bold text-slate-400">
                            vs {formatCurrencyBR(servicoAvulso.precoMedio)} avulso ({descontoPct >= 0 ? '−' : '+'}{formatDecimalBR(Math.abs(descontoPct))}%)
                          </p>
                        ) : (
                          <p className="text-[10px] font-bold text-slate-300">sem equivalente avulso no período</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-3 pr-4 font-black text-slate-900 uppercase text-xs">Total</td>
                  <td colSpan={3}></td>
                  <td className="py-3 pr-4 text-right font-black text-slate-900">{formatCurrencyBR(pacotes.reduce((acc, p) => acc + p.lucroTotal, 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bloco D: simulador de preço */}
      <SimuladorPreco servicos={servicos} pacotes={pacotes} thresholds={thresholds} />
    </div>
  );
};

export default Rentabilidade;
