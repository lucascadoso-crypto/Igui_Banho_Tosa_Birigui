-- BUG: criar_rascunho_fiscal_por_movimento() grava data_competencia = null
-- para notas fiscais originadas de PACOTE (0048_fiscal_pacote_sem_servico.sql,
-- ramo "else"). marcar_nota_fiscal_emitida() tambem nunca preenche esse
-- campo depois. Resultado: toda nota fiscal de pacote - rascunho ou ja
-- emitida - fica com data_competencia null para sempre.
--
-- A tela Historico Fiscal (FiscalHistory.tsx) filtra a lista com
-- .gte('data_competencia', periodStart).lte('data_competencia', periodEnd),
-- e esse filtro ja vem preenchido por padrao (dia 1 do mes ate hoje). Uma
-- linha com data_competencia null nunca entra num filtro de intervalo de
-- data no PostgREST/Postgres - entao TODA nota de pacote fica invisivel na
-- tela sempre que ha filtro de periodo, mesmo ja emitida. E o que estava
-- fazendo "Emitido no periodo filtrado" mostrar bem menos do que o
-- realmente emitido.
--
-- Fix combinado (pedido do usuario apos investigacao): pacote e regime de
-- caixa (cliente paga hoje, sessoes podem ser mes que vem) - a nota tem que
-- contar no mes em que o pagamento aconteceu, igual o card "Entradas" ja
-- faz (fn_receita_eventos_caixa usa pacotes.data_pagamento). Entao:
--
-- 1. criar_rascunho_fiscal_por_movimento() passa a gravar
--    data_competencia = pacote.data_pagamento no ramo de pacote (era null).
--    Nao muda nada no ramo de agendamento avulso.
-- 2. Backfill: toda nota fiscal de pacote ja existente com data_competencia
--    null recebe a data de pagamento do pacote vinculado (fallback para a
--    data de confirmacao do pagamento gravada na propria nota, caso o
--    pacote nao tenha data_pagamento por algum motivo legado).

begin;

