-- Central de Relatórios (Prompt 3/4): funções de apuração para os relatórios
-- que não têm equivalente pronto. Migration aditiva — nenhuma tabela/função
-- existente é alterada.
--
-- Os relatórios "Por profissional" (fn_comissoes_periodo, 0068), "Por
-- cliente" (fn_dashboard_top_clientes, 0070) e "Inadimplência"
-- (fn_financeiro_contas_pendentes_detalhe, 0065) reaproveitam funções já
-- existentes direto do frontend — não há função nova para eles aqui.

-- ---------------------------------------------------------------------------
-- 1) Atendimentos por serviço
--    Quantidade = toda sessão "principal" finalizada (avulso ou via pacote).
--    Faturamento = só a parte avulsa (fn_receita_eventos, origem='avulso');
--    sessões de pacote entram na quantidade mas com faturamento 0 aqui,
--    porque a receita do pacote já é contabilizada inteira na venda do
--    pacote (mesma regra de fn_receita_eventos) — somar de novo por sessão
--    inflaria o total. Quando o mesmo atendimento avulso tem mais de um
--    serviço "principal" (combo banho+tosa no mesmo agendamento), o valor do
--    atendimento é dividido igualmente entre os serviços envolvidos — o
--    sistema não grava preço por item principal separado (só os itens
--    "adicional" têm valor_cobrado próprio).
-- ---------------------------------------------------------------------------
create or replace function public.fn_relatorio_atendimentos_por_servico(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns table (servico text, qtd bigint, faturamento numeric)
language sql
stable
as $$
  with avulso_itens as (
    select
      s.nome as servico,
      ev.valor_servico,
      count(*) over (partition by a.id) as qtd_servicos_no_atendimento
    from public.agendamento_itens ai
    join public.agendamentos a on a.id = ai.agendamento_id
    join public.servicos s on s.id = ai.servico_id
    join public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte) ev
      on ev.agendamento_id = a.id and ev.origem = 'avulso'
    where ai.tipo = 'principal'
      and a.pacote_id is null
      and a.status = 'Finalizado'
  ),
  pacote_itens as (
    select s.nome as servico
    from public.agendamento_itens ai
    join public.agendamentos a on a.id = ai.agendamento_id
    join public.servicos s on s.id = ai.servico_id
    where ai.tipo = 'principal'
      and a.pacote_id is not null
      and a.status = 'Finalizado'
      and a.data_fim_real is not null
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
      and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim
  ),
  todos as (
    select servico, valor_servico / nullif(qtd_servicos_no_atendimento, 0) as faturamento from avulso_itens
    union all
    select servico, 0::numeric as faturamento from pacote_itens
  )
  select servico, count(*) as qtd, coalesce(sum(faturamento), 0) as faturamento
  from todos
  group by servico
  order by qtd desc;
$$;

comment on function public.fn_relatorio_atendimentos_por_servico(bigint, date, date, text) is
  'Contagem e faturamento de atendimentos finalizados por serviço. Sessões de pacote entram na contagem com faturamento 0 (receita já contada na venda do pacote). Atendimento avulso com mais de um serviço principal tem o valor dividido igualmente entre eles.';

-- ---------------------------------------------------------------------------
-- 2) Táxi Dog: viagens, receita e custo por unidade no período
--    "Buscas" e "entregas" não são campos distintos no sistema (só existe
--    agendamentos.tem_taxi) — o relatório mostra viagens/receita/custo sem
--    essa separação.
-- ---------------------------------------------------------------------------
create or replace function public.fn_relatorio_taxi(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  unidade_id bigint,
  unidade_nome text,
  viagens bigint,
  receita numeric,
  custo numeric,
  margem numeric
)
language sql
stable
as $$
  select
    u.id as unidade_id,
    u.nome as unidade_nome,
    count(a.id) as viagens,
    coalesce(sum(a.valor_transporte), 0) as receita,
    coalesce(sum(public.fn_custo_transporte_em(a.data_agendamento)), 0) as custo,
    coalesce(sum(a.valor_transporte), 0) - coalesce(sum(public.fn_custo_transporte_em(a.data_agendamento)), 0) as margem
  from public.unidades u
  left join public.agendamentos a
    on a.unidade_id = u.id
    and a.tem_taxi = true
    and a.status = 'Finalizado'
    and a.data_fim_real is not null
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim
  where p_unidade_id is null or u.id = p_unidade_id
  group by u.id, u.nome
  order by u.nome;
$$;

comment on function public.fn_relatorio_taxi(bigint, date, date) is
  'Viagens de táxi dog finalizadas no período, por unidade: receita (valor_transporte) e custo (fn_custo_servico de transporte, migration 0036). Sem distinção busca/entrega (não existe esse campo hoje).';

