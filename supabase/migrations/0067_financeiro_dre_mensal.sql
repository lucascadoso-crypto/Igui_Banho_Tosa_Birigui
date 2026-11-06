-- Financeiro (Prompt 2/4): DRE simplificado mensal.
--
-- Receita por linha usa fn_receita_eventos (regime de COMPETENCIA por
-- sessao, migration 0055) -- a mesma fonte do Dashboard Gerencial, nao a
-- fn_receita_eventos_caixa do Financeiro Geral (migration 0056, regime de
-- CAIXA). Decisao deliberada: o prompt pede "a mesma base de receita do
-- dashboard". Consequencia aceita: o DRE bate 100% com o Dashboard
-- Gerencial, e bate com o Financeiro Geral em avulso/taxi/extras, mas NAO
-- bate com o Financeiro Geral na linha de pacotes (ele conta o pacote por
-- sessao prestada, o Financeiro Geral conta o valor cheio na data do
-- pagamento) -- os dois regimes sao expostos lado a lado no frontend, nao
-- escondidos.
--
-- "Receita bruta" = receita liquida (valor_servico, ja com desconto
-- aplicado) + desconto (agendamentos.valor_desconto, migration 0025) + taxi.
-- Taxas de cartao: nao ha nenhuma config de taxa de cartao no sistema hoje
-- -- a linha fica em 0 em vez de criar uma config nova nao pedida.
-- Custos diretos: fn_custo_servico_em (por item "principal" de atendimento
-- avulso finalizado, mesma contagem de fn_custo_mao_obra_sugerido da
-- migration 0036) + fn_custo_transporte_em por viagem finalizada com taxi.
-- Despesas fixas: despesas pagas com tipo='fixo' (inclui folha de
-- pagamento, que e lancada como despesa fixa -- migration 0036), por
-- categoria.

