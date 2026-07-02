-- FASE: Dashboard Gerencial ("Visao geral da operacao")
-- Migration aditiva: nenhuma coluna/tabela existente e alterada em modo destrutivo.
--
-- 1) Cadastro de custo padrao por servico (nao existia nenhum registro de custo).
-- 2) Indices aditivos para as agregacoes por data que o dashboard usa.
-- 3) Funcoes de categorizacao (Banho/Tosa) reutilizadas por varias queries.
-- 4) Funcao central fn_receita_eventos: fonte unica de "o que conta como receita",
--    replicando a MESMA regra que components/Financeiro.tsx ja usa (avulso sem
--    pacote, venda de pacote pelo valor do pacote — nunca a soma dos servicos —
--    e extras pagos), incluindo o overlay de ajuste financeiro manual.
-- 5) Funcoes de agregacao por bloco do dashboard, todas fazendo GROUP BY no
--    banco (nenhuma soma feita trazendo linhas cruas para o front).
--
-- Observacao: NAO reaproveita `dashboard_cache`/`fn_refresh_dashboard_cache`
-- (migration 0030): aquela tabela alimenta o "Painel Geral" (Fase 4.3, tela
-- separada) e hoje esta vazia, alem de comparar status = 'Concluido', valor
-- que nao existe em agendamentos.status (os valores reais sao 'Agendado',
-- 'Em Andamento', 'Finalizado', 'Cancelado'). Este dashboard novo consulta as
-- tabelas operacionais diretamente para garantir que bate com o Financeiro.

-- ---------------------------------------------------------------------------
-- 1) Custo padrao por servico
-- ---------------------------------------------------------------------------
alter table public.servicos
  add column if not exists custo_padrao numeric(10,2) not null default 0;

comment on column public.servicos.custo_padrao is
  'Custo unitario padrao do servico (insumos/mao-de-obra), usado no bloco de custos do Dashboard Gerencial. Editavel na tela de configuracao de custos.';

-- ---------------------------------------------------------------------------
-- 2) Indices aditivos
-- ---------------------------------------------------------------------------
create index if not exists idx_agendamentos_unidade_data_fim_real
  on public.agendamentos(unidade_id, data_fim_real);

create index if not exists idx_agendamentos_unidade_data_pagamento_extra
  on public.agendamentos(unidade_id, data_pagamento_extra);

create index if not exists idx_pacotes_unidade_data_pagamento
  on public.pacotes(unidade_id, data_pagamento);

create index if not exists idx_clientes_unidade_created_at
  on public.clientes(unidade_id, created_at);

create index if not exists idx_agendamento_itens_agendamento_tipo
  on public.agendamento_itens(agendamento_id, tipo);

create index if not exists idx_financeiro_movimentos_agendamento_id
  on public.financeiro_movimentos(agendamento_id);

-- ---------------------------------------------------------------------------
-- 3) Categorizacao de servico por nome (nao existe coluna de categoria hoje)
-- ---------------------------------------------------------------------------
create or replace function public.fn_categoria_servico(p_nome text)
returns text
language sql
immutable
as $$
  select case
    when p_nome ilike '%tosa%' then 'tosa'
    when p_nome ilike '%banho%' then 'banho'
    else 'outro'
  end;
$$;

comment on function public.fn_categoria_servico(text) is
  'Classifica um nome de servico em banho/tosa/outro por padrao de texto (nao ha coluna de categoria em servicos).';

-- Categoria de um atendimento avulso com base nos itens "principal":
-- regra "Tosa prevalece" quando o atendimento combina Banho + Tosa no mesmo
-- agendamento (situacao comum na base real: dado observado em ~26% dos
-- atendimentos avulsos amostrados).
create or replace function public.fn_categoria_agendamento(p_agendamento_id bigint)
returns text
language sql
stable
as $$
  select coalesce(
    (
      select case
        when bool_or(public.fn_categoria_servico(s.nome) = 'tosa') then 'tosa'
        when bool_or(public.fn_categoria_servico(s.nome) = 'banho') then 'banho'
        else 'outro'
      end
      from public.agendamento_itens ai
      join public.servicos s on s.id = ai.servico_id
      where ai.agendamento_id = p_agendamento_id
        and ai.tipo = 'principal'
    ),
    'outro'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) Fonte unica de eventos de receita (avulso + pacote + adicional)
