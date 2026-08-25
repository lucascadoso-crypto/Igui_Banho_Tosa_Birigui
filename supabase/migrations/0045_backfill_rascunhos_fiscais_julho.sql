-- Cria em lote os rascunhos fiscais de julho/2026 que ainda faltam, usando
-- exatamente a mesma logica de criar_rascunho_fiscal_por_movimento()
-- (incluindo o fallback de preco de catalogo da migration 0044), so que sem
-- exigir auth.uid() (essa migration roda como postgres, fora do contexto de
-- um usuario logado no app) e continuando para o proximo item quando um
-- falhar, em vez de abortar o lote inteiro.
--
-- Nao substitui o processo manual de emissao: so poupa o clique de "Criar
-- rascunho fiscal" repetido 80+ vezes. Cada rascunho criado ainda precisa
-- ser emitido manualmente no Portal Nacional e marcado como emitida no app.

begin;

do $$
declare
  fm record;
  agendamento public.agendamentos;
  pacote public.pacotes;
  cliente public.clientes;
  nota public.notas_fiscais;
  last_payment_id bigint;
  last_payment_at timestamptz;
  item_count integer;
  fiscal_subtotal numeric(10,2);
  non_fiscal_total numeric(10,2);
  expected_fiscal_total numeric(10,2);
  fiscal_discount numeric(10,2);
  tolerance numeric(10,2) := 0.01;
  fiscal_description text := 'Prestação de serviços de higiene, embelezamento e cuidados de animais domésticos.';
  pacote_descricao text;
  criados integer := 0;
  falhados integer := 0;
