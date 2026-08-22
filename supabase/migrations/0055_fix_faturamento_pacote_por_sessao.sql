-- FIX: "Faturamento" do Dashboard Gerencial contava o valor CHEIO de um
-- pacote de uma vez só, na data em que foi pago (fn_receita_eventos, ramo
-- "pacote"). Um pacote de 8 sessões vendido hoje aparecia 100% no
-- faturamento deste mês, mesmo que a maioria das sessões só vá acontecer
-- nos próximos meses — inflando bastante o card em relação ao que
-- realmente foi prestado/faturável no período.
--
-- Isso também já estava inconsistente com o resto do próprio Dashboard:
-- fn_dashboard_custos_pacotes e fn_dashboard_transporte (migration 0032)
-- já contam pacote por SESSÃO finalizada (a.status = 'Finalizado', usando
-- data_fim_real com fallback pra data_agendamento — mesmo padrão do fix
-- de banhos/tosas na migration 0033). Só o ramo "pacote" de
-- fn_receita_eventos ficou de fora dessa regra, o que também distorcia o
-- "% custo sobre faturamento de pacotes" em DashboardGerencial.tsx (custo
-- calculado por sessão prestada dividido por receita do pacote inteiro).
--
-- Fix: ramo "pacote" passa a gerar um evento de receita POR SESSÃO
-- finalizada (mesma fonte de valor por sessão que o próprio app já grava
-- em agendamentos.valor_total/valor_transporte ao criar/editar o pacote em
-- PacoteFormModal.tsx), na data em que a sessão foi concluída. Só entra
-- receita de pacotes efetivamente pagos (p.pago = true) — pacote não pago
-- continua sem gerar faturamento, como já era.
--
-- Nenhuma tabela/coluna alterada; apenas troca o corpo da function
-- (create or replace, aditivo). O "Financeiro" (fechamento de caixa por
-- dia, que já filtra pacotes por data_pagamento em Financeiro.tsx) não é
-- afetado por esta migration — ele continua sendo a visão de caixa.

create or replace function public.fn_receita_eventos(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos' -- 'todos' | 'com' | 'sem'
)
returns table (
  origem text,
  categoria text,
  agendamento_id bigint,
  pacote_id bigint,
  unidade_id bigint,
  pet_id bigint,
  cliente_id bigint,
  data_evento date,
  valor_servico numeric,
  valor_transporte numeric,
  forma_pagamento_1 text,
  valor_pagamento_1 numeric,
  forma_pagamento_2 text,
  valor_pagamento_2 numeric,
  tem_taxi boolean
)
language sql
stable
as $$
  with ajuste as (
    select distinct on (fm.agendamento_id)
      fm.agendamento_id,
      fm.id as movimento_id,
      fm.valor_total
    from public.financeiro_movimentos fm
    where fm.agendamento_id is not null
      and fm.origem is distinct from 'extras_agendamento'
      and fm.categoria is distinct from 'extras'
    order by fm.agendamento_id, fm.id desc
  ),
  ajuste_pg as (
    select
      fp.movimento_id,
      fp.forma_pagamento::text as forma_pagamento,
      fp.valor,
      row_number() over (partition by fp.movimento_id order by fp.id asc) as ordem
    from public.financeiro_pagamentos fp
  ),
  avulso as (
    select
      'avulso'::text as origem,
      public.fn_categoria_agendamento(a.id) as categoria,
      a.id as agendamento_id,
      null::bigint as pacote_id,
      a.unidade_id,
      a.pet_id,
      a.cliente_id,
      a.data_agendamento as data_evento,
      (coalesce(aj.valor_total, coalesce(a.valor_total, 0) + coalesce(a.valor_pagamento_2, 0))
        - coalesce(a.valor_transporte, 0)) as valor_servico,
      coalesce(a.valor_transporte, 0) as valor_transporte,
      coalesce(p1.forma_pagamento, a.forma_pagamento) as forma_pagamento_1,
      coalesce(p1.valor, aj.valor_total, a.valor_total, 0) as valor_pagamento_1,
      case when aj.movimento_id is null then a.forma_pagamento_2 else p2.forma_pagamento end as forma_pagamento_2,
      case when aj.movimento_id is null then coalesce(a.valor_pagamento_2, 0) else coalesce(p2.valor, 0) end as valor_pagamento_2,
      a.tem_taxi
    from public.agendamentos a
    left join ajuste aj on aj.agendamento_id = a.id
    left join ajuste_pg p1 on p1.movimento_id = aj.movimento_id and p1.ordem = 1
    left join ajuste_pg p2 on p2.movimento_id = aj.movimento_id and p2.ordem = 2
    where a.pago = true
      and a.pacote_id is null
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_agendamento between p_data_inicio and p_data_fim
  ),
  pacote as (
    -- Um evento por SESSÃO finalizada do pacote (não um lote único na data
    -- de pagamento), usando o valor já rateado por sessão que o próprio
    -- app grava em agendamentos.valor_total/valor_transporte.
    select
      'pacote'::text as origem,
      'pacote'::text as categoria,
      a.id as agendamento_id,
      a.pacote_id,
      a.unidade_id,
      a.pet_id,
      a.cliente_id,
      coalesce((a.data_fim_real at time zone 'America/Sao_Paulo')::date, a.data_agendamento) as data_evento,
      (coalesce(a.valor_total, 0) - coalesce(a.valor_transporte, 0)) as valor_servico,
      coalesce(a.valor_transporte, 0) as valor_transporte,
      p.forma_pagamento as forma_pagamento_1,
      (coalesce(p.valor_total, 0) / nullif(p.qtd_sessoes, 0)) as valor_pagamento_1,
      p.forma_pagamento_2 as forma_pagamento_2,
      (coalesce(p.valor_pagamento_2, 0) / nullif(p.qtd_sessoes, 0)) as valor_pagamento_2,
      a.tem_taxi
    from public.agendamentos a
    join public.pacotes p on p.id = a.pacote_id
    where a.status = 'Finalizado'
      and p.pago = true
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and coalesce((a.data_fim_real at time zone 'America/Sao_Paulo')::date, a.data_agendamento) between p_data_inicio and p_data_fim
  ),
  adicional as (
    select
      'adicional'::text as origem,
      'adicional'::text as categoria,
      a.id as agendamento_id,
      a.pacote_id,
      a.unidade_id,
      a.pet_id,
      a.cliente_id,
      a.data_pagamento_extra as data_evento,
      coalesce(a.valor_extra_total, 0) as valor_servico,
      0::numeric as valor_transporte,
      a.forma_pagamento_extra as forma_pagamento_1,
      coalesce(a.valor_extra_total, 0) as valor_pagamento_1,
      null::text as forma_pagamento_2,
      0::numeric as valor_pagamento_2,
      a.tem_taxi
    from public.agendamentos a
    where a.status_pagamento_extra = 'PAGO'
      and a.data_pagamento_extra is not null
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_pagamento_extra between p_data_inicio and p_data_fim
  ),
  todos as (
    select * from avulso
    union all
    select * from pacote
    union all
    select * from adicional
  )
  select *
  from todos
  where p_transporte = 'todos'
     or (p_transporte = 'com' and tem_taxi = true)
     or (p_transporte = 'sem' and tem_taxi = false);
$$;

comment on function public.fn_receita_eventos(bigint, date, date, text) is
  'Fonte unica de eventos de receita (avulso/pacote/adicional) para o Dashboard Gerencial. Pacote conta por sessao finalizada (nao mais o valor cheio na data de pagamento), resolvendo o mesmo overlay de ajuste financeiro manual usado em Financeiro.tsx para eventos avulsos.';
