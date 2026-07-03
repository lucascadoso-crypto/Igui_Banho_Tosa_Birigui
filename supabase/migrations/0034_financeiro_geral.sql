-- FASE: Redesign visual do Financeiro Geral
-- Migration aditiva: nenhuma coluna/tabela/funcao existente e alterada.
--
-- Reaproveita fn_receita_eventos, fn_categoria_agendamento, fn_normaliza_forma_pagamento
-- (migration 0032) como fonte unica de receita paga. Adiciona:
--   1) fn_financeiro_eventos_filtrados: wrapper de fn_receita_eventos com 2 filtros novos
--      (linha de servico / forma de pagamento) usados pela tela Financeiro Geral.
--   2) fn_financeiro_eventos_pendentes: fonte unica de pendencias (pago = false), usada
--      pelos blocos de Contas a Receber e pelo KPI de Inadimplencia. NAO usa
--      financeiro_movimentos (confirmado que essa tabela nao e populada de forma
--      confiavel para todo lancamento — e um overlay manual, nao um livro razao
--      completo). "Vencido" = pendente cuja data de referencia (data_agendamento para
--      avulso/adicional, data_inicio para pacote) ja passou, comparado a
--      "hoje" em America/Sao_Paulo. Sem due-date dedicado: decisao confirmada com o
--      dono do produto para nao criar coluna nova agora.
--   3) Agregacoes por bloco da nova tela (KPIs, fluxo diario, faturamento por linha de
--      servico, fidelidade pacotes x avulsos, lista de contas pendentes).
--
-- Regras confirmadas com o dono do produto (nao alteram nenhuma regra de calculo ja
-- existente no Dashboard/Financeiro por unidade, apenas agregam para exibicao):
--   - FATURAMENTO = RECEBIDO + A RECEBER do periodo.
--   - RECEBIDO mantem a regra de caixa atual (fn_receita_eventos, por data de pagamento).
--   - LUCRO = RECEBIDO - CUSTOS (custos = despesas do periodo).
--   - INADIMPLENCIA % = VENCIDO / (RECEBIDO + VENCIDO) * 100.
--   - "Adicionais" (extras avulsos) contam do lado AVULSOS no card de Fidelidade.

-- ---------------------------------------------------------------------------
-- 1) Eventos de receita (pagos) com filtros adicionais de categoria/forma
-- ---------------------------------------------------------------------------
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
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
  where (p_categoria = 'todos' or categoria = p_categoria)
    and (
      p_forma_pagamento = 'todas'
      or public.fn_normaliza_forma_pagamento(forma_pagamento_1) = p_forma_pagamento
      or public.fn_normaliza_forma_pagamento(forma_pagamento_2) = p_forma_pagamento
    );
$$;

comment on function public.fn_financeiro_eventos_filtrados(bigint, date, date, text, text, text) is
  'Wrapper de fn_receita_eventos com filtros de linha de servico e forma de pagamento, usado pela tela Financeiro Geral. Nao altera a regra de receita.';