begin
  for fm in
    select *
    from public.financeiro_movimentos
    where tipo = 'receita'
      and status = 'pago'
      and data_competencia >= date '2026-07-01'
      and (
        (agendamento_id is not null and not exists (
          select 1 from public.notas_fiscais nf
          where nf.agendamento_id = financeiro_movimentos.agendamento_id
            and nf.status <> 'CANCELADA'
        ))
        or
        (pacote_id is not null and not exists (
          select 1 from public.notas_fiscais nf
          where nf.pacote_id = financeiro_movimentos.pacote_id
            and nf.status <> 'CANCELADA'
        ))
      )
    order by id
  loop
    begin
      select fp.id, fp.pago_em
        into last_payment_id, last_payment_at
      from public.financeiro_pagamentos fp
      where fp.movimento_id = fm.id
      order by fp.pago_em desc, fp.id desc
      limit 1;

      if last_payment_id is null then
        raise exception 'movimento sem pagamento vinculado';
      end if;

      if fm.agendamento_id is not null then
        select * into agendamento from public.agendamentos a where a.id = fm.agendamento_id;
        if not found then raise exception 'agendamento de origem nao encontrado'; end if;

        select * into cliente from public.clientes c where c.id = coalesce(fm.cliente_id, agendamento.cliente_id);
        if not found then raise exception 'cliente de origem nao encontrado'; end if;

        select coalesce(sum(item_value), 0)::numeric(10,2)
          into fiscal_subtotal
        from (
          select coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2) as item_value
          from public.agendamento_itens ai
          join public.servicos s on s.id = ai.servico_id
          join public.servicos_fiscais sf
            on sf.unidade_id = fm.unidade_id and sf.servico_id = ai.servico_id and sf.ativo = true
          where ai.agendamento_id = agendamento.id
            and coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0) > 0
            and lower(s.nome) not like '%taxi%'
            and lower(s.nome) not like '%táxi%'
            and lower(s.nome) not like '%transporte%'
            and lower(s.nome) not like '%desloc%'
            and lower(s.nome) not like '%produto%'
        ) fiscal_items;

        non_fiscal_total := greatest(coalesce(agendamento.valor_transporte, 0), 0)::numeric(10,2);
        expected_fiscal_total := (fm.valor_total - non_fiscal_total)::numeric(10,2);

        if fiscal_subtotal <= 0 then
          raise exception 'nenhum item fiscal elegivel de banho e tosa foi encontrado';
        end if;

        if expected_fiscal_total <= 0 then
          raise exception 'valor fiscal apos excluir receitas nao fiscais ficou zerado ou negativo';
        end if;

        if fiscal_subtotal + tolerance < expected_fiscal_total then
          raise exception 'itens de servico nao conferem com o valor financeiro recebido';
        end if;

        fiscal_discount := greatest(0, (fiscal_subtotal - expected_fiscal_total))::numeric(10,2);

        insert into public.notas_fiscais (
          unidade_id, agendamento_id, pacote_id, financeiro_movimento_id, financeiro_pagamento_id,
          cliente_id, status, ambiente, tipo_documento, data_confirmacao_pagamento, data_competencia,
          data_emissao, valor_servicos, valor_desconto, valor_total, descricao_servico,
          tomador_nome, tomador_cpf_cnpj, tomador_email, tomador_telefone, tomador_endereco
        ) values (
          fm.unidade_id, agendamento.id, null, fm.id, last_payment_id, cliente.id,
          'RASCUNHO', 'NAO_CONFIGURADO', 'NFS_E', last_payment_at, agendamento.data_agendamento, null,
          fiscal_subtotal, fiscal_discount, expected_fiscal_total, fiscal_description,
          cliente.nome, cliente.cpf, cliente.email::text, cliente.telefone,
          concat_ws(', ',
            nullif(concat_ws(' ', cliente.logradouro, cliente.numero), ''),
            nullif(cliente.bairro, ''), nullif(cliente.cidade, ''), nullif(cliente.estado, ''), nullif(cliente.cep, '')
          )
        )
        returning * into nota;

        insert into public.nota_fiscal_itens (
          nota_fiscal_id, servico_id, descricao, quantidade, valor_unitario, valor_desconto, valor_total,
          codigo_servico_municipal, codigo_tributacao_nacional, codigo_nbs
        )
        select
          nota.id, ai.servico_id, coalesce(nullif(ai.descricao, ''), s.nome), 1,
          coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2), 0,
          coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0)::numeric(10,2),
          sf.codigo_servico_municipal, sf.codigo_tributacao_nacional, sf.codigo_nbs
        from public.agendamento_itens ai
        join public.servicos s on s.id = ai.servico_id
        join public.servicos_fiscais sf
          on sf.unidade_id = fm.unidade_id and sf.servico_id = ai.servico_id and sf.ativo = true
        where ai.agendamento_id = agendamento.id
          and coalesce(nullif(ai.valor, 0), nullif(ai.valor_cobrado, 0), nullif(ai.valor_extra, 0), nullif(s.preco_base, 0), 0) > 0
          and lower(s.nome) not like '%taxi%'
          and lower(s.nome) not like '%táxi%'
          and lower(s.nome) not like '%transporte%'
          and lower(s.nome) not like '%desloc%'
          and lower(s.nome) not like '%produto%';

        get diagnostics item_count = row_count;
        if item_count = 0 then
          raise exception 'nenhum item fiscal elegivel de banho e tosa foi encontrado (insert)';
        end if;
      else
        select * into pacote from public.pacotes p where p.id = fm.pacote_id;
        if not found then raise exception 'pacote de origem nao encontrado'; end if;

        select * into cliente from public.clientes c where c.id = coalesce(fm.cliente_id, pacote.cliente_id);
        if not found then raise exception 'cliente de origem nao encontrado'; end if;

        non_fiscal_total := greatest(coalesce(pacote.valor_transporte, 0), 0)::numeric(10,2);
        expected_fiscal_total := (fm.valor_total - non_fiscal_total)::numeric(10,2);

        if expected_fiscal_total <= 0 then
          raise exception 'valor fiscal do pacote ficou zerado ou negativo';
        end if;

        insert into public.notas_fiscais (
          unidade_id, agendamento_id, pacote_id, financeiro_movimento_id, financeiro_pagamento_id,
          cliente_id, status, ambiente, tipo_documento, data_confirmacao_pagamento, data_competencia,
          data_emissao, valor_servicos, valor_desconto, valor_total, descricao_servico,
          tomador_nome, tomador_cpf_cnpj, tomador_email, tomador_telefone, tomador_endereco
        ) values (
          fm.unidade_id, null, pacote.id, fm.id, last_payment_id, cliente.id,
          'RASCUNHO', 'NAO_CONFIGURADO', 'NFS_E', last_payment_at, null, null,
          expected_fiscal_total, 0, expected_fiscal_total, fiscal_description,
          cliente.nome, cliente.cpf, cliente.email::text, cliente.telefone,
          concat_ws(', ',
            nullif(concat_ws(' ', cliente.logradouro, cliente.numero), ''),
            nullif(cliente.bairro, ''), nullif(cliente.cidade, ''), nullif(cliente.estado, ''), nullif(cliente.cep, '')
          )
        )
        returning * into nota;

        select coalesce(s.nome, pacote.nome_pacote, pacote.nome, 'Pacote de banho e tosa')
            || ' — ' || pacote.qtd_sessoes || ' sessões'
          into pacote_descricao
        from public.pacotes p
        left join public.servicos s on s.id = p.servico_id
        where p.id = pacote.id;

        insert into public.nota_fiscal_itens (
          nota_fiscal_id, servico_id, descricao, quantidade, valor_unitario, valor_desconto, valor_total,
          codigo_servico_municipal, codigo_tributacao_nacional, codigo_nbs
        )
        select
          nota.id, pacote.servico_id, coalesce(pacote_descricao, 'Pacote de banho e tosa'), 1,
          expected_fiscal_total, 0, expected_fiscal_total,
          sf.codigo_servico_municipal, sf.codigo_tributacao_nacional, sf.codigo_nbs
        from public.pacotes p
        left join public.servicos s on s.id = p.servico_id
        join public.servicos_fiscais sf
          on sf.unidade_id = fm.unidade_id and sf.servico_id = p.servico_id and sf.ativo = true
         and nullif(btrim(sf.codigo_servico_municipal), '') is not null
         and nullif(btrim(sf.codigo_nbs), '') is not null
        where p.id = pacote.id;

        get diagnostics item_count = row_count;
        if item_count <> 1 then
          raise exception 'servico do pacote ainda nao possui configuracao fiscal ativa';
        end if;
      end if;

      perform public.fiscal_validate_note_items_total(nota.id);
      criados := criados + 1;
    exception when others then
      falhados := falhados + 1;
      raise notice 'Movimento % (agendamento %, pacote %) nao pode ser processado: %', fm.id, fm.agendamento_id, fm.pacote_id, sqlerrm;
    end;
  end loop;

  raise notice 'Rascunhos fiscais criados: %. Falhas (revisar manualmente): %.', criados, falhados;
end $$;

commit;
