import React, { useEffect, useMemo, useState } from 'react';
import { Unit, UserProfile } from '../types';
import KPICard from './Dashboard/KPICard';
import { formatCurrencyBR } from '../services/appointmentTotals';
import { SEGMENTOS, SegmentoId, ClienteSegmento } from './Marketing/segmentos';
import SegmentoPainel from './Marketing/SegmentoPainel';

interface MarketingFidelizacaoProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
}

// Espelha public.marketing_segmentos_clientes (ver supabase/migrations/0052_marketing_fidelizacao_views.sql).
interface ClienteMetricaRow {
  cliente_id: number | string;
  unidade_id: number | string;
  nome: string;
  telefone: string | null;
  banhos_12m: number;
  avulsos_finalizados: number;
  dias_desde_ultimo_finalizado: number | null;
  total_pacotes: number;
  tem_pacote_ativo: boolean;
  pacote_vencido_recente: boolean;
  pacotes_ativos_pagos: boolean | null;
  valor_ultimo_pacote_vencido: number | null;
  ultimo_agendamento_id: number | string | null;
  seg_vip: boolean;
  seg_pagam_em_dia: boolean;
  seg_avulso_recorrente: boolean;
  seg_nao_renovaram: boolean;
  seg_inativos: boolean;
}

// Espelha public.marketing_aniversariantes.
interface AniversarianteRow {
  cliente_id: number | string;
  unidade_id: number | string;
  cliente_nome: string;
  telefone: string | null;
  tipo_aniversariante: 'cliente' | 'pet';
  nome_aniversariante: string;
  ultimo_agendamento_id: number | string | null;
}

