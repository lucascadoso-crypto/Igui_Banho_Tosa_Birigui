-- Padroniza a regra de saldo de pacotes (R1/R2 da especificacao de negocio):
--
-- R1. Um banho do pacote so e consumido quando o agendamento vinculado tem
--     status = 'Finalizado'. Agendar, reagendar, cancelar ou editar horario
--     NUNCA altera o saldo.
-- R2. Saldo sempre calculado, nunca gravado. A coluna public.pacotes.saldo_calculado
--     (criada em 0031_add_pacotes_saldo_calculado.sql) era mantida por dois
--     triggers de drift -- fn_init_package_balance() (BEFORE INSERT ON pacotes)
--     e fn_sync_package_balance_on_appointment() (AFTER UPDATE ON agendamentos)
--     -- que nunca foram versionados em nenhuma migration. Essa coluna editavel
--     e a causa raiz do bug de saldo relatado em producao.
--
-- Esta migration remove os triggers/funcoes de drift, remove a coluna gravavel
-- e substitui por uma VIEW que sempre recalcula o saldo a partir de
-- agendamentos.status = 'Finalizado'.

-- 1) Remove qualquer trigger de drift (nao versionado) que ainda escreva em
--    pacotes.saldo_calculado, procurando por nome de funcao para nao depender
--    de um nome de trigger que nunca foi documentado.
do $$
declare
  trig record;
begin
  for trig in
    select t.tgname as trigger_name, c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and p.proname in ('fn_init_package_balance', 'fn_sync_package_balance_on_appointment')
  loop
    execute format('drop trigger if exists %I on public.%I', trig.trigger_name, trig.table_name);
  end loop;
end $$;

drop function if exists public.fn_init_package_balance();
drop function if exists public.fn_sync_package_balance_on_appointment();

-- 2) Remove a coluna gravavel. Nenhum componente do app le
--    pacotes.saldo_calculado diretamente (o app ja calcula o saldo em runtime
--    a partir dos agendamentos, ver components/Pacotes.tsx); os unicos
--    escritores eram os triggers de drift removidos acima.
alter table public.pacotes
  drop column if exists saldo_calculado;

-- 3) VIEW que recalcula o saldo sob demanda a partir de agendamentos
--    finalizados. security_invoker garante que a RLS de public.pacotes e
--    public.agendamentos (policy "..._unit_access" baseada em
--    can_access_unidade) continue valendo para quem consulta a view.
create or replace view public.pacotes_com_saldo
with (security_invoker = true)
as
select
  p.*,
  count(a.id) filter (
    where upper(a.status) = 'FINALIZADO'
  ) as usados,
  greatest(
    0,
    p.qtd_sessoes - count(a.id) filter (where upper(a.status) = 'FINALIZADO')
  ) as saldo_calculado
from public.pacotes p
left join public.agendamentos a on a.pacote_id = p.id
group by p.id;

grant select on public.pacotes_com_saldo to authenticated;
