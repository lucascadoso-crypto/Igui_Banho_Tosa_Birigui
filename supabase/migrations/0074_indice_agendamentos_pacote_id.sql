-- FIX DE PERFORMANCE: Dashboard Gerencial demorando muito / dando timeout.
--
-- Causa raiz (confirmada com EXPLAIN ANALYZE em producao, 2026-11-25):
-- fn_dashboard_kpis (migration 0033) calcula "pacotes ativos" com uma
-- subquery correlacionada que roda 1 vez PARA CADA pacote (864 linhas):
--
--   select count(*) from public.agendamentos ag
--   where ag.pacote_id = p.id and ag.status = 'Finalizado'
--
-- Sem indice em agendamentos.pacote_id, cada uma dessas 864 chamadas faz uma
-- varredura completa da tabela agendamentos (3293 linhas) = ~2,8 milhoes de
-- comparacoes. Essa subquery aparece 2x dentro de fn_dashboard_kpis (periodo
-- atual + periodo anterior) e sozinha ja consumia ~770ms dos ~800ms-1,15s
-- medidos na funcao inteira. Dentro do bundle fn_dashboard_bundle_principal
-- (migration 0073), essa funcao compartilha um unico statement_timeout de 8s
-- com mais 7 chamadas -- e sob RLS (can_access_unidade() avaliada por linha
-- varrida) o custo fica ainda maior, explicando os timeouts observados.
--
-- Fix: indice aditivo, parcial (so cobre agendamentos ligados a um pacote,
-- que sao a minoria). Nao muda nenhum resultado/calculo/regra de negocio,
-- so acelera a busca: a subquery correlacionada passa a usar index scan em
-- vez de sequential scan.
create index if not exists idx_agendamentos_pacote_id_status
  on public.agendamentos(pacote_id, status)
  where pacote_id is not null;

comment on index public.idx_agendamentos_pacote_id_status is
  'Acelera a contagem de sessoes finalizadas por pacote (fn_dashboard_kpis, "pacotes ativos") -- antes fazia sequential scan completo de agendamentos uma vez por pacote.';
