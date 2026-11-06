-- Financeiro (Prompt 2/4): Contas a Pagar com calendario (proximos 30 dias).
--
-- Fonte: despesas pendentes (migration 0036) + contas_fixas_recorrentes
-- ainda nao materializadas no mes dentro da janela pedida (projecao --
-- fn_gerar_despesas_recorrentes so roda quando a tela Gastos e aberta, e a
-- tela de Contas a Pagar pode ser aberta sem isso ter acontecido para o mes
-- seguinte). Nao duplica fn_gerar_despesas_recorrentes: so projeta o que
-- ainda nao existe como despesa, pela mesma regra (dia_vencimento da conta
-- fixa), e some automaticamente da projecao assim que a despesa real for
-- gerada (bate por conta_recorrente_id + mes).

create or replace function public.fn_financeiro_contas_a_pagar_calendario(
  p_unidade_id bigint,
  p_dias_a_frente int default 30
)
returns table (
  origem text, -- 'despesa' | 'conta_fixa_projetada'
  referencia_id bigint,
  categoria_nome text,
  descricao text,
  vencimento date,
  valor numeric,
  vencida boolean
)
language sql
stable
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as v
  ),
  janela as (
    select hoje.v as inicio, hoje.v + p_dias_a_frente as fim from hoje
  ),
  pendentes as (
    select
      'despesa'::text as origem,
      d.id as referencia_id,
      coalesce(c.nome, 'Sem categoria') as categoria_nome,
      d.nome_item as descricao,
      d.data_vencimento as vencimento,
      d.valor_total as valor
    from public.despesas d
    left join public.categorias_despesa c on c.id = d.categoria_id
    where d.status = 'pendente'
      and (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and d.data_vencimento is not null
      and d.data_vencimento <= (select fim from janela)
  ),
  meses_janela as (
    select generate_series(
      date_trunc('month', (select inicio from janela)),
      date_trunc('month', (select fim from janela)),
      interval '1 month'
    ) as ref
  ),
  projetadas as (
    select
      'conta_fixa_projetada'::text as origem,
      cfr.id as referencia_id,
      coalesce(c.nome, 'Sem categoria') as categoria_nome,
      cfr.descricao,
      make_date(extract(year from mj.ref)::int, extract(month from mj.ref)::int, cfr.dia_vencimento) as vencimento,
      cfr.valor_previsto as valor
    from public.contas_fixas_recorrentes cfr
    left join public.categorias_despesa c on c.id = cfr.categoria_id
    cross join meses_janela mj
    where cfr.ativo = true
      and (p_unidade_id is null or cfr.unidade_id = p_unidade_id)
      and make_date(extract(year from mj.ref)::int, extract(month from mj.ref)::int, cfr.dia_vencimento)
            between (select inicio from janela) and (select fim from janela)
      and not exists (
        select 1 from public.despesas d2
        where d2.conta_recorrente_id = cfr.id
          and date_trunc('month', d2.data_vencimento) = date_trunc('month',
            make_date(extract(year from mj.ref)::int, extract(month from mj.ref)::int, cfr.dia_vencimento))
      )
  ),
  todas as (
    select * from pendentes
    union all
    select * from projetadas
  )
  select
    t.origem, t.referencia_id, t.categoria_nome, t.descricao, t.vencimento, t.valor,
    (t.vencimento < (select v from hoje)) as vencida
  from todas t
  order by t.vencimento asc;
$$;

comment on function public.fn_financeiro_contas_a_pagar_calendario(bigint, int) is
  'Contas a pagar nos proximos N dias: despesas pendentes com data_vencimento + contas_fixas_recorrentes ativas ainda nao materializadas no mes dentro da janela. Usado pela aba Contas a Pagar do Financeiro Geral e pela projecao de caixa.';

-- ---------------------------------------------------------------------------
-- Projecao de caixa (proximos N dias): reaproveita fn_financeiro_eventos_
-- pendentes (recebiveis) e fn_financeiro_contas_a_pagar_calendario (pagaveis)
-- -- nao duplica nenhuma das duas regras. Pendencias ja vencidas (recebiveis
-- ou pagaveis) sao jogadas no dia de hoje (bucket 0), ja que podem entrar/
-- sair em qualquer dia a partir de agora; o "saldo atual" (ponto de partida
-- da linha) fica a cargo do frontend, que ja tem esse numero pronto via
-- fn_financeiro_kpis (lucro do periodo filtrado) -- aqui so devolvemos o
-- delta diario (recebido/pago previstos), e o frontend acumula.
-- ---------------------------------------------------------------------------
create or replace function public.fn_financeiro_projecao_caixa(
  p_unidade_id bigint,
  p_dias_a_frente int default 30
)
returns table (
  bucket date,
  recebido_previsto numeric,
  pago_previsto numeric
)
language sql
stable
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as v
  ),
  dias as (
    select generate_series(0, p_dias_a_frente) as n
  ),
  calendario as (
    select (select v from hoje) + d.n as bucket
    from dias d
  ),
  receber as (
    select
      case when ep.vencido then (select v from hoje) else ep.data_referencia end as bucket,
      ep.valor
    from public.fn_financeiro_eventos_pendentes(
      p_unidade_id, '2000-01-01'::date, (select v from hoje) + p_dias_a_frente, 'todos', 'todos', 'todas'
    ) ep
  ),
  pagar as (
    select
      case when cal.vencida then (select v from hoje) else cal.vencimento end as bucket,
      cal.valor
    from public.fn_financeiro_contas_a_pagar_calendario(p_unidade_id, p_dias_a_frente) cal
  )
  select
    c.bucket,
    coalesce((select sum(r.valor) from receber r where r.bucket = c.bucket), 0) as recebido_previsto,
    coalesce((select sum(p.valor) from pagar p where p.bucket = c.bucket), 0) as pago_previsto
  from calendario c
  order by c.bucket;
$$;

comment on function public.fn_financeiro_projecao_caixa(bigint, int) is
  'Delta diario de caixa projetado (recebiveis previstos - pagaveis previstos) para os proximos N dias, a partir de fn_financeiro_eventos_pendentes e fn_financeiro_contas_a_pagar_calendario. O frontend acumula a partir do saldo do periodo filtrado (fn_financeiro_kpis) para montar a linha de projecao.';