-- ---------------------------------------------------------------------------
-- 2) Eventos pendentes (pago = false) — fonte unica de Contas a Receber
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_eventos_pendentes(
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
  referencia_id bigint,
  unidade_id bigint,
  cliente_id bigint,
  cliente_nome text,
  descricao text,
  data_referencia date,
  valor numeric,
  vencido boolean
)
language sql
stable
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as v
  ),
  avulso as (
    select
      'avulso'::text as origem,
      public.fn_categoria_agendamento(a.id) as categoria,
      a.id as referencia_id,
      a.unidade_id,
      a.cliente_id,
      c.nome as cliente_nome,
      coalesce(
        (select string_agg(distinct s.nome, ' + ')
           from public.agendamento_itens ai
           join public.servicos s on s.id = ai.servico_id
          where ai.agendamento_id = a.id and ai.tipo = 'principal'),
        'Atendimento avulso'
      ) as descricao,
      a.data_agendamento as data_referencia,
      coalesce(a.valor_total, 0) + coalesce(a.valor_pagamento_2, 0) as valor,
      a.forma_pagamento,
      a.tem_taxi
    from public.agendamentos a
    join public.clientes c on c.id = a.cliente_id
    where a.pago = false
      and a.pacote_id is null
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_agendamento between p_data_inicio and p_data_fim
  ),
  pacote as (
    select
      'pacote'::text as origem,
      'pacote'::text as categoria,
      p.id as referencia_id,
      p.unidade_id,
      p.cliente_id,
      c.nome as cliente_nome,
      coalesce(p.nome_pacote, p.nome, 'Pacote') as descricao,
      coalesce(p.data_inicio, p.created_at::date) as data_referencia,
      coalesce(p.valor_total, 0) + coalesce(p.valor_pagamento_2, 0) as valor,
      p.forma_pagamento,
      (coalesce(p.valor_transporte, 0) > 0) as tem_taxi
    from public.pacotes p
    join public.clientes c on c.id = p.cliente_id
    where p.pago = false
      and (p_unidade_id is null or p.unidade_id = p_unidade_id)
      and coalesce(p.data_inicio, p.created_at::date) between p_data_inicio and p_data_fim
  ),
  adicional as (
    select
      'adicional'::text as origem,
      'adicional'::text as categoria,
      a.id as referencia_id,
      a.unidade_id,
      a.cliente_id,
      c.nome as cliente_nome,
      'Serviços adicionais'::text as descricao,
      coalesce(a.data_pagamento_extra, a.data_agendamento) as data_referencia,
      coalesce(a.valor_extra_total, 0) as valor,
      a.forma_pagamento_extra as forma_pagamento,
      a.tem_taxi
    from public.agendamentos a
    join public.clientes c on c.id = a.cliente_id
    where a.status_pagamento_extra <> 'PAGO'
      and coalesce(a.valor_extra_total, 0) > 0
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and coalesce(a.data_pagamento_extra, a.data_agendamento) between p_data_inicio and p_data_fim
  ),
  todos as (
    select * from avulso
    union all
    select * from pacote
    union all
    select * from adicional
  )
  select
    t.origem,
    t.categoria,
    t.referencia_id,
    t.unidade_id,
    t.cliente_id,
    t.cliente_nome,
    t.descricao,
    t.data_referencia,
    t.valor,
    (t.data_referencia < hoje.v) as vencido
  from todos t, hoje
  where (p_categoria = 'todos' or t.categoria = p_categoria)
    and (p_forma_pagamento = 'todas' or public.fn_normaliza_forma_pagamento(t.forma_pagamento) = p_forma_pagamento)
    and (p_transporte = 'todos' or (p_transporte = 'com' and t.tem_taxi = true) or (p_transporte = 'sem' and t.tem_taxi = false));
$$;

comment on function public.fn_financeiro_eventos_pendentes(bigint, date, date, text, text, text) is
  'Fonte unica de pendencias (pago = false) por agendamento avulso/pacote/adicional. "Vencido" = data de referencia (data_agendamento ou data_inicio) anterior a hoje em America/Sao_Paulo. Nao usa financeiro_movimentos (overlay manual, nao e um livro razao completo de pendencias).';

-- ---------------------------------------------------------------------------
-- 3) Valor consolidado de pendencias (A Receber / Vencido) — usado pelos KPIs
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_contas_pendentes_valor(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'a_receber_periodo', coalesce(sum(valor), 0),
    'vencido_total', coalesce(sum(valor) filter (where vencido), 0),
    'vencido_count', coalesce(count(*) filter (where vencido), 0)
  )
  from public.fn_financeiro_eventos_pendentes(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento);
$$;

-- ---------------------------------------------------------------------------
-- 4) Lista de contas pendentes (tabela "Contas a Receber" + modal "Ver todas")
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_contas_pendentes_lista(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas',
  p_limite int default 200
)
returns table (
  origem text,
  referencia_id bigint,
  cliente_nome text,
  descricao text,
  vencimento date,
  valor numeric,
  vencido boolean
)
language sql
stable
as $$
  select origem, referencia_id, cliente_nome, descricao, data_referencia as vencimento, valor, vencido
  from public.fn_financeiro_eventos_pendentes(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento)
  order by data_referencia asc
  limit p_limite;
