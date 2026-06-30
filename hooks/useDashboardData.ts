import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Unit } from '../types';
import { useSyncRefresh } from './useSyncRefresh';
import { toCurrencyNumber } from '../services/appointmentTotals';
import { AlertBarType } from '../components/Dashboard/AlertBar';
import { RevenueChartPoint } from '../components/Dashboard/RevenueChart';

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;
const CHART_DAYS = 7;

export interface DashboardKPIs {
  receita: number;
  despesa: number;
  saldo: number;
  agendamentos: number;
  chartData: RevenueChartPoint[];
}

export interface DashboardAlert {
  id: string;
  type: AlertBarType;
  message: string;
}

interface UseDashboardDataResult {
  kpis: DashboardKPIs;
  alerts: DashboardAlert[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const emptyKpis: DashboardKPIs = {
  receita: 0,
  despesa: 0,
  saldo: 0,
  agendamentos: 0,
  chartData: []
};

const toDateKey = (date: Date) => date.toISOString().split('T')[0];

const buildDateRange = (days: number) => {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toDateKey(d));
  }
  return dates;
};

export const useDashboardData = (units: Unit[], supabaseClient: any): UseDashboardDataResult => {
  const [kpis, setKpis] = useState<DashboardKPIs>(emptyKpis);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unitIds = useMemo(() => units.map(u => u.id), [units]);

  const fetchFromCache = useCallback(async (dateRange: string[]) => {
    const { data, error: cacheError } = await supabaseClient
      .from('dashboard_cache')
      .select('*')
      .in('unidade_id', unitIds)
      .in('data_cache', dateRange);

    if (cacheError) throw cacheError;
    return data || [];
  }, [supabaseClient, unitIds]);

  const fetchManual = useCallback(async (dateRange: string[]) => {
    const startDate = dateRange[0];
    const endDate = dateRange[dateRange.length - 1];

    const [{ data: appts, error: apptError }, { data: packs, error: packError }, { data: expenses, error: expError }] = await Promise.all([
      supabaseClient
        .from('agendamentos')
        .select('id, unidade_id, data_agendamento, valor_total, pago, status, pacote_id')
        .gte('data_agendamento', startDate)
        .lte('data_agendamento', endDate),
      supabaseClient
        .from('pacotes')
        .select('id, unidade_id, data_pagamento, valor_total, pago')
        .gte('data_pagamento', startDate)
        .lte('data_pagamento', endDate),
      supabaseClient
        .from('despesas')
        .select('id, unidade_id, data_despesa, valor_total')
        .gte('data_despesa', startDate)
        .lte('data_despesa', endDate)
    ]);

    if (apptError) throw apptError;
    if (packError) throw packError;
    if (expError) throw expError;

    return { appts: appts || [], packs: packs || [], expenses: expenses || [] };
  }, [supabaseClient]);

  const buildAlerts = useCallback((appts: any[]): DashboardAlert[] => {
    const generated: DashboardAlert[] = [];

    const pendentes = appts.filter(a => a.status !== 'Cancelado' && (a.pago === false || a.pago === 'false'));
    if (pendentes.length > 0) {
      generated.push({
        id: 'pendencias-pagamento',
        type: 'warning',
        message: `${pendentes.length} agendamento(s) com pagamento pendente nos últimos dias.`
      });
    }

    const hoje = toDateKey(new Date());
    const agendamentosHoje = appts.filter(a => a.data_agendamento === hoje && a.status !== 'Cancelado');
    if (agendamentosHoje.length === 0) {
      generated.push({
        id: 'sem-agendamentos-hoje',
        type: 'info',
        message: 'Nenhum agendamento registrado para hoje ainda.'
      });
    }

    return generated;
  }, []);

  const refetch = useCallback(async () => {
    if (!units.length || !supabaseClient) return;
    setIsLoading(true);
    setError(null);

    const dateRange = buildDateRange(CHART_DAYS);

    try {
      let cacheRows: any[] = [];
      try {
        cacheRows = await fetchFromCache(dateRange);
      } catch (cacheErr) {
        console.warn('dashboard_cache indisponível, usando cálculo manual.', cacheErr);
      }

      if (cacheRows.length > 0) {
        const byDate = new Map<string, { receita: number; despesa: number; agendamentos: number }>();
        dateRange.forEach(d => byDate.set(d, { receita: 0, despesa: 0, agendamentos: 0 }));

        cacheRows.forEach(row => {
          const bucket = byDate.get(row.data_cache) || { receita: 0, despesa: 0, agendamentos: 0 };
          bucket.receita += toCurrencyNumber(row.total_entrada_dia);
          bucket.despesa += toCurrencyNumber(row.total_saida_dia);
          bucket.agendamentos += toCurrencyNumber(row.agendamentos_dia);
          byDate.set(row.data_cache, bucket);
        });

        const chartData: RevenueChartPoint[] = dateRange.map(date => {
          const bucket = byDate.get(date)!;
          return {
            date: date.slice(5),
            receita: bucket.receita,
            despesa: bucket.despesa,
            liquido: bucket.receita - bucket.despesa
          };
        });

        const receita = chartData.reduce((sum, d) => sum + d.receita, 0);
        const despesa = chartData.reduce((sum, d) => sum + d.despesa, 0);
        const agendamentos = cacheRows.reduce((sum, row) => sum + toCurrencyNumber(row.agendamentos_dia), 0);

        setKpis({ receita, despesa, saldo: receita - despesa, agendamentos, chartData });

        const pacotesVencendo = cacheRows.reduce((sum, row) => sum + toCurrencyNumber(row.pacotes_vencendo), 0);
        const cacheAlerts: DashboardAlert[] = [];
        if (pacotesVencendo > 0) {
          cacheAlerts.push({
            id: 'pacotes-vencendo',
            type: 'warning',
            message: `${pacotesVencendo} pacote(s) próximos do vencimento.`
          });
        }
        setAlerts(cacheAlerts);
        return;
      }

      const { appts, packs, expenses } = await fetchManual(dateRange);

      const byDate = new Map<string, { receita: number; despesa: number; agendamentos: number }>();
      dateRange.forEach(d => byDate.set(d, { receita: 0, despesa: 0, agendamentos: 0 }));

      appts.forEach((a: any) => {
        if (a.status === 'Cancelado') return;
        const bucket = byDate.get(a.data_agendamento);
        if (!bucket) return;
        bucket.agendamentos += 1;
        if (a.pago === true || a.pago === 'true') {
          bucket.receita += toCurrencyNumber(a.valor_total);
        }
      });

      packs.forEach((p: any) => {
        if (!(p.pago === true || p.pago === 'true')) return;
        const bucket = byDate.get(p.data_pagamento);
        if (!bucket) return;
        bucket.receita += toCurrencyNumber(p.valor_total);
      });

      expenses.forEach((e: any) => {
        const bucket = byDate.get(e.data_despesa);
        if (!bucket) return;
        bucket.despesa += toCurrencyNumber(e.valor_total);
      });

      const chartData: RevenueChartPoint[] = dateRange.map(date => {
        const bucket = byDate.get(date)!;
        return {
          date: date.slice(5),
          receita: bucket.receita,
          despesa: bucket.despesa,
          liquido: bucket.receita - bucket.despesa
        };
      });

      const receita = chartData.reduce((sum, d) => sum + d.receita, 0);
      const despesa = chartData.reduce((sum, d) => sum + d.despesa, 0);
      const agendamentos = chartData.reduce((sum, d, idx) => sum + (byDate.get(dateRange[idx])?.agendamentos || 0), 0);

      setKpis({ receita, despesa, saldo: receita - despesa, agendamentos, chartData });
      setAlerts(buildAlerts(appts));
    } catch (err: any) {
      console.error('Erro ao carregar dados do dashboard:', err);
      setError(err?.message || 'Erro ao carregar dados do dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [units.length, supabaseClient, fetchFromCache, fetchManual, buildAlerts]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refetch();
    }, REFETCH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refetch]);

  useSyncRefresh(['dashboard'], refetch);

  return { kpis, alerts, isLoading, error, refetch };
};
