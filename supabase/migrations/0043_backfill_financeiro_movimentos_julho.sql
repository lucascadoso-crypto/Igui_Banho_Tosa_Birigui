-- Backfill: agendamentos avulsos e pacotes pagos em julho/2026 em diante que
-- nao tem nenhum lancamento em financeiro_movimentos.
--
-- Causa raiz (ver services/pacotePayments.ts e components/Appointments.tsx):
-- registrarPagamentoPacote() e handleQuickReceive() sempre gravaram so
-- pago/forma_pagamento/valor_total em agendamentos/pacotes, sem nunca criar
-- o lancamento financeiro correspondente. Isso foi corrigido nesses dois
-- pontos (agora chamam garantirFinanceiroMovimento()); esta migration cobre
-- so o historico ja pago a partir de 01/07/2026, que e o mes em que a
-- configuracao fiscal da empresa (CNPJ) foi preenchida.
--
-- Idempotente: cada bloco so insere para origem que ainda nao tem nenhuma
-- linha de receita em financeiro_movimentos, entao pode ser rodada de novo
-- sem duplicar.

begin;

do $$
declare
  r record;
  v_movimento_id bigint;
  v_forma1 text;
  v_forma2 text;
  v_pago_em timestamptz;
begin
  -- 1) Agendamentos avulsos (sem pacote) pagos a partir de 01/07/2026.
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
      'receita', 'banho_avulso', 'Banho (backfill fiscal)',
      coalesce(r.valor_total, 0) + coalesce(r.valor_pagamento_2, 0),
      r.data_agendamento, r.data_agendamento, 'pago', 'backfill_fiscal_julho2026', r.id::text
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

  -- 2) Pacotes pagos a partir de 01/07/2026.
  for r in
    select p.*
    from public.pacotes p
    where p.pago = true
      and p.data_pagamento >= date '2026-07-01'
      and not exists (
        select 1 from public.financeiro_movimentos fm
        where fm.pacote_id = p.id
          and fm.tipo = 'receita'
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
      'receita', 'pacote', 'Venda de pacote (backfill fiscal)',
      coalesce(r.valor_total, 0) + coalesce(r.valor_pagamento_2, 0),
      r.data_pagamento, r.data_pagamento, 'pago', 'backfill_fiscal_julho2026', r.id::text
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
