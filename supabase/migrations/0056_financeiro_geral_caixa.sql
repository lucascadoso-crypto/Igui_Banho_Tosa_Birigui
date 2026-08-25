-- FIX: a migration 0055 mudou fn_receita_eventos para contar pacote por
-- SESSAO finalizada (regime de competencia) — correto para o Dashboard
-- Gerencial, que estava somando o valor cheio do pacote de uma vez so.
--
-- Só que a tela "Financeiro Geral" (fn_financeiro_kpis, fn_financeiro_
-- fluxo_diario, fn_financeiro_faturamento_por_linha, fn_financeiro_
-- formas_pagamento, fn_financeiro_fidelidade) usa fn_receita_eventos por
-- baixo de fn_financeiro_eventos_filtrados — ela HERDOU a mudanca e passou
-- a mostrar o mesmo numero por competencia, o que quebra o que essa tela
-- precisa mostrar: CAIXA de verdade (o que entrou de dinheiro no periodo
-- selecionado, pacote pago de uma vez conta de uma vez, na data do
-- pagamento — igual sempre foi).
--
-- Fix: cria fn_receita_eventos_caixa, uma copia de fn_receita_eventos com
-- o ramo "pacote" antigo (valor cheio na data_pagamento — mesma regra de
-- antes da migration 0055) e aponta fn_financeiro_eventos_filtrados pra
-- ela. Dashboard Gerencial continua usando fn_receita_eventos (competencia
-- por sessao); Financeiro Geral passa a usar fn_receita_eventos_caixa
-- (caixa). As duas fontes ficam explicitamente separadas por nome, sem
-- overload de parametros pra nao arriscar ambiguidade de chamada.

create or replace function public.fn_receita_eventos_caixa(
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
    -- Regime de caixa: valor cheio do pacote de uma vez so, na data em que
    -- foi pago (data_pagamento) — nao rateado por sessao.
    select
      'pacote'::text as origem,
      'pacote'::text as categoria,
      null::bigint as agendamento_id,
      p.id as pacote_id,
      p.unidade_id,
      p.pet_id,
      p.cliente_id,
      p.data_pagamento as data_evento,
      (coalesce(p.valor_total, 0) + coalesce(p.valor_pagamento_2, 0) - coalesce(p.valor_transporte, 0)) as valor_servico,
      coalesce(p.valor_transporte, 0) as valor_transporte,
      p.forma_pagamento as forma_pagamento_1,
      coalesce(p.valor_total, 0) as valor_pagamento_1,
      p.forma_pagamento_2 as forma_pagamento_2,
      coalesce(p.valor_pagamento_2, 0) as valor_pagamento_2,
      (coalesce(p.valor_transporte, 0) > 0) as tem_taxi
    from public.pacotes p
    where p.pago = true
      and p.data_pagamento is not null
      and (p_unidade_id is null or p.unidade_id = p_unidade_id)
      and p.data_pagamento between p_data_inicio and p_data_fim
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

comment on function public.fn_receita_eventos_caixa(bigint, date, date, text) is
  'Fonte de eventos de receita em regime de CAIXA (pacote conta valor cheio na data_pagamento). Usada apenas pela tela Financeiro Geral (fn_financeiro_eventos_filtrados). Para regime de competencia por sessao, ver fn_receita_eventos (Dashboard Gerencial).';

-- Repontar o wrapper do Financeiro Geral para a versao caixa.
create or replace function public.fn_financeiro_eventos_filtrados(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
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
  select *
  from public.fn_receita_eventos_caixa(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
  where (p_categoria = 'todos' or categoria = p_categoria)
    and (
      p_forma_pagamento = 'todas'
      or public.fn_normaliza_forma_pagamento(forma_pagamento_1) = p_forma_pagamento
      or public.fn_normaliza_forma_pagamento(forma_pagamento_2) = p_forma_pagamento
    );
$$;

comment on function public.fn_financeiro_eventos_filtrados(bigint, date, date, text, text, text) is
  'Wrapper de fn_receita_eventos_caixa (regime de caixa) com filtros de linha de servico e forma de pagamento, usado pela tela Financeiro Geral.';
