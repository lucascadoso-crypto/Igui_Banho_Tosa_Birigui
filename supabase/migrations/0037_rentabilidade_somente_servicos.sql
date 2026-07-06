-- Rentabilidade: foco exclusivo em servicos (remove a analise por pacote da
-- tela). Migration aditiva: apenas cria/substitui funcoes (create or replace
-- function / create function), nenhuma tabela ou coluna e alterada, nada e
-- apagado. fn_rentabilidade_pacotes (migration 0035) permanece no banco sem
-- uso, conforme pedido do dono do produto ("nao deletar nada do banco").
--
-- Decisoes confirmadas com o dono do produto:
--  1) "Custo nao cadastrado" = o unico registro de custo do servico e o
--     backfill automatico (vigente_desde = 01/01/2000) E esse valor e 0 ou
--     igual ao preco do servico. Qualquer edicao real feita pela tela de
--     Custos (vigente_desde > 01/01/2000) conta como cadastrado de verdade,
--     mesmo que o valor coincida com o preco.
--  2) Itens de ajuste de valor (nome comecando com "Diferenca...", cadastrados
--     como servico so para cobrar diferenca de preco) ficam de fora da
--     analise de Rentabilidade por Servico.
--  3) Sessoes de pacote entram na tabela de servicos usando o valor efetivo
--     por sessao (valor do pacote / qtd_sessoes) como "preco" — nunca a soma
--     dos precos avulsos — misturadas na mesma linha do servico, com colunas
--     extras de quantidade avulsa vs via pacote para transparencia.

-- ---------------------------------------------------------------------------
-- 1) Helper: o custo deste servico foi realmente configurado pela tela nova?
-- ---------------------------------------------------------------------------
create or replace function public.fn_custo_servico_esta_cadastrado(p_servico_id bigint)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.servico_custo_historico h
    join public.servicos s on s.id = h.servico_id
    where h.servico_id = p_servico_id
      and (
        h.vigente_desde > date '2000-01-01'
        or (h.vigente_desde = date '2000-01-01' and h.custo_total <> 0 and h.custo_total <> s.preco_base)
      )
  );
$$;

comment on function public.fn_custo_servico_esta_cadastrado(bigint) is
  'Um servico so conta como "custo cadastrado" se alguem editou pela tela de Custos dos Servicos (vigente_desde > 01/01/2000), ou se o registro de backfill automatico ja tinha um valor diferente de 0 e diferente do preco do servico. Usado para nao deixar a Rentabilidade tratar custo=0 ou custo=preco (valores nunca revisados) como dado real.';

-- ---------------------------------------------------------------------------
-- 2) Rentabilidade por servico: avulso + adicional + sessoes de pacote (pelo
--    valor efetivo por sessao), excluindo itens de ajuste de valor
--    ("Diferenca..."), com flag de custo cadastrado e split avulsa/pacote.
--    Precisa de DROP antes: o formato de retorno mudou (colunas novas) e o
--    Postgres nao permite "create or replace" trocar o RETURNS TABLE de uma
--    funcao existente. Nenhuma tabela/dado e afetado por este DROP.
-- ---------------------------------------------------------------------------
drop function if exists public.fn_rentabilidade_servicos(bigint, date, date);

