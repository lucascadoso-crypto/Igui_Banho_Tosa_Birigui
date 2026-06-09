-- Garante que master e usuarios da unidade possam atualizar/deletar itens de agendamento.
-- Idempotente e sem alteracao de dados.

drop policy if exists "agendamento_itens_unit_access" on public.agendamento_itens;

create policy "agendamento_itens_unit_access"
on public.agendamento_itens
for all
to authenticated
using (public.is_master() or public.can_access_unidade(unidade_id))
with check (public.is_master() or public.can_access_unidade(unidade_id));
