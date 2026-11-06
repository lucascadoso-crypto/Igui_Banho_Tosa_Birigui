-- CRM (Prompt 1): metricas de valor do cliente para o Prontuario
-- (total_gasto_12m, ticket_medio, total_atendimentos, cliente_desde).
-- View aditiva, somente leitura -- nenhuma tabela e alterada e nenhuma view
-- existente (marketing_cliente_metricas/marketing_segmentos_clientes) e
-- tocada.
--
-- total_gasto_12m e ticket_medio reaproveitam public.fn_receita_eventos_caixa
-- (0056_financeiro_geral_caixa.sql) -- a mesma fonte de "o que conta como
-- receita em regime de caixa" usada no Financeiro Geral -- para nao divergir
-- do modulo financeiro. Chamada via lateral join por unidade (a funcao
-- recebe p_unidade_id).
--
-- ticket_medio = total_gasto_12m dividido pela quantidade de eventos de
-- receita nos ultimos 12 meses (mesma janela do total_gasto_12m), nao pelo
-- total_atendimentos (que e all-time). total_atendimentos conta
-- agendamentos com status FINALIZADO em qualquer periodo, mesmo padrao de
-- "finalizados" usado em marketing_cliente_metricas.
--
-- security_invoker = true: RLS de clientes/agendamentos continua valendo;
-- fn_receita_eventos_caixa e "language sql stable" sem security definer,
-- ou seja, ja roda com os privilegios de quem chama.

create or replace view public.crm_cliente_valor
with (security_invoker = true)
as
with unidades_ativas as (
  select distinct unidade_id from public.clientes where ativo = true
),
eventos_12m as (
  select
    ev.cliente_id,
    ev.unidade_id,
    (ev.valor_servico + ev.valor_transporte) as valor_evento
  from unidades_ativas u
  cross join lateral public.fn_receita_eventos_caixa(
    u.unidade_id,
    (current_date - interval '12 months')::date,
    current_date,
    'todos'
  ) ev
),
gasto_12m as (
  select
    cliente_id,
    unidade_id,
    sum(valor_evento) as total_gasto_12m,
    count(*) as eventos_12m
  from eventos_12m
  group by cliente_id, unidade_id
),
atendimentos as (
  select cliente_id, unidade_id, count(*) as total_atendimentos
  from public.agendamentos
  where upper(status) = 'FINALIZADO'
  group by cliente_id, unidade_id
)
select
  c.id as cliente_id,
  c.unidade_id,
  coalesce(g.total_gasto_12m, 0) as total_gasto_12m,
  case
    when coalesce(g.eventos_12m, 0) > 0 then round(g.total_gasto_12m / g.eventos_12m, 2)
    else null
  end as ticket_medio,
  coalesce(at.total_atendimentos, 0) as total_atendimentos,
  c.created_at::date as cliente_desde
from public.clientes c
left join gasto_12m g on g.cliente_id = c.id and g.unidade_id = c.unidade_id
left join atendimentos at on at.cliente_id = c.id and at.unidade_id = c.unidade_id
where c.ativo = true;

grant select on public.crm_cliente_valor to authenticated;