create or replace function public.fn_financeiro_dre_mensal(
  p_unidade_id bigint,
  p_ano_mes date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_mes_inicio date := date_trunc('month', p_ano_mes)::date;
  v_mes_fim date := (date_trunc('month', p_ano_mes) + interval '1 month' - interval '1 day')::date;
  v_mes_ant_inicio date := (date_trunc('month', p_ano_mes) - interval '1 month')::date;
  v_mes_ant_fim date := (date_trunc('month', p_ano_mes) - interval '1 day')::date;

  v_linhas jsonb;
  v_linhas_ant jsonb;

  v_receita_liquida numeric;
  v_taxi numeric;
  v_descontos numeric;
  v_receita_bruta numeric;

  v_receita_liquida_ant numeric;
  v_taxi_ant numeric;
  v_descontos_ant numeric;
  v_receita_bruta_ant numeric;

  v_custos_diretos numeric;
  v_custos_diretos_ant numeric;
  v_margem_contribuicao numeric;
  v_margem_contribuicao_ant numeric;

  v_despesas_categorias jsonb;
  v_despesas_fixas numeric;
  v_despesas_fixas_ant numeric;

  v_resultado_operacional numeric;
  v_resultado_operacional_ant numeric;
begin
  -- Receita liquida + taxi (regime de competencia, mesma fonte do Dashboard).
  select coalesce(sum(valor_servico), 0), coalesce(sum(valor_transporte), 0)
    into v_receita_liquida, v_taxi
  from public.fn_receita_eventos(p_unidade_id, v_mes_inicio, v_mes_fim, 'todos');

  select coalesce(sum(valor_servico), 0), coalesce(sum(valor_transporte), 0)
    into v_receita_liquida_ant, v_taxi_ant
  from public.fn_receita_eventos(p_unidade_id, v_mes_ant_inicio, v_mes_ant_fim, 'todos');

  -- Receita bruta por linha (banho/tosa/pacote/adicional/outro) + taxi como linha propria.
  select coalesce(jsonb_agg(jsonb_build_object('linha', categoria, 'valor', valor) order by valor desc), '[]'::jsonb)
    into v_linhas
  from (
    select categoria, sum(valor_servico) as valor
    from public.fn_receita_eventos(p_unidade_id, v_mes_inicio, v_mes_fim, 'todos')
    group by categoria
  ) l;
  if v_taxi > 0 then
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object('linha', 'taxi', 'valor', v_taxi));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('linha', categoria, 'valor', valor) order by valor desc), '[]'::jsonb)
    into v_linhas_ant
  from (
    select categoria, sum(valor_servico) as valor
    from public.fn_receita_eventos(p_unidade_id, v_mes_ant_inicio, v_mes_ant_fim, 'todos')
    group by categoria
  ) l;
  if v_taxi_ant > 0 then
    v_linhas_ant := v_linhas_ant || jsonb_build_array(jsonb_build_object('linha', 'taxi', 'valor', v_taxi_ant));
  end if;

  -- Descontos (so existem em agendamentos avulsos).
  select coalesce(sum(a.valor_desconto), 0) into v_descontos
  from public.agendamentos a
  where a.pago = true and a.pacote_id is null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and a.data_agendamento between v_mes_inicio and v_mes_fim;

  select coalesce(sum(a.valor_desconto), 0) into v_descontos_ant
  from public.agendamentos a
  where a.pago = true and a.pacote_id is null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and a.data_agendamento between v_mes_ant_inicio and v_mes_ant_fim;

  v_receita_bruta := v_receita_liquida + v_taxi + v_descontos;
  v_receita_bruta_ant := v_receita_liquida_ant + v_taxi_ant + v_descontos_ant;

  -- Custos diretos: custo do servico por atendimento avulso principal finalizado + custo de transporte por viagem finalizada.
  select coalesce(sum(public.fn_custo_servico_em(ai.servico_id, coalesce(a.data_fim_real::date, a.data_agendamento))), 0)
    into v_custos_diretos
  from public.agendamento_itens ai
  join public.agendamentos a on a.id = ai.agendamento_id
  where ai.tipo = 'principal'
    and a.status = 'Finalizado'
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and coalesce(a.data_fim_real::date, a.data_agendamento) between v_mes_inicio and v_mes_fim;

  v_custos_diretos := v_custos_diretos + coalesce((
    select sum(public.fn_custo_transporte_em(a.data_agendamento))
    from public.agendamentos a
    where a.tem_taxi = true
      and a.status = 'Finalizado'
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_agendamento between v_mes_inicio and v_mes_fim
  ), 0);

  select coalesce(sum(public.fn_custo_servico_em(ai.servico_id, coalesce(a.data_fim_real::date, a.data_agendamento))), 0)
    into v_custos_diretos_ant
  from public.agendamento_itens ai
  join public.agendamentos a on a.id = ai.agendamento_id
  where ai.tipo = 'principal'
    and a.status = 'Finalizado'
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and coalesce(a.data_fim_real::date, a.data_agendamento) between v_mes_ant_inicio and v_mes_ant_fim;

  v_custos_diretos_ant := v_custos_diretos_ant + coalesce((
    select sum(public.fn_custo_transporte_em(a.data_agendamento))
    from public.agendamentos a
    where a.tem_taxi = true
      and a.status = 'Finalizado'
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_agendamento between v_mes_ant_inicio and v_mes_ant_fim
  ), 0);

  v_margem_contribuicao := v_receita_liquida - v_custos_diretos;
  v_margem_contribuicao_ant := v_receita_liquida_ant - v_custos_diretos_ant;

  -- Despesas fixas por categoria (inclui folha de pagamento, lancada como despesa fixa).
  select
    coalesce(jsonb_agg(jsonb_build_object('categoria', categoria_nome, 'valor', valor) order by valor desc), '[]'::jsonb),
    coalesce(sum(valor), 0)
    into v_despesas_categorias, v_despesas_fixas
  from (
    select coalesce(c.nome, 'Sem categoria') as categoria_nome, sum(d.valor_total) as valor
    from public.despesas d
    left join public.categorias_despesa c on c.id = d.categoria_id
    where d.status = 'pago' and d.tipo = 'fixo'
      and (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and d.data_pagamento between v_mes_inicio and v_mes_fim
    group by c.nome
  ) dc;

  select coalesce(sum(d.valor_total), 0) into v_despesas_fixas_ant
  from public.despesas d
  where d.status = 'pago' and d.tipo = 'fixo'
    and (p_unidade_id is null or d.unidade_id = p_unidade_id)
    and d.data_pagamento between v_mes_ant_inicio and v_mes_ant_fim;

  v_resultado_operacional := v_margem_contribuicao - v_despesas_fixas;
  v_resultado_operacional_ant := v_margem_contribuicao_ant - v_despesas_fixas_ant;

  return jsonb_build_object(
    'mes_inicio', v_mes_inicio,
    'mes_fim', v_mes_fim,
    'receita_bruta_linhas', v_linhas,
    'descontos', v_descontos,
    'taxas_cartao', 0,
    'receita_bruta_total', v_receita_bruta,
    'receita_liquida', v_receita_liquida,
    'custos_diretos', v_custos_diretos,
    'margem_contribuicao', v_margem_contribuicao,
    'despesas_fixas_categorias', v_despesas_categorias,
    'despesas_fixas_total', v_despesas_fixas,
    'resultado_operacional', v_resultado_operacional,
    'anterior', jsonb_build_object(
      'receita_bruta_linhas', v_linhas_ant,
      'descontos', v_descontos_ant,
      'taxas_cartao', 0,
      'receita_bruta_total', v_receita_bruta_ant,
      'receita_liquida', v_receita_liquida_ant,
      'custos_diretos', v_custos_diretos_ant,
      'margem_contribuicao', v_margem_contribuicao_ant,
      'despesas_fixas_total', v_despesas_fixas_ant,
      'resultado_operacional', v_resultado_operacional_ant
    )
  );
end;
$$;

comment on function public.fn_financeiro_dre_mensal(bigint, date) is
  'DRE simplificado mensal: receita bruta por linha (fn_receita_eventos, regime de competencia -- mesma base do Dashboard Gerencial), descontos, custos diretos (fn_custo_servico_em/fn_custo_transporte_em), despesas fixas por categoria, comparacao com o mes anterior. Nao bate com o Financeiro Geral na linha de pacotes por desenho (regimes diferentes -- ver migration 0056).';
