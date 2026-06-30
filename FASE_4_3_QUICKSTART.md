# FASE 4.3 — Quickstart (5 minutos)

1. **Aplique a migration 0030** no Supabase (SQL Editor ou CLI):
   ```
   supabase/migrations/0030_dashboard_cache_and_sync_logs.sql
   ```
   Isso cria `dashboard_cache`, `sync_logs` e os triggers que mantêm o cache atualizado.

2. **Nada a instalar** — `recharts` já está no `package.json`.

3. **Abra o Painel Geral** (`components/PainelGeral.tsx`). Ele já usa:
   - `useDashboardData(units, supabaseClient)` para buscar KPIs
   - `AlertBar` para alertas automáticos
   - 4 `KPICard` (receita, despesa, saldo, agendamentos)
   - `QuickActionButtons` com 3 atalhos
   - `RevenueChart` com os últimos 7 dias

4. **Ligue os atalhos**: os `onClick` de `quickActions` em `PainelGeral.tsx` estão vazios — conecte-os à navegação real (ex: abrir modal de agendamento, tela de recebimento, renovação de pacote).

5. **Sem dados ainda?** O hook calcula tudo manualmente a partir de `agendamentos`/`pacotes`/`despesas` enquanto o cache não tem linhas — nenhuma ação extra é necessária.
