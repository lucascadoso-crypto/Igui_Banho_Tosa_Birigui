-- Dashboard Gerencial: consolida as chamadas da 1a onda (8 RPCs) e da 2a
-- onda (7 RPCs) em duas funcoes-bundle, cada uma com 1 unico round-trip ao
-- banco.
--
-- Migration puramente aditiva: nenhuma funcao/tabela existente e alterada.
-- As funcoes fn_dashboard_* originais continuam existindo exatamente como
-- estao e sendo chamadas (agora de dentro destas funcoes-bundle, via SQL,
-- nao mais via rede) -- cada sub-funcao preserva exatamente sua logica e
-- calculo original; estas funcoes novas so agrupam os resultados num unico
-- jsonb.
--
-- Contexto (auditoria de performance/estabilidade, FASE 0/2, 2026-11-25):
-- o Dashboard Gerencial disparava ~15 RPCs concorrentes ao carregar, o que
-- esgotava o pool de conexoes e estourava o statement_timeout de 8s do role
-- "authenticated" (erro 57014), mesmo em funcoes isoladamente rapidas -- o
-- mesmo padrao de bug ja corrigido para "Acoes do Dia" na migration 0072
-- (fn_dashboard_acoes_do_dia), aplicado aqui ao restante do Dashboard.