-- ---------------------------------------------------------------------------
-- 3) Pacotes do período: vendidos, concluídos, renovados, não renovados
--    "Renovado" = pacote comprado no período cujo cliente já tinha outro
--    pacote (não cancelado) esgotado (saldo 0) ou com data_fim anterior à
--    nova compra. "Não renovados" é um indicador de estado (não de período):
--    reaproveita marketing_segmentos_clientes.seg_nao_renovaram (0054), a
--    contagem atual de quem não renovou.
-- ---------------------------------------------------------------------------
create or replace function public.fn_relatorio_pacotes_periodo(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_vendidos_qtd bigint;
  v_vendidos_valor numeric;
  v_concluidos_qtd bigint;
  v_renovados_qtd bigint;
  v_nao_renovados_qtd bigint;
begin
  select count(*), coalesce(sum(valor_total), 0)
    into v_vendidos_qtd, v_vendidos_valor
  from public.pacotes p
  where p.pago = true
    and p.data_pagamento between p_data_inicio and p_data_fim
    and (p_unidade_id is null or p.unidade_id = p_unidade_id);

  select count(*)
    into v_concluidos_qtd
  from public.pacotes_com_saldo pcs
  where pcs.saldo_calculado = 0
    and (p_unidade_id is null or pcs.unidade_id = p_unidade_id)
    and exists (
      select 1 from public.agendamentos a
      where a.pacote_id = pcs.id
        and upper(a.status) = 'FINALIZADO'
        and coalesce(a.data_fim_real::date, a.data_agendamento) between p_data_inicio and p_data_fim
    );

  select count(distinct pp.id)
    into v_renovados_qtd
  from public.pacotes pp
  where pp.pago = true
    and pp.data_pagamento between p_data_inicio and p_data_fim
    and (p_unidade_id is null or pp.unidade_id = p_unidade_id)
    and exists (
      select 1 from public.pacotes_com_saldo anterior
      where anterior.cliente_id = pp.cliente_id
        and anterior.id <> pp.id
        and anterior.status not ilike '%cancel%'
        and coalesce(anterior.data_fim, anterior.data_pagamento) < pp.data_pagamento
        and (anterior.saldo_calculado = 0 or anterior.data_fim < pp.data_pagamento)
    );

  select count(*)
    into v_nao_renovados_qtd
  from public.marketing_segmentos_clientes msc
  where msc.seg_nao_renovaram = true
    and (p_unidade_id is null or msc.unidade_id = p_unidade_id);

  return jsonb_build_object(
    'vendidos_qtd', v_vendidos_qtd,
    'vendidos_valor', v_vendidos_valor,
    'concluidos_qtd', v_concluidos_qtd,
    'renovados_qtd', v_renovados_qtd,
    'nao_renovados_qtd', v_nao_renovados_qtd
  );
end;
$$;

comment on function public.fn_relatorio_pacotes_periodo(bigint, date, date) is
  'Pacotes vendidos/concluídos/renovados no período (ver regras no corpo da função) + não renovados como indicador de estado atual (seg_nao_renovaram, migration 0054).';

-- ---------------------------------------------------------------------------
-- 4) Cancelamentos (não há flag de no-show distinta de cancelamento hoje)
-- ---------------------------------------------------------------------------
create or replace function public.fn_relatorio_cancelamentos(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  agendamento_id bigint,
  data_agendamento date,
  cliente_nome text,
  pet_nome text,
  unidade_nome text,
  valor_total numeric,
  status text
)
language sql
stable
as $$
  select
    a.id as agendamento_id,
    a.data_agendamento,
    c.nome as cliente_nome,
    p.nome as pet_nome,
    u.nome as unidade_nome,
    coalesce(a.valor_total, 0) as valor_total,
    a.status
  from public.agendamentos a
  left join public.clientes c on c.id = a.cliente_id
  left join public.pets p on p.id = a.pet_id
  left join public.unidades u on u.id = a.unidade_id
  where a.status = 'Cancelado'
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and a.data_agendamento between p_data_inicio and p_data_fim
  order by a.data_agendamento desc;
$$;

comment on function public.fn_relatorio_cancelamentos(bigint, date, date) is
  'Lista de agendamentos cancelados no período. O sistema não distingue "no-show" de cancelamento comum hoje (só existe o status Cancelado) — relatório cobre os dois casos juntos.';

-- ---------------------------------------------------------------------------
-- 5) Despesas por categoria
-- ---------------------------------------------------------------------------
create or replace function public.fn_relatorio_despesas_por_categoria(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns table (categoria text, qtd bigint, valor numeric)
language sql
stable
as $$
  select
    coalesce(cd.nome, 'Sem categoria') as categoria,
    count(*) as qtd,
    sum(d.valor_total) as valor
  from public.despesas d
  left join public.categorias_despesa cd on cd.id = d.categoria_id
  where d.status = 'pago'
    and (p_unidade_id is null or d.unidade_id = p_unidade_id)
    and coalesce(d.data_pagamento, d.data_despesa) between p_data_inicio and p_data_fim
  group by cd.nome
  order by valor desc;
$$;

comment on function public.fn_relatorio_despesas_por_categoria(bigint, date, date) is
  'Despesas pagas por categoria no período (data_pagamento, com fallback para data_despesa quando data_pagamento é nula).';