$$;

-- ---------------------------------------------------------------------------
-- 5) KPIs do Financeiro Geral (periodo atual + anterior, uma unica chamada)
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_kpis(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date,
  p_data_fim_ant date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_recebido_atual numeric;
  v_recebido_anterior numeric;
  v_custos_atual numeric;
  v_custos_anterior numeric;
  v_pend_atual jsonb;
  v_pend_anterior jsonb;
  v_a_receber_periodo numeric;
  v_vencido_total numeric;
  v_vencido_count bigint;
  v_faturamento_atual numeric;
  v_faturamento_anterior numeric;
  v_lucro_atual numeric;
  v_lucro_anterior numeric;
  v_inadimplencia_pct numeric;
begin
  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_recebido_atual
  from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento);

  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_recebido_anterior
  from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio_ant, p_data_fim_ant, p_transporte, p_categoria, p_forma_pagamento);

  -- Despesas nao tem coluna de categoria/forma de pagamento: os 2 filtros nao se aplicam aqui.
  select coalesce(sum(d.valor_total), 0)
    into v_custos_atual
  from public.despesas d
  where (p_unidade_id is null or d.unidade_id = p_unidade_id)
    and d.data_despesa between p_data_inicio and p_data_fim;

  select coalesce(sum(d.valor_total), 0)
    into v_custos_anterior
  from public.despesas d
  where (p_unidade_id is null or d.unidade_id = p_unidade_id)
    and d.data_despesa between p_data_inicio_ant and p_data_fim_ant;

  v_pend_atual := public.fn_financeiro_contas_pendentes_valor(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento);
  v_pend_anterior := public.fn_financeiro_contas_pendentes_valor(p_unidade_id, p_data_inicio_ant, p_data_fim_ant, p_transporte, p_categoria, p_forma_pagamento);

  v_a_receber_periodo := (v_pend_atual->>'a_receber_periodo')::numeric;
  v_vencido_total := (v_pend_atual->>'vencido_total')::numeric;
  v_vencido_count := (v_pend_atual->>'vencido_count')::bigint;

  v_faturamento_atual := v_recebido_atual + v_a_receber_periodo;
  v_faturamento_anterior := v_recebido_anterior + (v_pend_anterior->>'a_receber_periodo')::numeric;

  v_lucro_atual := v_recebido_atual - v_custos_atual;
  v_lucro_anterior := v_recebido_anterior - v_custos_anterior;

  v_inadimplencia_pct := case
    when (v_recebido_atual + v_vencido_total) > 0
      then round((v_vencido_total / (v_recebido_atual + v_vencido_total)) * 100, 1)
    else 0
  end;

  return jsonb_build_object(
    'faturamento_atual', v_faturamento_atual,
    'faturamento_anterior', v_faturamento_anterior,
    'recebido_atual', v_recebido_atual,
    'recebido_anterior', v_recebido_anterior,
    'a_receber_periodo', v_a_receber_periodo,
    'custos_atual', v_custos_atual,
    'custos_anterior', v_custos_anterior,
    'lucro_atual', v_lucro_atual,
    'lucro_anterior', v_lucro_anterior,
    'inadimplencia_pct', v_inadimplencia_pct,
    'vencido_total', v_vencido_total,
    'vencido_count', v_vencido_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Fluxo financeiro diario (grafico de linhas: receita / custo / lucro)
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_fluxo_diario(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns table (bucket date, receita numeric, custo numeric, lucro numeric)
language sql
stable
as $$
  with dias as (
    select generate_series(p_data_inicio, p_data_fim, interval '1 day')::date as bucket
  ),
  receitas as (
    select data_evento as bucket, sum(valor_servico + valor_transporte) as receita
    from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento)
    group by data_evento
  ),
  custos as (
    select d.data_despesa as bucket, sum(d.valor_total) as custo
    from public.despesas d
    where (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and d.data_despesa between p_data_inicio and p_data_fim
    group by d.data_despesa
  )
  select
    dias.bucket,
    coalesce(receitas.receita, 0) as receita,
    coalesce(custos.custo, 0) as custo,
    coalesce(receitas.receita, 0) - coalesce(custos.custo, 0) as lucro
  from dias
  left join receitas on receitas.bucket = dias.bucket
  left join custos on custos.bucket = dias.bucket
  order by dias.bucket;
$$;

-- ---------------------------------------------------------------------------
-- 7) Faturamento por linha de servico (grafico de barras horizontais)
--    Transporte e uma linha propria (soma de valor_transporte de TODAS as
--    categorias), diferente de fn_dashboard_faturamento_categoria que soma o
--    transporte dentro da categoria do proprio evento.
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_faturamento_por_linha(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns table (linha text, valor numeric)
language sql
stable
as $$
  with base as (
    select *
    from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento)
  ),
  por_categoria as (
    select categoria as linha, sum(valor_servico) as valor
    from base
    where categoria in ('banho', 'tosa', 'pacote', 'adicional')
    group by categoria
  ),
  transporte as (
    select 'transporte'::text as linha, coalesce(sum(valor_transporte), 0) as valor
    from base
    where valor_transporte > 0
  )
  select linha, valor
  from (
    select * from por_categoria
    union all
    select * from transporte
  ) t
  order by array_position(array['banho', 'tosa', 'pacote', 'adicional', 'transporte'], linha);
$$;

-- ---------------------------------------------------------------------------
-- 7.1) Formas de pagamento (donut), com filtro de linha de servico adicional —
--    fn_dashboard_formas_pagamento (0032) nao aceita esse filtro, entao a tela
--    Financeiro Geral precisa da propria versao para os 5 filtros baterem em
--    todos os blocos.
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_formas_pagamento(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns table (forma_pagamento text, valor numeric)
language sql
stable
as $$
  with partes as (
    select forma_pagamento_1 as forma, valor_pagamento_1 as valor
    from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento)
    where coalesce(valor_pagamento_1, 0) > 0
    union all
    select forma_pagamento_2 as forma, valor_pagamento_2 as valor
    from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento)
    where coalesce(valor_pagamento_2, 0) > 0
  )
  select
    public.fn_normaliza_forma_pagamento(forma) as forma_pagamento,
    sum(valor) as valor
  from partes
  group by 1
  order by valor desc;
