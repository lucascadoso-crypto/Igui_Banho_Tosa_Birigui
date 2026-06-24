-- Sistema Pet V2 - Controle oficial de acessos pela tela Equipe
-- ATENCAO: migration preparada para revisao. Nao aplicar sem aprovacao.
--
-- Objetivos:
-- - usuarios_unidades passa a ser a fonte de verdade de acesso.
-- - funcionarios permanece como cadastro operacional.
-- - frontend nao deve alterar diretamente usuarios_unidades nem os campos
--   funcionarios.user_id, funcionarios.unidade_id, funcionarios.cargo, funcionarios.ativo.
-- - salvar_acesso_funcionario sincroniza funcionarios + usuarios_unidades em uma rotina segura.

begin;

-- 1. Backfill conservador antes de substituir as funcoes de acesso.
-- Mantem acessos existentes vinculados a auth.users sem conceder acesso a quem nao tem user_id.
insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
select f.user_id, f.unidade_id, f.cargo, f.ativo
from public.funcionarios f
where f.user_id is not null
on conflict (user_id, unidade_id, perfil) do update
set ativo = excluded.ativo,
    updated_at = now();

-- Para a regra de acesso exclusivo, mantem no maximo um vinculo ativo por usuario.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by case when perfil = 'master' then 0 else 1 end, updated_at desc, id desc
    ) as rn
  from public.usuarios_unidades
  where ativo = true
)
update public.usuarios_unidades uu
set ativo = false,
    updated_at = now()
from ranked r
where uu.id = r.id
  and r.rn > 1;

create unique index if not exists uq_usuarios_unidades_one_active_user
on public.usuarios_unidades(user_id)
where ativo = true;

create index if not exists idx_usuarios_unidades_user_active
on public.usuarios_unidades(user_id, ativo);

create index if not exists idx_funcionarios_user_unidade
on public.funcionarios(user_id, unidade_id);

-- 2. Funcoes centrais de perfil/acesso.
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'master'
  );
$$;

create or replace function public.access_profile_for_unidade(target_unidade_id bigint)
returns public.user_profile
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_master() then 'master'::public.user_profile
    else (
      select uu.perfil
      from public.usuarios_unidades uu
      where uu.user_id = auth.uid()
        and uu.ativo = true
        and uu.unidade_id = target_unidade_id
      order by uu.updated_at desc, uu.id desc
      limit 1
    )
  end;
$$;

create or replace function public.can_access_unidade(target_unidade_id bigint)
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
        and uu.ativo = true
        and uu.unidade_id = target_unidade_id
    );
$$;

