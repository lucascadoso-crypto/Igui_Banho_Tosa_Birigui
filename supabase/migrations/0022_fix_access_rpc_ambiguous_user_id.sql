-- Sistema Pet V2 - Corrige ambiguidade de user_id na rotina Salvar Acesso.
--
-- Escopo:
-- - Recria apenas as RPCs de acesso usadas pela tela Equipe.
-- - Nao altera dados, fiscal, agenda, financeiro, WhatsApp ou policies operacionais.

begin;

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
  requester_uid uuid := auth.uid();
  funcionario_anterior public.funcionarios;
  funcionario_final public.funcionarios;
  login_email text;
  unidade_ativa boolean;
  acesso_id bigint;
  audit_action text;
begin
  if requester_uid is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  if not public.is_master() then
    raise exception 'Apenas Master pode liberar ou revogar acesso de funcionario.';
  end if;

  if p_perfil in ('atendente', 'somente_leitura') and coalesce(p_ativo, false) = true then
    raise exception 'Este perfil ainda nao possui permissao definida para liberacao nesta etapa.';
  end if;

  select true into unidade_ativa
  from public.unidades as u
  where u.id = p_unidade_id
    and u.ativo = true;

  if coalesce(unidade_ativa, false) is not true then
    raise exception 'Unidade inexistente ou inativa.';
  end if;

  select au.email::text into login_email
  from auth.users as au
  where au.id = p_auth_user_id;

  if login_email is null then
    raise exception 'Login/auth user informado nao existe.';
  end if;

  select f.* into funcionario_anterior
  from public.funcionarios as f
  where f.id = p_funcionario_id
  for update;

  if not found then
    raise exception 'Funcionario % nao encontrado.', p_funcionario_id;
  end if;

  if funcionario_anterior.email is null
     or lower(btrim(funcionario_anterior.email::text)) <> lower(btrim(login_email)) then
    raise exception 'O email do login precisa corresponder exatamente ao email cadastrado do funcionario.';
  end if;

  if exists (
    select 1
    from public.funcionarios as f
    where f.user_id = p_auth_user_id
      and f.id <> p_funcionario_id
  ) then
    raise exception 'Este login ja esta vinculado a outro funcionario.';
  end if;

  perform set_config('app.access_control_rpc', 'salvar_acesso_funcionario', true);

  update public.usuarios_unidades as uu
  set ativo = false,
      updated_at = now()
  where uu.user_id = p_auth_user_id
    and (
      uu.unidade_id is distinct from p_unidade_id
      or uu.perfil is distinct from p_perfil
      or p_ativo = false
    );

  if p_ativo then
    insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
    values (p_auth_user_id, p_unidade_id, p_perfil, true)
    on conflict (user_id, unidade_id, perfil) do update
    set ativo = true,
        updated_at = now()
    returning id into acesso_id;
  end if;

  update public.funcionarios as f
  set user_id = p_auth_user_id,
      unidade_id = p_unidade_id,
      cargo = p_perfil,
      ativo = p_ativo,
      updated_at = now()
  where f.id = p_funcionario_id
  returning f.* into funcionario_final;

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
    requester_uid,
    (select au.email from auth.users as au where au.id = requester_uid),
    (select f.nome from public.funcionarios as f where f.user_id = requester_uid limit 1),
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
    au.id as user_id,
    au.email::text as email,
    au.created_at as criado_em,
    f.id as funcionario_id,
    f.nome as funcionario_nome,
    f.unidade_id as funcionario_unidade_id,
    f.cargo as funcionario_cargo,
    case
      when f.id is null then 'PENDENTE_DE_APROVACAO'
      when f.user_id is null then 'SEM_LOGIN_VINCULADO'
      when exists (
        select 1
        from public.usuarios_unidades as uu
        where uu.user_id = au.id
          and uu.ativo = true
      ) then 'ACESSO_ATIVO'
      else 'ACESSO_SUSPENSO'
    end as status_login
  from auth.users as au
  left join public.funcionarios as f
    on lower(btrim(f.email::text)) = lower(btrim(au.email::text))
  where public.is_master()
    and (
      f.id is null
      or f.user_id is null
      or not exists (
        select 1
        from public.usuarios_unidades as uu
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
  select
    lp.user_id,
    lp.email,
    lp.criado_em,
    lp.funcionario_id,
    lp.funcionario_nome,
    lp.funcionario_unidade_id,
    lp.funcionario_cargo,
    lp.status_login
  from public.listar_logins_pendentes_equipe() as lp;
$$;

revoke execute on function public.listar_logins_pendentes() from public;
grant execute on function public.listar_logins_pendentes() to authenticated;

commit;