create function public.fn_rentabilidade_servicos(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  servico_id bigint,
  servico text,
  qtd bigint,
  qtd_avulsa bigint,
  qtd_pacote bigint,
  preco_medio numeric,
  custo_medio numeric,
  receita_total numeric,
  custo_total numeric,
  lucro_total numeric,
  custo_cadastrado boolean
)
language sql
stable
as $$
  with qtd_principal as (
    select agendamento_id, count(*) as qtd_itens
    from public.agendamento_itens
    where tipo = 'principal'
    group by agendamento_id
  ),
  itens as (
    -- avulso "principal" (preco real: valor_total do agendamento dividido
    -- entre os itens principais do mesmo agendamento)
    select
      s.id as servico_id,
      s.nome as servico,
      'avulso'::text as origem,
      ((coalesce(a.valor_total, 0) + coalesce(a.valor_pagamento_2, 0) - coalesce(a.valor_transporte, 0))
        / nullif(qp.qtd_itens, 0)) as valor,
      public.fn_custo_servico_em(s.id, (a.data_fim_real at time zone 'America/Sao_Paulo')::date) as custo
    from public.agendamento_itens ai
    join public.agendamentos a on a.id = ai.agendamento_id
    join public.servicos s on s.id = ai.servico_id
    join qtd_principal qp on qp.agendamento_id = a.id
    where ai.tipo = 'principal'
      and a.pacote_id is null
      and a.status = 'Finalizado'
      and a.data_fim_real is not null
      and s.nome not ilike 'Diferen%'
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim

    union all

    -- sessoes de pacote: mesmo servico, mas "preco" = valor efetivo por
    -- sessao do pacote (regra do sistema: vale o valor do pacote, nunca a
    -- soma dos servicos avulsos). Custo unitario e o mesmo do servico avulso
    -- (a sessao consome os mesmos insumos e mao de obra).
    select
      s.id as servico_id,
      s.nome as servico,
      'pacote'::text as origem,
      (p.valor_total / nullif(p.qtd_sessoes, 0)) as valor,
      public.fn_custo_servico_em(s.id, (a.data_fim_real at time zone 'America/Sao_Paulo')::date) as custo
    from public.agendamento_itens ai
    join public.agendamentos a on a.id = ai.agendamento_id
    join public.pacotes p on p.id = a.pacote_id
    join public.servicos s on s.id = ai.servico_id
    where ai.tipo = 'principal'
      and a.pacote_id is not null
      and a.status = 'Finalizado'
      and a.data_fim_real is not null
      and s.nome not ilike 'Diferen%'
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim

    union all

    -- adicional (itemizado, pago)
    select
      s.id as servico_id,
      s.nome as servico,
      'avulso'::text as origem,
      ai.valor as valor,
      public.fn_custo_servico_em(s.id, a.data_pagamento_extra) as custo
    from public.agendamento_itens ai
    join public.agendamentos a on a.id = ai.agendamento_id
    join public.servicos s on s.id = ai.servico_id
    where ai.tipo = 'adicional'
      and a.status_pagamento_extra = 'PAGO'
      and a.data_pagamento_extra is not null
      and s.nome not ilike 'Diferen%'
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
      and a.data_pagamento_extra between p_data_inicio and p_data_fim
  )
  select
    servico_id,
    servico,
    count(*) as qtd,
    count(*) filter (where origem = 'avulso') as qtd_avulsa,
    count(*) filter (where origem = 'pacote') as qtd_pacote,
    avg(valor) as preco_medio,
    avg(custo) as custo_medio,
    sum(valor) as receita_total,
    sum(custo) as custo_total,
    sum(valor - custo) as lucro_total,
    public.fn_custo_servico_esta_cadastrado(servico_id) as custo_cadastrado
  from itens
  group by servico_id, servico
  order by lucro_total desc;
$$;

-- ---------------------------------------------------------------------------
-- 3) Resumo do periodo (Bloco A): agora somente sobre servicos (sem
--    pacotes), e exclui da soma os servicos sem custo cadastrado (para nao
--    distorcer receita/custo/margem/markup do periodo).
-- ---------------------------------------------------------------------------
create or replace function public.fn_rentabilidade_resumo(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_receita_total numeric;
  v_custo_total numeric;
  v_custo_transporte_avulso numeric;
  v_lucro_total numeric;
  v_margem_media numeric;
  v_markup_medio numeric;
begin
  select coalesce(sum(receita_total), 0), coalesce(sum(custo_total), 0)
    into v_receita_total, v_custo_total
  from public.fn_rentabilidade_servicos(p_unidade_id, p_data_inicio, p_data_fim)
  where custo_cadastrado = true;

  select coalesce(sum(public.fn_custo_transporte_em((a.data_fim_real at time zone 'America/Sao_Paulo')::date)), 0)
    into v_custo_transporte_avulso
  from public.agendamentos a
  where a.tem_taxi = true
    and a.pacote_id is null
    and a.status = 'Finalizado'
    and a.data_fim_real is not null
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and ((a.data_fim_real at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim;

  v_custo_total := v_custo_total + v_custo_transporte_avulso;
  v_lucro_total := v_receita_total - v_custo_total;
  v_margem_media := case when v_receita_total > 0 then (v_lucro_total / v_receita_total) * 100 else 0 end;
  v_markup_medio := case when v_custo_total > 0 then v_receita_total / v_custo_total else 0 end;

  return jsonb_build_object(
    'receita_total', v_receita_total,
    'custo_total', v_custo_total,
    'lucro_total', v_lucro_total,
    'margem_media_pct', v_margem_media,
    'markup_medio', v_markup_medio
  );
end;
$$;