create or replace function public.access_can_read_unit(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente', 'financeiro', 'tosador');
$$;

create or replace function public.access_can_write_operational(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente');
$$;

create or replace function public.access_can_read_financial(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente', 'financeiro');
$$;

create or replace function public.access_can_write_financial(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente');
$$;

create or replace function public.access_can_view_audit(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'financeiro');
$$;

create or replace function public.access_can_manage_team(target_unidade_id bigint default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master();
$$;

create or replace function public.access_can_view_team(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente', 'financeiro');
$$;

create or replace function public.access_can_read_config(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente');
$$;

create or replace function public.access_can_manage_config(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master');
$$;

-- 3. Fiscal: financeiro passa a ser somente leitura.
create or replace function public.fiscal_profile_for_unidade(target_unidade_id bigint)
returns public.user_profile
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id);
$$;

create or replace function public.fiscal_can_view_config(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'financeiro');
$$;

create or replace function public.fiscal_can_manage_config(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id) = 'master';
$$;

create or replace function public.fiscal_can_view_note(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'financeiro', 'admin_unidade', 'gerente');
$$;

create or replace function public.fiscal_can_create_draft(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente');
$$;

create or replace function public.fiscal_can_edit_draft(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id)
    in ('master', 'admin_unidade', 'gerente');
$$;

create or replace function public.fiscal_can_delete_draft(target_unidade_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.access_profile_for_unidade(target_unidade_id) = 'master';
$$;

-- 4. Protecao contra escrita direta nos campos de acesso.
create or replace function public.guard_usuarios_unidades_direct_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.access_control_rpc', true), '') <> 'salvar_acesso_funcionario' then
    raise exception 'Use a tela Equipe / salvar_acesso_funcionario para alterar acessos.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_usuarios_unidades_direct_write on public.usuarios_unidades;
create trigger guard_usuarios_unidades_direct_write
before insert or update or delete on public.usuarios_unidades
for each row execute function public.guard_usuarios_unidades_direct_write();

create or replace function public.guard_funcionarios_access_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(current_setting('app.access_control_rpc', true), '') <> 'salvar_acesso_funcionario'
    and (
      old.user_id is distinct from new.user_id
      or old.unidade_id is distinct from new.unidade_id
      or old.cargo is distinct from new.cargo
      or old.ativo is distinct from new.ativo
    )
  then
    raise exception 'Use Salvar Acesso na tela Equipe para alterar login, unidade, cargo ou status de acesso.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_funcionarios_access_columns on public.funcionarios;
create trigger guard_funcionarios_access_columns
before update on public.funcionarios
for each row execute function public.guard_funcionarios_access_columns();

-- 5. RPC oficial para liberar/revogar acesso.
create or replace function public.salvar_acesso_funcionario(
  p_funcionario_id bigint,
  p_auth_user_id uuid,
  p_unidade_id bigint,
  p_perfil public.user_profile,
  p_ativo boolean
)
returns table (
  funcionario_id bigint,
  user_id uuid,
  unidade_id bigint,
  perfil public.user_profile,
  ativo boolean,
  status_login text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  funcionario_anterior public.funcionarios;
  funcionario_final public.funcionarios;
  auth_email text;
  unidade_ativa boolean;
  acesso_id bigint;
  audit_action text;
begin
  if requester is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  if not public.is_master() then
    raise exception 'Apenas Master pode liberar ou revogar acesso de funcionario.';
  end if;

  if p_perfil in ('atendente', 'somente_leitura') and coalesce(p_ativo, false) = true then
    raise exception 'Este perfil ainda nao possui permissao definida para liberacao nesta etapa.';
  end if;

  select true into unidade_ativa
  from public.unidades u
  where u.id = p_unidade_id
    and u.ativo = true;

  if coalesce(unidade_ativa, false) is not true then
    raise exception 'Unidade inexistente ou inativa.';
  end if;

  select au.email::text into auth_email
  from auth.users au
  where au.id = p_auth_user_id;

  if auth_email is null then
    raise exception 'Login/auth user informado nao existe.';
  end if;

  select * into funcionario_anterior
  from public.funcionarios f
  where f.id = p_funcionario_id
  for update;

  if not found then
    raise exception 'Funcionario % nao encontrado.', p_funcionario_id;
  end if;

  if funcionario_anterior.email is null
     or lower(btrim(funcionario_anterior.email::text)) <> lower(btrim(auth_email)) then
    raise exception 'O email do login precisa corresponder exatamente ao email cadastrado do funcionario.';
  end if;

  if exists (
    select 1
    from public.funcionarios f
    where f.user_id = p_auth_user_id
      and f.id <> p_funcionario_id
  ) then
    raise exception 'Este login ja esta vinculado a outro funcionario.';
  end if;

  perform set_config('app.access_control_rpc', 'salvar_acesso_funcionario', true);

  update public.usuarios_unidades
  set ativo = false,
      updated_at = now()
  where user_id = p_auth_user_id
    and (unidade_id is distinct from p_unidade_id or perfil is distinct from p_perfil or p_ativo = false);

  if p_ativo then
    insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
    values (p_auth_user_id, p_unidade_id, p_perfil, true)
    on conflict (user_id, unidade_id, perfil) do update
    set ativo = true,
        updated_at = now()
    returning id into acesso_id;
  end if;

  update public.funcionarios
  set user_id = p_auth_user_id,
      unidade_id = p_unidade_id,
      cargo = p_perfil,
      ativo = p_ativo,
      updated_at = now()
  where id = p_funcionario_id
  returning * into funcionario_final;

  audit_action := case
    when p_ativo = false then 'REVOGACAO_ACESSO_FUNCIONARIO'
    when funcionario_anterior.user_id is null then 'LIBERACAO_ACESSO_FUNCIONARIO'
    when funcionario_anterior.cargo is distinct from p_perfil then 'ALTERACAO_CARGO_FUNCIONARIO'
    when funcionario_anterior.unidade_id is distinct from p_unidade_id then 'TROCA_UNIDADE_FUNCIONARIO'
    else 'ATUALIZACAO_ACESSO_FUNCIONARIO'
  end;

  insert into public.auditoria_logs (
    unidade_id,
    user_id,
    usuario_email,
    usuario_nome,
    acao,
    tabela,
    registro_id,
    descricao,
    dados_antes,
    dados_depois
  )
  values (
    p_unidade_id,
    requester,
    (select email from auth.users where id = requester),
    (select nome from public.funcionarios where user_id = requester limit 1),
    audit_action,
    'funcionarios',
    p_funcionario_id,
    'Acesso de funcionario atualizado pela tela Equipe.',
    jsonb_build_object(
      'funcionario_id', funcionario_anterior.id,
      'user_id', funcionario_anterior.user_id,
      'unidade_id', funcionario_anterior.unidade_id,
      'cargo', funcionario_anterior.cargo,
      'ativo', funcionario_anterior.ativo
    ),
    jsonb_build_object(
      'funcionario_id', funcionario_final.id,
      'user_id', funcionario_final.user_id,
      'unidade_id', funcionario_final.unidade_id,
      'cargo', funcionario_final.cargo,
      'ativo', funcionario_final.ativo,
      'usuarios_unidades_id', acesso_id
    )
  );

  return query
  select
    funcionario_final.id,
    funcionario_final.user_id,
    funcionario_final.unidade_id,
    funcionario_final.cargo,
    funcionario_final.ativo,
    case
      when funcionario_final.user_id is null then 'SEM_LOGIN_VINCULADO'
      when funcionario_final.ativo = true then 'ACESSO_ATIVO'
      else 'ACESSO_SUSPENSO'
    end;
end;
$$;

revoke execute on function public.salvar_acesso_funcionario(bigint, uuid, bigint, public.user_profile, boolean) from public;
grant execute on function public.salvar_acesso_funcionario(bigint, uuid, bigint, public.user_profile, boolean) to authenticated;

-- 6. RPC segura para listar logins pendentes sem expor auth.users diretamente.
create or replace function public.listar_logins_pendentes_equipe()
returns table (
  user_id uuid,
  email text,
  criado_em timestamptz,
  funcionario_id bigint,
  funcionario_nome text,
  funcionario_unidade_id bigint,
  funcionario_cargo public.user_profile,
  status_login text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    au.id,
    au.email::text,
    au.created_at,
    f.id,
    f.nome,
    f.unidade_id,
    f.cargo,
    case
      when f.id is null then 'PENDENTE_DE_APROVACAO'
      when f.user_id is null then 'SEM_LOGIN_VINCULADO'
      when exists (
        select 1 from public.usuarios_unidades uu
        where uu.user_id = au.id and uu.ativo = true
      ) then 'ACESSO_ATIVO'
      else 'ACESSO_SUSPENSO'
    end
  from auth.users au
  left join public.funcionarios f
    on lower(btrim(f.email::text)) = lower(btrim(au.email::text))
  where public.is_master()
    and (
      f.id is null
      or f.user_id is null
      or not exists (
        select 1 from public.usuarios_unidades uu
        where uu.user_id = au.id
          and uu.ativo = true
      )
    )
  order by au.created_at desc;
$$;

revoke execute on function public.listar_logins_pendentes_equipe() from public;
grant execute on function public.listar_logins_pendentes_equipe() to authenticated;

-- 7. RLS: remover policies amplas e recriar por papel.
alter table public.usuarios_unidades enable row level security;
alter table public.funcionarios enable row level security;
alter table public.unidades enable row level security;
alter table public.clientes enable row level security;
alter table public.pets enable row level security;
alter table public.pacotes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agendamento_itens enable row level security;
alter table public.despesas enable row level security;
alter table public.financeiro_movimentos enable row level security;
alter table public.financeiro_pagamentos enable row level security;
alter table public.auditoria_logs enable row level security;
alter table public.servicos_unidade enable row level security;
alter table public.notas_fiscais enable row level security;
alter table public.nota_fiscal_itens enable row level security;

drop policy if exists "usuarios_unidades_master_write" on public.usuarios_unidades;
drop policy if exists "usuarios_unidades_read_allowed" on public.usuarios_unidades;
drop policy if exists "usuarios_unidades_read_self_or_master" on public.usuarios_unidades;

create policy "usuarios_unidades_select_self_or_master"
on public.usuarios_unidades for select to authenticated
using (public.is_master() or user_id = auth.uid());

drop policy if exists "funcionarios_master_write" on public.funcionarios;
drop policy if exists "funcionarios_read_allowed" on public.funcionarios;

create policy "funcionarios_select_allowed"
on public.funcionarios for select to authenticated
using (
  public.is_master()
  or user_id = auth.uid()
  or public.access_can_view_team(unidade_id)
);

create policy "funcionarios_insert_master"
on public.funcionarios for insert to authenticated
with check (public.is_master());

create policy "funcionarios_update_master"
on public.funcionarios for update to authenticated
using (public.is_master())
with check (public.is_master());

create policy "funcionarios_delete_master"
on public.funcionarios for delete to authenticated
using (public.is_master());

drop policy if exists "unidades_select_master_or_unit" on public.unidades;
drop policy if exists "unidades_insert_master" on public.unidades;
drop policy if exists "unidades_update_master" on public.unidades;
drop policy if exists "unidades_delete_master" on public.unidades;

create policy "unidades_select_by_access"
on public.unidades for select to authenticated
using (public.can_access_unidade(id));

create policy "unidades_insert_master"
on public.unidades for insert to authenticated
with check (public.is_master());

create policy "unidades_update_master"
on public.unidades for update to authenticated
using (public.is_master())
with check (public.is_master());

create policy "unidades_delete_master"
on public.unidades for delete to authenticated
using (public.is_master());

-- Operacional: gerente/admin/master escrevem. Financeiro e tosador leem conforme escopo.
drop policy if exists "clientes_unit_access" on public.clientes;
create policy "clientes_select_allowed" on public.clientes for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "clientes_insert_operational" on public.clientes for insert to authenticated with check (public.access_can_write_operational(unidade_id));
create policy "clientes_update_operational" on public.clientes for update to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));
create policy "clientes_delete_operational" on public.clientes for delete to authenticated using (public.access_can_write_operational(unidade_id));

drop policy if exists "pets_unit_access" on public.pets;
create policy "pets_select_allowed" on public.pets for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "pets_insert_operational" on public.pets for insert to authenticated with check (public.access_can_write_operational(unidade_id));
create policy "pets_update_operational" on public.pets for update to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));
create policy "pets_delete_operational" on public.pets for delete to authenticated using (public.access_can_write_operational(unidade_id));

drop policy if exists "pacotes_unit_access" on public.pacotes;
create policy "pacotes_select_allowed" on public.pacotes for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "pacotes_insert_operational" on public.pacotes for insert to authenticated with check (public.access_can_write_operational(unidade_id));
create policy "pacotes_update_operational" on public.pacotes for update to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));
create policy "pacotes_delete_operational" on public.pacotes for delete to authenticated using (public.access_can_write_operational(unidade_id));

drop policy if exists "agendamentos_unit_access" on public.agendamentos;
create policy "agendamentos_select_allowed" on public.agendamentos for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "agendamentos_insert_operational" on public.agendamentos for insert to authenticated with check (public.access_can_write_operational(unidade_id));
create policy "agendamentos_update_operational" on public.agendamentos for update to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));
create policy "agendamentos_delete_operational" on public.agendamentos for delete to authenticated using (public.access_can_write_operational(unidade_id));

drop policy if exists "agendamento_itens_unit_access" on public.agendamento_itens;
create policy "agendamento_itens_select_allowed" on public.agendamento_itens for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "agendamento_itens_insert_operational" on public.agendamento_itens for insert to authenticated with check (public.access_can_write_operational(unidade_id));
create policy "agendamento_itens_update_operational" on public.agendamento_itens for update to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));
create policy "agendamento_itens_delete_operational" on public.agendamento_itens for delete to authenticated using (public.access_can_write_operational(unidade_id));

-- Financeiro: financeiro le somente; gerente/admin/master escrevem.
drop policy if exists "financeiro_movimentos_unit_access" on public.financeiro_movimentos;
create policy "financeiro_movimentos_select_allowed" on public.financeiro_movimentos for select to authenticated using (public.access_can_read_financial(unidade_id));
create policy "financeiro_movimentos_insert_allowed" on public.financeiro_movimentos for insert to authenticated with check (public.access_can_write_financial(unidade_id));
create policy "financeiro_movimentos_update_allowed" on public.financeiro_movimentos for update to authenticated using (public.access_can_write_financial(unidade_id)) with check (public.access_can_write_financial(unidade_id));
create policy "financeiro_movimentos_delete_allowed" on public.financeiro_movimentos for delete to authenticated using (public.access_can_write_financial(unidade_id));

drop policy if exists "financeiro_pagamentos_unit_access" on public.financeiro_pagamentos;
create policy "financeiro_pagamentos_select_allowed" on public.financeiro_pagamentos for select to authenticated using (public.access_can_read_financial(unidade_id));
create policy "financeiro_pagamentos_insert_allowed" on public.financeiro_pagamentos for insert to authenticated with check (public.access_can_write_financial(unidade_id));
create policy "financeiro_pagamentos_update_allowed" on public.financeiro_pagamentos for update to authenticated using (public.access_can_write_financial(unidade_id)) with check (public.access_can_write_financial(unidade_id));
create policy "financeiro_pagamentos_delete_allowed" on public.financeiro_pagamentos for delete to authenticated using (public.access_can_write_financial(unidade_id));

drop policy if exists "despesas_unit_access" on public.despesas;
create policy "despesas_select_allowed" on public.despesas for select to authenticated using (public.access_can_read_financial(unidade_id));
create policy "despesas_insert_allowed" on public.despesas for insert to authenticated with check (public.access_can_write_financial(unidade_id));
create policy "despesas_update_allowed" on public.despesas for update to authenticated using (public.access_can_write_financial(unidade_id)) with check (public.access_can_write_financial(unidade_id));
create policy "despesas_delete_allowed" on public.despesas for delete to authenticated using (public.access_can_write_financial(unidade_id));

drop policy if exists "servicos_unidade_unit_access" on public.servicos_unidade;
create policy "servicos_unidade_select_allowed" on public.servicos_unidade for select to authenticated using (public.access_can_read_unit(unidade_id));
create policy "servicos_unidade_write_operational" on public.servicos_unidade for all to authenticated using (public.access_can_write_operational(unidade_id)) with check (public.access_can_write_operational(unidade_id));

-- Auditoria: master e financeiro veem. Insercoes continuam para usuarios com acesso a unidade.
drop policy if exists "auditoria_logs_read_allowed" on public.auditoria_logs;
drop policy if exists "auditoria_logs_insert_allowed" on public.auditoria_logs;
create policy "auditoria_logs_select_master_financeiro"
on public.auditoria_logs for select to authenticated
using (public.access_can_view_audit(unidade_id));

create policy "auditoria_logs_insert_unit_user"
on public.auditoria_logs for insert to authenticated
with check (public.can_access_unidade(unidade_id));

-- Fiscal: financeiro somente leitura; gerente/admin/master operam rascunhos.
drop policy if exists "notas_fiscais_select_allowed" on public.notas_fiscais;
drop policy if exists "notas_fiscais_update_draft_allowed" on public.notas_fiscais;
drop policy if exists "notas_fiscais_delete_draft_allowed" on public.notas_fiscais;

create policy "notas_fiscais_select_allowed"
on public.notas_fiscais for select to authenticated
using (public.fiscal_can_view_note(unidade_id));

create policy "notas_fiscais_update_draft_allowed"
on public.notas_fiscais for update to authenticated
using (status = 'RASCUNHO' and public.fiscal_can_edit_draft(unidade_id))
with check (status = 'RASCUNHO' and public.fiscal_can_edit_draft(unidade_id));

create policy "notas_fiscais_delete_draft_master"
on public.notas_fiscais for delete to authenticated
using (status = 'RASCUNHO' and public.fiscal_can_delete_draft(unidade_id));

drop policy if exists "nota_fiscal_itens_select_allowed" on public.nota_fiscal_itens;
drop policy if exists "nota_fiscal_itens_update_draft_allowed" on public.nota_fiscal_itens;
drop policy if exists "nota_fiscal_itens_delete_draft_allowed" on public.nota_fiscal_itens;

create policy "nota_fiscal_itens_select_allowed"
on public.nota_fiscal_itens for select to authenticated
using (
  exists (
    select 1 from public.notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id
      and public.fiscal_can_view_note(nf.unidade_id)
  )
);

create policy "nota_fiscal_itens_update_draft_allowed"
on public.nota_fiscal_itens for update to authenticated
using (
  exists (
    select 1 from public.notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id
      and nf.status = 'RASCUNHO'
      and public.fiscal_can_edit_draft(nf.unidade_id)
  )
)
with check (
  exists (
    select 1 from public.notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id
      and nf.status = 'RASCUNHO'
      and public.fiscal_can_edit_draft(nf.unidade_id)
  )
);

-- Grants coerentes com RLS. Sem INSERT direto de notas fiscais.
revoke insert on public.notas_fiscais from authenticated;
grant select, update, delete on public.notas_fiscais to authenticated;
grant select, update on public.nota_fiscal_itens to authenticated;
revoke delete on public.nota_fiscal_itens from authenticated;

commit;