--    Filtra por data diretamente em cada ramo (colunas indexadas) para nao
--    obrigar um scan completo antes de aplicar o filtro de periodo.
-- ---------------------------------------------------------------------------
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

comment on function public.fn_receita_eventos(bigint, date, date, text) is
  'Fonte unica de eventos de receita (avulso/pacote/adicional) resolvendo o mesmo overlay de ajuste financeiro manual usado em Financeiro.tsx. Usada por todas as agregacoes do Dashboard Gerencial.';

-- ---------------------------------------------------------------------------
-- 5) Agregacoes por bloco (todas com GROUP BY / agregacao no banco)
-- ---------------------------------------------------------------------------

-- 5.1 KPIs do topo (periodo atual + periodo anterior, em uma unica chamada)
create or replace function public.fn_dashboard_kpis(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date,
  p_data_fim_ant date,
  p_transporte text default 'todos'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_fat_atual numeric;
  v_fat_ant numeric;
  v_banhos_atual bigint;
  v_banhos_ant bigint;
  v_tosas_atual bigint;
  v_tosas_ant bigint;
  v_pacotes_ativos_atual bigint;
  v_pacotes_ativos_ant bigint;
  v_novos_clientes_atual bigint;
  v_novos_clientes_ant bigint;
begin
  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_fat_atual
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte);

  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_fat_ant
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio_ant, p_data_fim_ant, p_transporte);

  -- Banhos/Tosas realizados: pela data de FINALIZACAO (data_fim_real),
  -- convertida para America/Sao_Paulo antes de comparar com o periodo.
  select
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'banho'),
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'tosa')
  into v_banhos_atual, v_tosas_atual
  from public.agendamentos a
  where a.status = 'Finalizado'
    and a.data_fim_real is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim;

  select
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'banho'),
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'tosa')
  into v_banhos_ant, v_tosas_ant
  from public.agendamentos a
  where a.status = 'Finalizado'
    and a.data_fim_real is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio_ant and p_data_fim_ant;

  -- Pacotes ativos: status atual (nao ha historico por data), com proxy de
  -- "existia ate o fim do periodo" via created_at. Mesma definicao de "Ativo"
  -- usada em components/Pacotes.tsx (nao cancelado/finalizado e com sessoes
  -- restantes), nao o texto cru de pacotes.status.
  select count(*)
    into v_pacotes_ativos_atual
  from public.pacotes p
  where (p_unidade_id is null or p.unidade_id = p_unidade_id)
    and p.status not ilike '%cancel%'
    and ((p.created_at at time zone 'America/Sao_Paulo')::date) <= p_data_fim
    and (p_transporte = 'todos'
      or (p_transporte = 'com' and coalesce(p.valor_transporte, 0) > 0)
      or (p_transporte = 'sem' and coalesce(p.valor_transporte, 0) = 0))
    and coalesce(p.qtd_sessoes, 0) > (
      select count(*) from public.agendamentos ag
      where ag.pacote_id = p.id and ag.status = 'Finalizado'
    );

  select count(*)
    into v_pacotes_ativos_ant
  from public.pacotes p
  where (p_unidade_id is null or p.unidade_id = p_unidade_id)
    and p.status not ilike '%cancel%'
    and ((p.created_at at time zone 'America/Sao_Paulo')::date) <= p_data_fim_ant
    and (p_transporte = 'todos'
      or (p_transporte = 'com' and coalesce(p.valor_transporte, 0) > 0)
      or (p_transporte = 'sem' and coalesce(p.valor_transporte, 0) = 0))
    and coalesce(p.qtd_sessoes, 0) > (
      select count(*) from public.agendamentos ag
      where ag.pacote_id = p.id and ag.status = 'Finalizado'
    );

  -- Novos clientes: filtro de transporte nao se aplica (cliente nao "tem taxi").
  select count(*)
    into v_novos_clientes_atual
  from public.clientes c
  where (p_unidade_id is null or c.unidade_id = p_unidade_id)
    and ((c.created_at at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim;

  select count(*)
    into v_novos_clientes_ant
  from public.clientes c
  where (p_unidade_id is null or c.unidade_id = p_unidade_id)
    and ((c.created_at at time zone 'America/Sao_Paulo')::date) between p_data_inicio_ant and p_data_fim_ant;

  return jsonb_build_object(
    'faturamento_atual', v_fat_atual,
    'faturamento_anterior', v_fat_ant,
    'banhos_atual', v_banhos_atual,
    'banhos_anterior', v_banhos_ant,
    'tosas_atual', v_tosas_atual,
    'tosas_anterior', v_tosas_ant,
    'pacotes_ativos_atual', v_pacotes_ativos_atual,
    'pacotes_ativos_anterior', v_pacotes_ativos_ant,
    'novos_clientes_atual', v_novos_clientes_atual,
    'novos_clientes_anterior', v_novos_clientes_ant
  );
end;
$$;

-- 5.2 Faturamento por dia/semana/mes (grafico de linha/area)
create or replace function public.fn_dashboard_faturamento_periodo(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_granularidade text default 'dia' -- 'dia' | 'semana' | 'mes'
)
returns table (bucket date, valor numeric)
language sql
stable
as $$
  select
    case p_granularidade
      when 'semana' then date_trunc('week', data_evento)::date
      when 'mes' then date_trunc('month', data_evento)::date
      else data_evento
    end as bucket,
    sum(valor_servico + valor_transporte) as valor
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
  group by 1
  order by 1;
$$;

-- 5.3 Faturamento por tipo de servico (donut: banho/tosa/pacote/adicional)
-- O valor de transporte de cada evento e somado dentro da propria categoria
-- do evento (nao existe fatia separada de "transporte" no pedido original),
-- assim a soma das fatias sempre bate com o total de faturamento.
create or replace function public.fn_dashboard_faturamento_categoria(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns table (categoria text, valor numeric)
language sql
stable
as $$
  select categoria, sum(valor_servico + valor_transporte) as valor
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
  group by categoria
  order by valor desc;
$$;

-- 5.4 Faturamento por unidade (grafico de barras)
create or replace function public.fn_dashboard_faturamento_unidade(
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns table (unidade_id bigint, unidade_nome text, valor numeric)
language sql
stable
as $$
  select u.id as unidade_id, u.nome as unidade_nome, coalesce(sum(ev.valor_servico + ev.valor_transporte), 0) as valor
  from public.unidades u
  left join public.fn_receita_eventos(null, p_data_inicio, p_data_fim, p_transporte) ev
    on ev.unidade_id = u.id
  group by u.id, u.nome
  order by u.nome;
$$;

-- Normaliza forma de pagamento em texto livre para um rotulo canonico.
-- Necessario porque o mesmo metodo e gravado com grafias diferentes por
-- telas distintas do sistema (ex.: "Cartão Crédito" vs "Crédito"), o que
-- sem essa normalizacao apareceria como fatias separadas no donut mesmo
-- sendo a mesma forma de pagamento. Sem extensao unaccent disponivel, o
-- acento e removido via translate() com o mesmo criterio de
-- normalizePaymentMethod() ja usado em components/Financeiro.tsx.
create or replace function public.fn_normaliza_forma_pagamento(p_forma text)
returns text
language sql
immutable
as $$
  select case
    when p_forma is null or trim(p_forma) = '' then 'Não informado'
    when lower(translate(p_forma,
      'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
      'aaaaeeiooouc AAAAEEIOOOUC'
    )) like '%pix%' then 'Pix'
    when lower(translate(p_forma,
      'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
      'aaaaeeiooouc AAAAEEIOOOUC'
    )) like '%dinheiro%' then 'Dinheiro'
    when lower(translate(p_forma,
      'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
      'aaaaeeiooouc AAAAEEIOOOUC'
    )) like '%debito%' then 'Débito'
    when lower(translate(p_forma,
      'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
      'aaaaeeiooouc AAAAEEIOOOUC'
    )) like '%credito%' then 'Crédito'
    when lower(translate(p_forma,
      'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ',
      'aaaaeeiooouc AAAAEEIOOOUC'
    )) like '%transferencia%' then 'Transferência'
    else initcap(trim(p_forma))
  end;
$$;

-- 5.5 Formas de pagamento (donut) — cada parte de um split conta separado.
create or replace function public.fn_dashboard_formas_pagamento(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns table (forma_pagamento text, valor numeric)
language sql
stable
as $$
  with partes as (
    select forma_pagamento_1 as forma, valor_pagamento_1 as valor
    from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
    where coalesce(valor_pagamento_1, 0) > 0
    union all
    select forma_pagamento_2 as forma, valor_pagamento_2 as valor
    from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte)
    where coalesce(valor_pagamento_2, 0) > 0
  )
  select
    public.fn_normaliza_forma_pagamento(forma) as forma_pagamento,
    sum(valor) as valor
  from partes
  group by 1
  order by valor desc;
$$;

-- 5.6 Custos com servicos de pacotes (por tipo de servico realizado via pacote)
create or replace function public.fn_dashboard_custos_pacotes(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns table (servico text, qtd bigint, custo_unitario numeric, custo_total numeric)
language sql
stable
as $$
  select
    s.nome as servico,
    count(*) as qtd,
    max(s.custo_padrao) as custo_unitario,
    count(*) * max(s.custo_padrao) as custo_total
  from public.agendamentos a
  join public.agendamento_itens ai on ai.agendamento_id = a.id and ai.tipo = 'principal'
  join public.servicos s on s.id = ai.servico_id
  where a.pacote_id is not null
    and a.status = 'Finalizado'
    and a.data_fim_real is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim
  group by s.nome
  order by custo_total desc;
$$;

-- 5.7 Transporte: apenas o que e real hoje (sem custo/motorista cadastrado).
-- "faturamento_transporte" e o valor cobrado do cliente (unico dado real
-- disponivel); nao ha custo de motorista/viagem no banco ainda.
create or replace function public.fn_dashboard_transporte(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_pets_transportados bigint;
  v_faturamento_transporte numeric;
begin
  select count(distinct a.id), coalesce(sum(a.valor_transporte), 0)
    into v_pets_transportados, v_faturamento_transporte
  from public.agendamentos a
  where a.tem_taxi = true
    and a.status = 'Finalizado'
    and a.data_fim_real is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim;

  return jsonb_build_object(
    'pets_transportados', v_pets_transportados,
    'faturamento_transporte', v_faturamento_transporte
  );
end;
$$;

-- 5.8 Top servicos adicionais
create or replace function public.fn_dashboard_top_adicionais(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_limite int default 10
)
returns table (servico text, qtd bigint, faturamento numeric)
language sql
stable
as $$
  select
    coalesce(s.nome, ai.descricao, 'Adicional') as servico,
    count(*) as qtd,
    sum(ai.valor_cobrado) as faturamento
  from public.agendamentos a
  join public.agendamento_itens ai on ai.agendamento_id = a.id and ai.tipo = 'adicional'
  left join public.servicos s on s.id = ai.servico_id
  where a.status_pagamento_extra = 'PAGO'
    and a.data_pagamento_extra is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and a.data_pagamento_extra between p_data_inicio and p_data_fim
  group by coalesce(s.nome, ai.descricao, 'Adicional')
  order by qtd desc
  limit p_limite;
$$;

-- 5.9 Cards de agendamentos (contagem por status no periodo, por data_agendamento)
create or replace function public.fn_dashboard_agendamentos_cards(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_agendados bigint;
  v_concluidos bigint;
  v_cancelados bigint;
  v_total bigint;
begin
  select
    count(*) filter (where a.status in ('Agendado', 'Em Andamento')),
    count(*) filter (where a.status = 'Finalizado'),
    count(*) filter (where a.status = 'Cancelado'),
    count(*)
  into v_agendados, v_concluidos, v_cancelados, v_total
  from public.agendamentos a
  where (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and a.data_agendamento between p_data_inicio and p_data_fim;

  return jsonb_build_object(
    'agendados', v_agendados,
    'concluidos', v_concluidos,
    'cancelados', v_cancelados,
    'taxa_conclusao', case when v_total > 0 then round((v_concluidos::numeric / v_total) * 100, 1) else 0 end
  );
end;
$$;
