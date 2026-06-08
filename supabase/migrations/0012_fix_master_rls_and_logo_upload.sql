-- Sistema Pet V2 - fix master RLS based on funcionarios

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.funcionarios f
    where f.user_id = auth.uid()
      and f.ativo = true
      and f.cargo = 'master'
  );
$$;

create or replace function public.can_access_unidade(target_unidade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master()
    or exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = auth.uid()
        and uu.unidade_id = target_unidade_id
        and uu.ativo = true
    )
    or exists (
      select 1
      from public.funcionarios f
      where f.user_id = auth.uid()
        and f.unidade_id = target_unidade_id
        and f.ativo = true
    );
$$;

drop policy if exists "unidades_read_allowed" on public.unidades;
drop policy if exists "unidades_master_write" on public.unidades;
drop policy if exists "unidades_select_master_or_unit" on public.unidades;
drop policy if exists "unidades_insert_master" on public.unidades;
drop policy if exists "unidades_update_master" on public.unidades;
drop policy if exists "unidades_delete_master" on public.unidades;

drop policy if exists "servicos_read_authenticated" on public.servicos;
drop policy if exists "servicos_master_write" on public.servicos;
drop policy if exists "servicos_select_authenticated" on public.servicos;
drop policy if exists "servicos_insert_master" on public.servicos;
drop policy if exists "servicos_update_master" on public.servicos;
drop policy if exists "servicos_delete_master" on public.servicos;

create policy "unidades_select_master_or_unit"
on public.unidades for select
to authenticated
using (public.is_master() or public.can_access_unidade(id));

create policy "unidades_insert_master"
on public.unidades for insert
to authenticated
with check (public.is_master());

create policy "unidades_update_master"
on public.unidades for update
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "unidades_delete_master"
on public.unidades for delete
to authenticated
using (public.is_master());

create policy "servicos_select_authenticated"
on public.servicos for select
to authenticated
using (true);

create policy "servicos_insert_master"
on public.servicos for insert
to authenticated
with check (public.is_master());

create policy "servicos_update_master"
on public.servicos for update
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "servicos_delete_master"
on public.servicos for delete
to authenticated
using (public.is_master());
