-- Dashboard Gerencial: consolida "Ações do dia" numa única função.
--
-- O frontend original disparava 5 consultas separadas em paralelo
-- (crm_pet_retorno, marketing_pacotes_status, marketing_segmentos_clientes,
-- marketing_aniversariantes, fn_financeiro_contas_pendentes_valor) para
-- montar os 5 contadores. Em produção isso se somou às ~15 chamadas que o
-- Dashboard já dispara ao carregar, e causou "canceling statement due to
-- statement timeout" (57014) mesmo em funções pré-existentes (ex.:
-- fn_dashboard_kpis, que roda normalmente quando chamada isolada) — ou seja,
-- o gargalo é concorrência de conexões/pool, não lentidão de uma query
-- específica. Esta função resolve os 5 contadores em uma única chamada
-- (uma conexão, um round-trip) para reduzir a carga concorrente.
create or replace function public.fn_dashboard_acoes_do_dia(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_hoje date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_pets_atrasados bigint;
  v_pacotes_acabando bigint;
  v_nao_renovaram bigint;
  v_pendencias jsonb;
  v_pendencias_qtd bigint;
  v_pendencias_valor numeric;
  v_aniversariantes_semana bigint;
begin
  select count(distinct cliente_id)
    into v_pets_atrasados
  from public.crm_pet_retorno
  where status_retorno = 'atrasado'
    and (p_unidade_id is null or unidade_id = p_unidade_id);

  select count(distinct cliente_id)
    into v_pacotes_acabando
  from public.marketing_pacotes_status
  where pacote_ativo = true
    and saldo_calculado <= 2
    and (p_unidade_id is null or unidade_id = p_unidade_id);

  select count(*)
    into v_nao_renovaram
  from public.marketing_segmentos_clientes
  where seg_nao_renovaram = true
    and (p_unidade_id is null or unidade_id = p_unidade_id);

  select public.fn_financeiro_contas_pendentes_valor(p_unidade_id, p_data_inicio, p_data_fim, 'todos', 'todos', 'todas')
    into v_pendencias;
  v_pendencias_qtd := coalesce((v_pendencias ->> 'vencido_count')::bigint, 0);
  v_pendencias_valor := coalesce((v_pendencias ->> 'a_receber_periodo')::numeric, 0);

  with proximos_dias as (
    select extract(month from d)::int as mes, extract(day from d)::int as dia
    from generate_series(p_hoje, p_hoje + 6, interval '1 day') d
  )
  select count(*)
    into v_aniversariantes_semana
  from public.marketing_aniversariantes ma
  where (p_unidade_id is null or ma.unidade_id = p_unidade_id)
    and ma.data_nascimento is not null
    and exists (
      select 1 from proximos_dias pd
      where pd.mes = extract(month from ma.data_nascimento)::int
        and pd.dia = extract(day from ma.data_nascimento)::int
    );

  return jsonb_build_object(
    'pets_atrasados', v_pets_atrasados,
    'pacotes_acabando', v_pacotes_acabando,
    'clientes_nao_renovaram', v_nao_renovaram,
    'pendencias_qtd', v_pendencias_qtd,
    'pendencias_valor', v_pendencias_valor,
    'aniversariantes_semana', v_aniversariantes_semana
  );
end;
$$;

comment on function public.fn_dashboard_acoes_do_dia(bigint, date, date, date) is
  'Contadores de "Ações do dia" do Dashboard Gerencial em uma única chamada (reduz round-trips/concorrência vs. consultar as views separadamente). Reaproveita as mesmas views/funções já usadas pelos filtros rápidos de Clientes e pelo Financeiro Geral.';