$$;

-- ---------------------------------------------------------------------------
-- 8) Fidelidade: Pacotes recorrentes x Avulsos (adicionais contam como avulso)
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_fidelidade(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_pacotes_valor numeric;
  v_pacotes_contratos bigint;
  v_avulsos_valor numeric;
  v_avulsos_atendimentos bigint;
begin
  select
    coalesce(sum(valor_servico + valor_transporte) filter (where categoria = 'pacote'), 0),
    coalesce(count(distinct pacote_id) filter (where categoria = 'pacote'), 0),
    coalesce(sum(valor_servico + valor_transporte) filter (where categoria in ('banho', 'tosa', 'outro', 'adicional')), 0),
    coalesce(count(distinct agendamento_id) filter (where categoria in ('banho', 'tosa', 'outro', 'adicional')), 0)
  into v_pacotes_valor, v_pacotes_contratos, v_avulsos_valor, v_avulsos_atendimentos
  from public.fn_financeiro_eventos_filtrados(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento);

  return jsonb_build_object(
    'pacotes_valor', v_pacotes_valor,
    'pacotes_contratos', v_pacotes_contratos,
    'avulsos_valor', v_avulsos_valor,
    'avulsos_atendimentos', v_avulsos_atendimentos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Indices aditivos para as novas queries de pendencias
-- ---------------------------------------------------------------------------
create index if not exists idx_agendamentos_unidade_pago_data
  on public.agendamentos(unidade_id, pago, data_agendamento);

create index if not exists idx_pacotes_unidade_pago_data_inicio
  on public.pacotes(unidade_id, pago, data_inicio);
