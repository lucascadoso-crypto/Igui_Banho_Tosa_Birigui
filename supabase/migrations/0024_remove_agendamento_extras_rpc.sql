-- Sistema Pet V2 - Remocao atomica de todos os extras de um agendamento.
--
-- Escopo:
-- - Cria RPC transacional para remover somente itens extras/adicionais.
-- - Atualiza apenas colunas reais de public.agendamentos.
-- - Nao altera fiscal, permissoes, WhatsApp, rota do taxi, agenda principal ou financeiro.

begin;

create or replace function public.remover_todos_extras_agendamento(p_agendamento_id bigint)
returns table (
  extras_removidos integer,
  novo_valor_extra_total numeric,
  novo_status_pagamento_extra text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento public.agendamentos;
  v_extras_removidos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  select a.* into v_agendamento
  from public.agendamentos as a
  where a.id = p_agendamento_id
  for update;

  if not found then
    raise exception 'Agendamento % nao encontrado.', p_agendamento_id;
  end if;

  if not public.can_access_unidade(v_agendamento.unidade_id) then
    raise exception 'Usuario sem permissao para alterar este agendamento.';
  end if;

  if v_agendamento.status_pagamento_extra = 'PAGO' then
    raise exception 'Este extra ja foi recebido. Cancele o recebimento antes de remover.';
  end if;

  if exists (
    select 1
    from public.financeiro_movimentos as fm
    where fm.agendamento_id = p_agendamento_id
      and (fm.origem = 'extras_agendamento' or fm.categoria = 'extras')
      and fm.status = 'pago'
  ) then
    raise exception 'Este extra ja foi recebido. Cancele o recebimento antes de remover.';
  end if;

  delete from public.agendamento_itens as ai
  where ai.agendamento_id = p_agendamento_id
    and (
      ai.eh_extra = true
      or ai.tipo in ('extra', 'adicional')
    );

  get diagnostics v_extras_removidos = row_count;

  update public.agendamentos as a
  set valor_extra_total = 0,
      status_pagamento_extra = 'NÃO POSSUI',
      forma_pagamento_extra = null,
      data_pagamento_extra = null,
      updated_at = now()
  where a.id = p_agendamento_id;

  return query
  select
    v_extras_removidos,
    0::numeric,
    'NÃO POSSUI'::text;
end;
$$;

revoke execute on function public.remover_todos_extras_agendamento(bigint) from public;
grant execute on function public.remover_todos_extras_agendamento(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
