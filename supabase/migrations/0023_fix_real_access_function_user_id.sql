-- Sistema Pet V2 - Corrige a origem real da ambiguidade no Salvar Acesso.
--
-- Diagnostico:
-- - A ambiguidade acontecia no ON CONFLICT (user_id, unidade_id, perfil)
--   da RPC public.salvar_acesso_funcionario.
-- - Como a funcao retorna TABLE com coluna user_id, o PL/pgSQL tratava
--   user_id como potencial variavel de retorno e coluna de tabela.
--
-- Escopo:
-- - Recria somente public.salvar_acesso_funcionario.
-- - Nao altera dados, fiscal, agenda, financeiro, WhatsApp, rotas ou visual.

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
  v_requester_uid uuid := auth.uid();
  v_funcionario_anterior public.funcionarios;
  v_funcionario_final public.funcionarios;
  v_login_email text;
  v_unidade_ativa boolean;
  v_acesso_id bigint;
  v_audit_action text;
begin
  if v_requester_uid is null then
    raise exception 'Usuario autenticado obrigatorio.';
  end if;

  if not public.is_master() then
    raise exception 'Apenas Master pode liberar ou revogar acesso de funcionario.';
  end if;

  if p_perfil in ('atendente', 'somente_leitura') and coalesce(p_ativo, false) = true then
    raise exception 'Este perfil ainda nao possui permissao definida para liberacao nesta etapa.';
  end if;

  select true into v_unidade_ativa
  from public.unidades as u
  where u.id = p_unidade_id
    and u.ativo = true;

  if coalesce(v_unidade_ativa, false) is not true then
    raise exception 'Unidade inexistente ou inativa.';
  end if;

  select au.email::text into v_login_email
  from auth.users as au
  where au.id = p_auth_user_id;

  if v_login_email is null then
    raise exception 'Login/auth user informado nao existe.';
  end if;

  select f.* into v_funcionario_anterior
  from public.funcionarios as f
  where f.id = p_funcionario_id
  for update;

  if not found then
    raise exception 'Funcionario % nao encontrado.', p_funcionario_id;
  end if;

  if v_funcionario_anterior.email is null
     or lower(btrim(v_funcionario_anterior.email::text)) <> lower(btrim(v_login_email)) then
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
    update public.usuarios_unidades as uu
    set ativo = true,
        updated_at = now()
    where uu.user_id = p_auth_user_id
      and uu.unidade_id = p_unidade_id
      and uu.perfil = p_perfil
    returning uu.id into v_acesso_id;

    if v_acesso_id is null then
      insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
      values (p_auth_user_id, p_unidade_id, p_perfil, true)
      returning id into v_acesso_id;
    end if;
  end if;

  update public.funcionarios as f
  set user_id = p_auth_user_id,
      unidade_id = p_unidade_id,
      cargo = p_perfil,
      ativo = p_ativo,
      updated_at = now()
  where f.id = p_funcionario_id
  returning f.* into v_funcionario_final;

  v_audit_action := case
    when p_ativo = false then 'REVOGACAO_ACESSO_FUNCIONARIO'
    when v_funcionario_anterior.user_id is null then 'LIBERACAO_ACESSO_FUNCIONARIO'
    when v_funcionario_anterior.cargo is distinct from p_perfil then 'ALTERACAO_CARGO_FUNCIONARIO'
    when v_funcionario_anterior.unidade_id is distinct from p_unidade_id then 'TROCA_UNIDADE_FUNCIONARIO'
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
    v_requester_uid,
    (select au.email from auth.users as au where au.id = v_requester_uid),
    (select f.nome from public.funcionarios as f where f.user_id = v_requester_uid limit 1),
    v_audit_action,
    'funcionarios',
    p_funcionario_id,
    'Acesso de funcionario atualizado pela tela Equipe.',
    jsonb_build_object(
      'funcionario_id', v_funcionario_anterior.id,
      'user_id', v_funcionario_anterior.user_id,
      'unidade_id', v_funcionario_anterior.unidade_id,
      'cargo', v_funcionario_anterior.cargo,
      'ativo', v_funcionario_anterior.ativo
    ),
    jsonb_build_object(
      'funcionario_id', v_funcionario_final.id,
      'user_id', v_funcionario_final.user_id,
      'unidade_id', v_funcionario_final.unidade_id,
      'cargo', v_funcionario_final.cargo,
      'ativo', v_funcionario_final.ativo,
      'usuarios_unidades_id', v_acesso_id
    )
  );

  return query
  select
    v_funcionario_final.id,
    v_funcionario_final.user_id,
    v_funcionario_final.unidade_id,
    v_funcionario_final.cargo,
    v_funcionario_final.ativo,
    case
      when v_funcionario_final.user_id is null then 'SEM_LOGIN_VINCULADO'
      when v_funcionario_final.ativo = true then 'ACESSO_ATIVO'
      else 'ACESSO_SUSPENSO'
    end;
end;
$$;

revoke execute on function public.salvar_acesso_funcionario(bigint, uuid, bigint, public.user_profile, boolean) from public;
grant execute on function public.salvar_acesso_funcionario(bigint, uuid, bigint, public.user_profile, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
