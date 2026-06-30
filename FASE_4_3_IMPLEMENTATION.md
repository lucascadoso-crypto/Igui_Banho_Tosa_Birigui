# FASE 4.3 — Implementação Técnica

## Objetivo
Substituir o Painel Geral antigo (filtros de data + grid de volume por unidade) por um dashboard moderno com KPIs financeiros, alertas e gráfico de receita/despesa, alimentado por cache no banco com fallback de cálculo manual.

## Fluxo de dados

```
useDashboardData(units, supabaseClient)
  │
  ├─ 1. Tenta ler de `dashboard_cache` (últimos 7 dias, todas as unidades)
  │     └─ Se houver linhas → monta kpis + chartData a partir do cache
  │
  └─ 2. Fallback (cache vazio ou erro):
        ├─ busca `agendamentos` (data, valor_total, pago, status) no período
        ├─ busca `pacotes` (data_pagamento, valor_total, pago) no período
        ├─ busca `despesas` (data_despesa, valor_total) no período
        └─ agrega por dia → kpis + chartData + alerts heurísticos
```

`dashboard_cache` é mantido automaticamente por triggers (`fn_sync_dashboard_cache_on_agendamento`,
`fn_sync_dashboard_cache_on_despesa`) que chamam `fn_refresh_dashboard_cache(unidade_id, data)` sempre
que um agendamento ou despesa relevante muda. Cada execução também grava uma linha em `sync_logs`.

## Componentes

`PainelGeral.tsx` compõe, nesta ordem:
1. Header com título + botão "Atualizar" (chama `refetch()`)
2. `AlertBar` de erro de sincronização (se `error` do hook estiver setado)
3. `AlertBar` para cada alerta gerado (pendências de pagamento, pacotes vencendo, sem agendamentos hoje) — dismissable via estado local `dismissedAlerts`
4. Grid de 4 `KPICard` (receita, despesa, saldo, agendamentos)
5. `QuickActionButtons` (novo agendamento, receber, renovar pacote)
6. `RevenueChart` (linha, 7 dias, receita/despesa/líquido)
7. Footer com timestamp da última atualização

## Decisões de implementação

- **Sem React Query**: o projeto usa `useState`/`useEffect` puro em todos os hooks existentes (`useSyncRefresh`); `useDashboardData` segue a mesma convenção.
- **`supabaseClient` via prop**, não import direto do singleton — consistente com `PainelGeral`, `FinanceiroGlobal`, `Gastos`, etc.
- **Tailwind via CDN**: classes precisam ser literais (não interpoladas) para o JIT scanner funcionar — por isso `QuickActionButtons` usa um mapa estático `gridColsClasses` em vez de `` `grid-cols-${columns}` ``.
- **Migration numerada 0030**, próximo número livre após o merge com `origin/main` (que já ocupava 0027–0029 com outras features em paralelo).
- **Alertas heurísticos no fallback**: pendências de pagamento (`agendamentos.pago = false`) e ausência de agendamentos no dia. No modo cache, o alerta de pacotes vencendo vem de `dashboard_cache.pacotes_vencendo`, calculado no banco via `pacotes.data_fim` nos próximos 7 dias.

## Checklist de implementação

- [x] Migration `0030_dashboard_cache_and_sync_logs.sql` criada (tabelas + RLS + triggers)
- [ ] Migration aplicada no Supabase (ação manual — ver `FASE_4_3_QUICKSTART.md`)
- [x] `KPICard`, `AlertBar`, `QuickActionButtons`, `RevenueChart` criados em `components/Dashboard/`
- [x] `useDashboardData.ts` criado em `hooks/`
- [x] `PainelGeral.tsx` refatorado
- [ ] `onClick` dos `QuickActionButtons` conectados às telas reais (placeholder vazio por enquanto)
- [ ] Validação de build (`tsc`/`vite build`) — não executado neste ambiente por falta de Node/npm no shell
