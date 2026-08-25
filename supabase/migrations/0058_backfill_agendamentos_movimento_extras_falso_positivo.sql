-- Mesmo bug da 0057, agora do lado de agendamentos avulsos: garantirFinanceiro
-- Movimento() (services/pacotePayments.ts) checava "ja existe movimento pra
-- este agendamento" sem excluir origem 'extras_agendamento'. Quando um
-- adicional/extra era pago antes do servico principal, essa checagem
-- enganava e o pagamento principal nunca ganhava seu proprio
-- financeiro_movimento (bug corrigido no codigo nesta mesma leva de
-- mudancas). Backfill do historico afetado.
--
-- Idempotente (mesmo padrao das 0043/0057).

begin;

do $$
declare
  r record;
  v_movimento_id bigint;
  v_forma1 text;
  v_forma2 text;
  v_pago_em timestamptz;
begin
  for r in
    select a.*
    from public.agendamentos a
    where a.pago = true
      and a.pacote_id is null
      and a.data_agendamento >= date '2026-07-01'
      and not exists (
        select 1 from public.financeiro_movimentos fm
        where fm.agendamento_id = a.id
          and fm.tipo = 'receita'
          and fm.origem <> 'extras_agendamento'
      )
  loop
    if coalesce(r.valor_total, 0) <= 0 then
      continue;
    end if;

    v_forma1 := case
      when lower(translate(coalesce(r.forma_pagamento,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%pix%' then 'pix'
      when lower(translate(coalesce(r.forma_pagamento,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%dinheiro%' then 'dinheiro'
      when lower(translate(coalesce(r.forma_pagamento,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%debito%' then 'debito'
      when lower(translate(coalesce(r.forma_pagamento,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%credito%' then 'credito'
      when lower(translate(coalesce(r.forma_pagamento,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%transferencia%' then 'transferencia'
      else 'outro'
    end;

    v_pago_em := (r.data_agendamento::text || 'T12:00:00-03:00')::timestamptz;

    insert into public.financeiro_movimentos (
      unidade_id, cliente_id, pet_id, agendamento_id, pacote_id,
      tipo, categoria, descricao, valor_total,
      data_competencia, data_vencimento, status, origem, origem_id
    ) values (
      r.unidade_id, r.cliente_id, r.pet_id, r.id, null,
      'receita', 'banho_avulso', 'Banho (backfill fiscal 2)',
      coalesce(r.valor_total, 0) + coalesce(r.valor_pagamento_2, 0),
      r.data_agendamento, r.data_agendamento, 'pago', 'backfill_fiscal_agendamentos_2', r.id::text
    )
    returning id into v_movimento_id;

    insert into public.financeiro_pagamentos (
      unidade_id, movimento_id, forma_pagamento, valor, pago_em, observacao
    ) values (
      r.unidade_id, v_movimento_id, v_forma1::public.forma_pagamento, r.valor_total, v_pago_em,
      format('Backfill fiscal: pagamento do agendamento %s', r.id)
    );

    if coalesce(r.valor_pagamento_2, 0) > 0 then
      v_forma2 := case
        when lower(translate(coalesce(r.forma_pagamento_2,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%pix%' then 'pix'
        when lower(translate(coalesce(r.forma_pagamento_2,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%dinheiro%' then 'dinheiro'
        when lower(translate(coalesce(r.forma_pagamento_2,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%debito%' then 'debito'
        when lower(translate(coalesce(r.forma_pagamento_2,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%credito%' then 'credito'
        when lower(translate(coalesce(r.forma_pagamento_2,''), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc AAAAEEIOOOUC')) like '%transferencia%' then 'transferencia'
        else 'outro'
      end;

      insert into public.financeiro_pagamentos (
        unidade_id, movimento_id, forma_pagamento, valor, pago_em, observacao
      ) values (
        r.unidade_id, v_movimento_id, v_forma2::public.forma_pagamento, r.valor_pagamento_2, v_pago_em,
        format('Backfill fiscal: pagamento do agendamento %s (parcela 2)', r.id)
      );
    end if;
  end loop;
end $$;

commit;
