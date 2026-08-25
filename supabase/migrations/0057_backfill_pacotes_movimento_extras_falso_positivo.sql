-- A migration 0043 (backfill de financeiro_movimentos) so pulava um pacote
-- se ele ja tivesse QUALQUER movimento de receita vinculado - sem checar a
-- origem. Pacotes de renovacao automatica (ver Appointments.tsx, bug
-- corrigido nesta mesma leva de mudancas) tinham, por acaso, um movimento
-- de origem 'extras_agendamento' vinculado ao mesmo pacote_id (cobranca
-- avulsa nao relacionada a venda do pacote em si) - isso enganou o "not
-- exists" da 0043 e esses pacotes continuaram sem o movimento real de venda.
--
-- Mesma logica da 0043, so que o "not exists" agora ignora movimentos de
-- origem 'extras_agendamento' explicitamente. Idempotente (roda de novo sem
-- duplicar, mesmo padrao).

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
    select p.*
    from public.pacotes p
    where p.pago = true
      and p.data_pagamento >= date '2026-07-01'
      and not exists (
        select 1 from public.financeiro_movimentos fm
        where fm.pacote_id = p.id
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

    v_pago_em := (r.data_pagamento::text || 'T12:00:00-03:00')::timestamptz;

    insert into public.financeiro_movimentos (
      unidade_id, cliente_id, pet_id, agendamento_id, pacote_id,
      tipo, categoria, descricao, valor_total,
      data_competencia, data_vencimento, status, origem, origem_id
    ) values (
      r.unidade_id, r.cliente_id, r.pet_id, null, r.id,
      'receita', 'pacote', 'Venda de pacote (backfill fiscal 2)',
      coalesce(r.valor_total, 0) + coalesce(r.valor_pagamento_2, 0),
      r.data_pagamento, r.data_pagamento, 'pago', 'backfill_fiscal_pacotes_2', r.id::text
    )
    returning id into v_movimento_id;

    insert into public.financeiro_pagamentos (
      unidade_id, movimento_id, forma_pagamento, valor, pago_em, observacao
    ) values (
      r.unidade_id, v_movimento_id, v_forma1::public.forma_pagamento, r.valor_total, v_pago_em,
      format('Backfill fiscal: pagamento do pacote %s', r.id)
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
        format('Backfill fiscal: pagamento do pacote %s (parcela 2)', r.id)
      );
    end if;
  end loop;
end $$;

commit;