create or replace function public.criar_rascunho_fiscal_por_movimento(p_movimento_id bigint)
returns public.notas_fiscais
language plpgsql
security definer
set search_path = public
as $$
declare
  movimento public.financeiro_movimentos;
  cliente public.clientes;
  agendamento public.agendamentos;
  pacote public.pacotes;
  nota public.notas_fiscais;
  last_payment_id bigint;
  last_payment_at timestamptz;
  item_count integer;
  source_count integer;
  fiscal_subtotal numeric(10,2);
  non_fiscal_total numeric(10,2);
  expected_fiscal_total numeric(10,2);
  fiscal_discount numeric(10,2);
  tolerance numeric(10,2) := 0.01;
  fiscal_description text := 'Prestação de serviços de higiene, embelezamento e cuidados de animais domésticos.';
  pacote_descricao text;
  pacote_sf_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio para criar rascunho fiscal.';
  end if;

  select *
    into movimento
  from public.financeiro_movimentos fm
  where fm.id = p_movimento_id
  for update;

  if not found then
    raise exception 'Movimento financeiro % nao encontrado.', p_movimento_id;
  end if;

  if not public.fiscal_can_create_draft(movimento.unidade_id) then
    raise exception 'Usuario sem permissao para criar rascunho fiscal nesta unidade.';
  end if;

  if movimento.tipo is distinct from 'receita'::public.financeiro_tipo then
    raise exception 'Somente movimentos de receita podem gerar rascunho fiscal.';
  end if;

  if movimento.status is distinct from 'pago'::public.financeiro_status then
    raise exception 'Rascunho fiscal so pode ser criado para movimento financeiro quitado.';
  end if;

  source_count :=
    case when movimento.agendamento_id is not null then 1 else 0 end
    + case when movimento.pacote_id is not null then 1 else 0 end;

  if source_count <> 1 then
    raise exception 'Movimento financeiro precisa ter exatamente uma origem comercial: agendamento ou pacote.';
  end if;

  if exists (
    select 1
    from public.notas_fiscais nf
    where nf.financeiro_movimento_id = movimento.id
      and nf.status <> 'CANCELADA'
  ) then
    perform public.fiscal_safe_audit(
      movimento.unidade_id,
      'TENTATIVA_DUPLICAR_RASCUNHO_FISCAL',
      'financeiro_movimentos',
      movimento.id,
      'Tentativa de criar rascunho fiscal duplicado para movimento financeiro #' || movimento.id::text || '.',
      null,
      jsonb_build_object('financeiro_movimento_id', movimento.id)
    );

    raise exception 'Ja existe rascunho fiscal ativo para este movimento financeiro.';
  end if;

  select fp.id, fp.pago_em
    into last_payment_id, last_payment_at
  from public.financeiro_pagamentos fp
  where fp.movimento_id = movimento.id
  order by fp.pago_em desc, fp.id desc
  limit 1;

  if last_payment_id is null or last_payment_at is null then
    raise exception 'Movimento financeiro quitado nao possui pagamento confirmado vinculado.';
  end if;

  if movimento.agendamento_id is not null then
    select *
      into agendamento
    from public.agendamentos a
    where a.id = movimento.agendamento_id;

    if not found then
      raise exception 'Agendamento de origem nao encontrado.';
    end if;

    select *
      into cliente
    from public.clientes c
    where c.id = coalesce(movimento.cliente_id, agendamento.cliente_id);

    if not found then
      raise exception 'Cliente de origem nao encontrado.';
    end if;

    select coalesce(sum(item_value), 0)::numeric(10,2)
      into fiscal_subtotal
    from (
      select coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2) as item_value
      from public.agendamento_itens ai
      join public.servicos s on s.id = ai.servico_id
      join public.servicos_fiscais sf
        on sf.unidade_id = movimento.unidade_id
       and sf.servico_id = ai.servico_id
       and sf.ativo = true
      where ai.agendamento_id = agendamento.id
        and coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0) > 0
        and lower(s.nome) not like '%taxi%'
        and lower(s.nome) not like '%táxi%'
        and lower(s.nome) not like '%transporte%'
        and lower(s.nome) not like '%desloc%'
        and lower(s.nome) not like '%produto%'
    ) fiscal_items;

    non_fiscal_total := greatest(coalesce(agendamento.valor_transporte, 0), 0)::numeric(10,2);
    expected_fiscal_total := (movimento.valor_total - non_fiscal_total)::numeric(10,2);

    if fiscal_subtotal <= 0 then
      raise exception 'Nao foi possivel montar o rascunho fiscal automaticamente porque nenhum item fiscal elegivel de banho e tosa foi encontrado.';
    end if;

    if expected_fiscal_total <= 0 then
      raise exception 'Nao foi possivel montar o rascunho fiscal automaticamente porque o valor fiscal apos excluir receitas nao fiscais ficou zerado ou negativo.';
    end if;

    if fiscal_subtotal + tolerance < expected_fiscal_total then
      raise exception 'Nao foi possivel montar o rascunho fiscal automaticamente porque os itens de servico nao conferem com o valor financeiro recebido. Revise o atendimento financeiro antes de criar o rascunho.';
    end if;

    fiscal_discount := (fiscal_subtotal - expected_fiscal_total)::numeric(10,2);

    if fiscal_discount < 0 then
      fiscal_discount := 0;
    end if;

    insert into public.notas_fiscais (
      unidade_id,
      agendamento_id,
      pacote_id,
      financeiro_movimento_id,
      financeiro_pagamento_id,
      cliente_id,
      status,
      ambiente,
      tipo_documento,
      data_confirmacao_pagamento,
      data_competencia,
      data_emissao,
      valor_servicos,
      valor_desconto,
      valor_total,
      descricao_servico,
      tomador_nome,
      tomador_cpf_cnpj,
      tomador_email,
      tomador_telefone,
      tomador_endereco,
      criada_por_user_id
    ) values (
      movimento.unidade_id,
      agendamento.id,
      null,
      movimento.id,
      last_payment_id,
      cliente.id,
      'RASCUNHO',
      'NAO_CONFIGURADO',
      'NFS_E',
      last_payment_at,
      agendamento.data_agendamento,
      null,
      fiscal_subtotal,
      fiscal_discount,
      expected_fiscal_total,
      fiscal_description,
      cliente.nome,
      cliente.cpf,
      cliente.email::text,
      cliente.telefone,
      concat_ws(', ',
        nullif(concat_ws(' ', cliente.logradouro, cliente.numero), ''),
        nullif(cliente.bairro, ''),
        nullif(cliente.cidade, ''),
        nullif(cliente.estado, ''),
        nullif(cliente.cep, '')
      ),
      auth.uid()
    )
    returning * into nota;

    insert into public.nota_fiscal_itens (
      nota_fiscal_id,
      servico_id,
      descricao,
      quantidade,
      valor_unitario,
      valor_desconto,
      valor_total,
      codigo_servico_municipal,
      codigo_tributacao_nacional,
      codigo_nbs
    )
    select
      nota.id,
      ai.servico_id,
      coalesce(nullif(ai.descricao, ''), s.nome),
      1,
      coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2),
      0,
      coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2),
      sf.codigo_servico_municipal,
      sf.codigo_tributacao_nacional,
      sf.codigo_nbs
    from public.agendamento_itens ai
    join public.servicos s on s.id = ai.servico_id
    join public.servicos_fiscais sf
      on sf.unidade_id = movimento.unidade_id
     and sf.servico_id = ai.servico_id
     and sf.ativo = true
    where ai.agendamento_id = agendamento.id
      and coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0) > 0
      and lower(s.nome) not like '%taxi%'
      and lower(s.nome) not like '%táxi%'
      and lower(s.nome) not like '%transporte%'
      and lower(s.nome) not like '%desloc%'
      and lower(s.nome) not like '%produto%';

    get diagnostics item_count = row_count;

    if item_count = 0 then
      raise exception 'Nao foi possivel montar o rascunho fiscal automaticamente porque nenhum item fiscal elegivel de banho e tosa foi encontrado.';
    end if;
  else
    select *
      into pacote
    from public.pacotes p
    where p.id = movimento.pacote_id;

    if not found then
      raise exception 'Pacote de origem nao encontrado.';
    end if;

    select *
      into cliente
    from public.clientes c
    where c.id = coalesce(movimento.cliente_id, pacote.cliente_id);

    if not found then
      raise exception 'Cliente de origem nao encontrado.';
    end if;

    non_fiscal_total := greatest(coalesce(pacote.valor_transporte, 0), 0)::numeric(10,2);
    expected_fiscal_total := (movimento.valor_total - non_fiscal_total)::numeric(10,2);

    if expected_fiscal_total <= 0 then
      raise exception 'Nao foi possivel montar o rascunho fiscal automaticamente porque o valor fiscal do pacote ficou zerado ou negativo.';
    end if;

    insert into public.notas_fiscais (
      unidade_id,
      agendamento_id,
      pacote_id,
      financeiro_movimento_id,
      financeiro_pagamento_id,
      cliente_id,
      status,
      ambiente,
      tipo_documento,
      data_confirmacao_pagamento,
      data_competencia,
      data_emissao,
      valor_servicos,
      valor_desconto,
      valor_total,
      descricao_servico,
      tomador_nome,
      tomador_cpf_cnpj,
      tomador_email,
      tomador_telefone,
      tomador_endereco,
      criada_por_user_id
    ) values (
      movimento.unidade_id,
      null,
      pacote.id,
      movimento.id,
      last_payment_id,
      cliente.id,
      'RASCUNHO',
      'NAO_CONFIGURADO',
      'NFS_E',
      last_payment_at,
      -- Regime de caixa (igual "Entradas"/fn_receita_eventos_caixa): a nota
      -- do pacote conta no mes em que o pagamento aconteceu, nao no mes das
      -- sessoes. Antes desta migration ficava null e a nota nunca aparecia
      -- em nenhum filtro de periodo do Historico Fiscal. Fallback pra data
      -- do pagamento confirmado (last_payment_at) se por algum motivo o
      -- pacote nao tiver data_pagamento.
      coalesce(pacote.data_pagamento, last_payment_at::date),
      null,
      expected_fiscal_total,
      0,
      expected_fiscal_total,
      fiscal_description,
      cliente.nome,
      cliente.cpf,
      cliente.email::text,
      cliente.telefone,
      concat_ws(', ',
        nullif(concat_ws(' ', cliente.logradouro, cliente.numero), ''),
        nullif(cliente.bairro, ''),
        nullif(cliente.cidade, ''),
        nullif(cliente.estado, ''),
        nullif(cliente.cep, '')
      ),
      auth.uid()
    )
    returning * into nota;

    select coalesce(s.nome, pacote.nome_pacote, pacote.nome, 'Pacote de banho e tosa')
        || ' — ' || pacote.qtd_sessoes || ' sessões'
      into pacote_descricao
    from public.pacotes p
    left join public.servicos s on s.id = p.servico_id
    where p.id = pacote.id;

    -- Pacote com servico_id: casa exatamente esse servico (comportamento
    -- original). Pacote de fidelidade sem servico_id (catalogo_pacotes nao
    -- tem esse vinculo): usa qualquer servicos_fiscais ativo e configurado
    -- da unidade, ja que todos resolvem para o mesmo codigo fiscal.
    if pacote.servico_id is not null then
      select sf.id into pacote_sf_id
      from public.servicos_fiscais sf
      where sf.unidade_id = movimento.unidade_id
        and sf.servico_id = pacote.servico_id
        and sf.ativo = true
        and nullif(btrim(sf.codigo_servico_municipal), '') is not null
        and nullif(btrim(sf.codigo_nbs), '') is not null
      limit 1;
    else
      select sf.id into pacote_sf_id
      from public.servicos_fiscais sf
      where sf.unidade_id = movimento.unidade_id
        and sf.ativo = true
        and nullif(btrim(sf.codigo_servico_municipal), '') is not null
        and nullif(btrim(sf.codigo_nbs), '') is not null
      order by sf.id asc
      limit 1;
    end if;

    insert into public.nota_fiscal_itens (
      nota_fiscal_id,
      servico_id,
      descricao,
      quantidade,
      valor_unitario,
      valor_desconto,
      valor_total,
      codigo_servico_municipal,
      codigo_tributacao_nacional,
      codigo_nbs
    )
    select
      nota.id,
      pacote.servico_id,
      coalesce(pacote_descricao, 'Pacote de banho e tosa'),
      1,
      expected_fiscal_total,
      0,
      expected_fiscal_total,
      sf.codigo_servico_municipal,
      sf.codigo_tributacao_nacional,
      sf.codigo_nbs
    from public.servicos_fiscais sf
    where sf.id = pacote_sf_id;

    get diagnostics item_count = row_count;

    if item_count <> 1 then
      raise exception 'Nao foi possivel criar o rascunho fiscal porque o servico do pacote ainda nao possui configuracao fiscal ativa.';
    end if;
  end if;

  perform public.fiscal_validate_note_items_total(nota.id);

  perform public.fiscal_safe_audit(
    movimento.unidade_id,
    'CRIACAO_RASCUNHO_FISCAL',
    'notas_fiscais',
    nota.id,
    'Criou rascunho fiscal #' || nota.id::text || ' para movimento financeiro #' || movimento.id::text || '.',
    null,
    jsonb_build_object(
      'nota_fiscal_id', nota.id,
      'financeiro_movimento_id', movimento.id,
      'agendamento_id', nota.agendamento_id,
      'pacote_id', nota.pacote_id,
      'valor_total', nota.valor_total
    )
  );

  return nota;