const MarketingFidelizacao: React.FC<MarketingFidelizacaoProps> = ({ unit, supabaseClient, userProfile }) => {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteMetricaRow[]>([]);
  const [aniversariantes, setAniversariantes] = useState<AniversarianteRow[]>([]);
  const [segmentoAberto, setSegmentoAberto] = useState<SegmentoId | null>(null);

  useEffect(() => {
    fetchData();
  }, [unit.id]);

  const fetchData = async () => {
    setLoading(true);
    setErro(null);
    try {
      const [{ data: metricas, error: erroMetricas }, { data: aniv, error: erroAniv }] = await Promise.all([
        supabaseClient.from('marketing_segmentos_clientes').select('*').eq('unidade_id', unit.id),
        supabaseClient.from('marketing_aniversariantes').select('*').eq('unidade_id', unit.id)
      ]);

      if (erroMetricas) throw erroMetricas;
      if (erroAniv) throw erroAniv;

      setClientes(metricas || []);
      setAniversariantes(aniv || []);
    } catch (err: any) {
      console.error('[Marketing] Erro ao carregar segmentação:', err);
      setErro('Não foi possível carregar os dados de marketing. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const clientesPorSegmento = useMemo<Record<SegmentoId, ClienteSegmento[]>>(() => {
    const toCliente = (c: ClienteMetricaRow, subtitulo?: string): ClienteSegmento => ({
      clienteId: c.cliente_id,
      nome: c.nome,
      telefone: c.telefone,
      subtitulo,
      ultimoAgendamentoId: c.ultimo_agendamento_id
    });

    const aniversariantesDedup = new Map<string, ClienteSegmento>();
    aniversariantes.forEach(a => {
      const key = String(a.cliente_id);
      const existente = aniversariantesDedup.get(key);
      const subtitulo = a.tipo_aniversariante === 'pet' ? `Pet: ${a.nome_aniversariante}` : 'Aniversário do tutor';
      if (!existente) {
        aniversariantesDedup.set(key, {
          clienteId: a.cliente_id,
          nome: a.cliente_nome,
          telefone: a.telefone,
          subtitulo,
          ultimoAgendamentoId: a.ultimo_agendamento_id
        });
      }
    });

    return {
      vip: clientes.filter(c => c.seg_vip).map(c => toCliente(c, `${c.banhos_12m} banhos em 12m`)),
      pagam_em_dia: clientes.filter(c => c.seg_pagam_em_dia).map(c => toCliente(c)),
      avulso_recorrente: clientes.filter(c => c.seg_avulso_recorrente).map(c => toCliente(c, `${c.avulsos_finalizados} avulsos`)),
      nao_renovaram: clientes.filter(c => c.seg_nao_renovaram).map(c => toCliente(c)),
      inativos: clientes.filter(c => c.seg_inativos).map(c => toCliente(
        c,
        c.dias_desde_ultimo_finalizado != null ? `${c.dias_desde_ultimo_finalizado} dias sem voltar` : 'Nunca finalizou um banho'
      )),
      aniversariantes: Array.from(aniversariantesDedup.values())
    };
  }, [clientes, aniversariantes]);

  const kpis = useMemo(() => {
    const pacotesAtivos = clientes.filter(c => c.tem_pacote_ativo).length;
    const avulsosAConverter = clientesPorSegmento.avulso_recorrente.length;
    const comHistoricoPacote = clientes.filter(c => c.total_pacotes > 0);
    const taxaRenovacao = comHistoricoPacote.length > 0
      ? (comHistoricoPacote.filter(c => c.tem_pacote_ativo).length / comHistoricoPacote.length) * 100
      : null;
    const potencialRecompra = clientes
      .filter(c => c.seg_nao_renovaram)
      .reduce((soma, c) => soma + (Number(c.valor_ultimo_pacote_vencido) || 0), 0);

    return { pacotesAtivos, avulsosAConverter, taxaRenovacao, potencialRecompra };
  }, [clientes, clientesPorSegmento]);

  const segmentoAbertoDef = segmentoAberto ? SEGMENTOS.find(s => s.id === segmentoAberto) : null;

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{unit.name}</p>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Marketing & Fidelização</h1>
        <p className="text-sm font-semibold text-slate-500 mt-1">Segmentação de clientes para campanhas de retenção via WhatsApp.</p>
      </div>

      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 font-bold text-sm rounded-2xl px-5 py-4 flex items-center justify-between">
          <span>{erro}</span>
          <button onClick={fetchData} className="text-xs font-black uppercase tracking-widest bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700">
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <KPICard label="Pacotes ativos" value={kpis.pacotesAtivos} icon="fa-box-open" color="indigo" loading={loading} />
        <KPICard label="Avulsos a converter" value={kpis.avulsosAConverter} icon="fa-repeat" color="orange" loading={loading} />
        <KPICard
          label="Taxa de renovação"
          value={kpis.taxaRenovacao === null ? 'Sem histórico' : `${kpis.taxaRenovacao.toFixed(0)}%`}
          subtext="Clientes com pacote ativo / que já tiveram pacote"
          icon="fa-rotate"
          color="emerald"
          loading={loading}
        />
        <KPICard
          label="Potencial de recompra"
          value={formatCurrencyBR(kpis.potencialRecompra)}
          subtext="Valor do último pacote de quem não renovou"
          icon="fa-sack-dollar"
          color="rose"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {SEGMENTOS.map(seg => {
          const lista = clientesPorSegmento[seg.id];
          return (
            <button
              key={seg.id}
              onClick={() => setSegmentoAberto(seg.id)}
              disabled={loading}
              className="text-left bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-all group disabled:opacity-60 disabled:cursor-wait"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-base shrink-0 ${seg.corBg} ${seg.corTexto}`}>
                  <i className={`fa-solid ${seg.icon}`}></i>
                </div>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">
                  {loading ? '—' : lista.length}
                </span>
              </div>
              <p className="font-black text-slate-900 text-sm">{seg.titulo}</p>
              <p className="text-xs font-semibold text-slate-400 mt-1">{seg.descricao}</p>
            </button>
          );
        })}
      </div>

      {segmentoAbertoDef && (
        <SegmentoPainel
          segmento={segmentoAbertoDef}
          clientes={clientesPorSegmento[segmentoAbertoDef.id]}
          unit={unit}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setSegmentoAberto(null)}
        />
      )}
    </div>
  );
};

export default MarketingFidelizacao;
