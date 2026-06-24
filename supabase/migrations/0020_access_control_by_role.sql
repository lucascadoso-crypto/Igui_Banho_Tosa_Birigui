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
  and (f.cargo = 'master' or f.unidade_id is not null)
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

-- 3. Protecao contra escrita direta nos campos de acesso.
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

-- 4. RPC oficial para liberar/revogar acesso.
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

-- 5. RPC segura para listar logins pendentes sem expor auth.users diretamente.
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

create or replace function public.listar_logins_pendentes()
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
  select * from public.listar_logins_pendentes_equipe();
$$;

revoke execute on function public.listar_logins_pendentes() from public;
grant execute on function public.listar_logins_pendentes() to authenticated;

commit;