end;
$$;

-- Backfill: notas fiscais de pacote ja existentes com data_competencia null
-- (criadas antes desta correcao) passam a valer a data de pagamento do
-- pacote vinculado. Fallback para data_confirmacao_pagamento (sempre
-- preenchida, é a data do pagamento que originou o rascunho) quando o
-- pacote nao tiver data_pagamento por algum motivo legado.
--
-- protect_notas_fiscais_integrity (fiscal_protect_nota_fiscal) barra
-- qualquer UPDATE em nota que nao esteja em RASCUNHO - correto para uso
-- normal (protege nota ja emitida de alteracao), mas bloqueia este backfill
-- porque ele precisa corrigir data_competencia tambem em notas ja EMITIDAS
-- (essa e justamente a razao delas estarem escondidas do filtro de
-- periodo). Desliga a trigger so para esta transacao e religa em seguida -
-- nenhuma outra regra de protecao muda.
alter table public.notas_fiscais disable trigger protect_notas_fiscais_integrity;

update public.notas_fiscais nf
set data_competencia = coalesce(p.data_pagamento, nf.data_confirmacao_pagamento::date)
from public.pacotes p
where nf.pacote_id = p.id
  and nf.data_competencia is null;

alter table public.notas_fiscais enable trigger protect_notas_fiscais_integrity;

commit;