-- ---------------------------------------------------------------------------
-- 1) Bundle principal (substitui a 1a onda: kpis, faturamento por categoria/
--    unidade, formas de pagamento, custos de pacotes, transporte, top
--    adicionais e cards de agendamentos -- 8 chamadas em 1).
-- ---------------------------------------------------------------------------
create or replace function public.fn_dashboard_bundle_principal(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date,
  p_data_fim_ant date,
  p_transporte text default 'todos',
  p_limite_adicionais int default 10
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_faturamento_categoria jsonb;
  v_faturamento_unidade jsonb;
  v_formas_pagamento jsonb;
  v_custos_pacotes jsonb;
  v_top_adicionais jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', valor)), '[]'::jsonb)
    into v_faturamento_categoria
  from public.fn_dashboard_faturamento_categoria(p_unidade_id, p_data_inicio, p_data_fim, p_transporte);

  select coalesce(jsonb_agg(jsonb_build_object('unidade_id', unidade_id, 'unidade_nome', unidade_nome, 'valor', valor)), '[]'::jsonb)
    into v_faturamento_unidade
  from public.fn_dashboard_faturamento_unidade(p_data_inicio, p_data_fim, p_transporte);

  select coalesce(jsonb_agg(jsonb_build_object('forma_pagamento', forma_pagamento, 'valor', valor)), '[]'::jsonb)
    into v_formas_pagamento
  from public.fn_dashboard_formas_pagamento(p_unidade_id, p_data_inicio, p_data_fim, p_transporte);

  select coalesce(jsonb_agg(jsonb_build_object('servico', servico, 'qtd', qtd, 'custo_unitario', custo_unitario, 'custo_total', custo_total)), '[]'::jsonb)
    into v_custos_pacotes
  from public.fn_dashboard_custos_pacotes(p_unidade_id, p_data_inicio, p_data_fim, p_transporte);

  select coalesce(jsonb_agg(jsonb_build_object('servico', servico, 'qtd', qtd, 'faturamento', faturamento)), '[]'::jsonb)
    into v_top_adicionais
  from public.fn_dashboard_top_adicionais(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_limite_adicionais);

  return jsonb_build_object(
    'kpis', public.fn_dashboard_kpis(p_unidade_id, p_data_inicio, p_data_fim, p_data_inicio_ant, p_data_fim_ant, p_transporte),
    'faturamento_categoria', v_faturamento_categoria,
    'faturamento_unidade', v_faturamento_unidade,
    'formas_pagamento', v_formas_pagamento,
    'custos_pacotes', v_custos_pacotes,
    'transporte', public.fn_dashboard_transporte(p_unidade_id, p_data_inicio, p_data_fim),
    'top_adicionais', v_top_adicionais,
    'agendamentos_cards', public.fn_dashboard_agendamentos_cards(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
  );
end;
$$;

comment on function public.fn_dashboard_bundle_principal(bigint, date, date, date, date, text, int) is
  'Combina em 1 round-trip as 8 chamadas da 1a onda do Dashboard Gerencial (fn_dashboard_kpis, faturamento_categoria, faturamento_unidade, formas_pagamento, custos_pacotes, transporte, top_adicionais, agendamentos_cards). Cada sub-funcao mantem exatamente sua logica original; esta funcao so agrupa os resultados.';

-- ---------------------------------------------------------------------------
-- 2) Bundle complementar (substitui a 2a onda: kpis complementares,
--    agendamentos do periodo anterior, ocupacao atual/anterior, acoes do
--    dia, top clientes e top racas -- 7 chamadas em 1).
-- ---------------------------------------------------------------------------
create or replace function public.fn_dashboard_bundle_complementar(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date,
  p_data_fim_ant date,
  p_transporte text default 'todos',
  p_hoje date default null,
  p_limite_top int default 10
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_ocupacao_atual jsonb;
  v_ocupacao_anterior jsonb;
  v_top_clientes jsonb;
  v_top_racas jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'dia_semana', dia_semana, 'capacidade_dia', capacidade_dia, 'dias_no_periodo', dias_no_periodo,
      'capacidade_total', capacidade_total, 'agendados', agendados, 'percentual', percentual
    )), '[]'::jsonb)
    into v_ocupacao_atual
  from public.fn_dashboard_ocupacao_periodo(p_unidade_id, p_data_inicio, p_data_fim);

  select coalesce(jsonb_agg(jsonb_build_object(
      'dia_semana', dia_semana, 'capacidade_dia', capacidade_dia, 'dias_no_periodo', dias_no_periodo,
      'capacidade_total', capacidade_total, 'agendados', agendados, 'percentual', percentual
    )), '[]'::jsonb)
    into v_ocupacao_anterior
  from public.fn_dashboard_ocupacao_periodo(p_unidade_id, p_data_inicio_ant, p_data_fim_ant);

  select coalesce(jsonb_agg(jsonb_build_object('cliente_id', cliente_id, 'cliente_nome', cliente_nome, 'qtd_eventos', qtd_eventos, 'faturamento', faturamento)), '[]'::jsonb)
    into v_top_clientes
  from public.fn_dashboard_top_clientes(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_limite_top);

  select coalesce(jsonb_agg(jsonb_build_object('raca', raca, 'qtd', qtd)), '[]'::jsonb)
    into v_top_racas
  from public.fn_dashboard_top_racas(p_unidade_id, p_data_inicio, p_data_fim, p_limite_top);

  return jsonb_build_object(
    'kpis_complementares', public.fn_dashboard_kpis_complementares(p_unidade_id, p_data_inicio, p_data_fim, p_data_inicio_ant, p_data_fim_ant, p_transporte),
    'agendamentos_cards_anterior', public.fn_dashboard_agendamentos_cards(p_unidade_id, p_data_inicio_ant, p_data_fim_ant, p_transporte),
    'ocupacao_atual', v_ocupacao_atual,
    'ocupacao_anterior', v_ocupacao_anterior,
    'acoes_do_dia', case when p_hoje is null then null else public.fn_dashboard_acoes_do_dia(p_unidade_id, p_data_inicio, p_data_fim, p_hoje) end,
    'top_clientes', v_top_clientes,
    'top_racas', v_top_racas
  );
end;
$$;

comment on function public.fn_dashboard_bundle_complementar(bigint, date, date, date, date, text, date, int) is
  'Combina em 1 round-trip as 7 chamadas da 2a onda do Dashboard Gerencial (fn_dashboard_kpis_complementares, agendamentos_cards do periodo anterior, ocupacao atual/anterior, fn_dashboard_acoes_do_dia, top_clientes, top_racas). Cada sub-funcao mantem exatamente sua logica original; esta funcao so agrupa os resultados.';
