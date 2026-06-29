-- Pagina publica de cadastro (/cadastro?unidade=ID), sem login.
-- clientes/pets so tem policies para a role authenticated (can_access_unidade),
-- entao a escrita publica nao pode usar INSERT direto nessas tabelas.
-- Em vez de abrir uma policy nova de INSERT para anon, seguimos o padrao ja
-- usado no projeto (RPC SECURITY DEFINER, como salvar_acesso_funcionario):
-- a function valida a unidade, insere cliente+pet de forma atomica e e a
-- unica porta de entrada exposta para anon. Nenhuma policy de RLS muda.

-- Retorna apenas os campos seguros da unidade (nome/telefone) para a tela
-- publica montar o cabecalho e o botao "Falar com a gente". unidades nao
-- tem nenhuma policy para anon hoje (so authenticated), entao isso nao
-- expoe whatsapp_token nem nenhum outro campo sensivel.
create or replace function public.unidade_publica_info(p_unidade_id bigint)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when id is null then null else
    jsonb_build_object('id', id, 'nome', nome, 'telefone', telefone)
  end
  from public.unidades
  where id = p_unidade_id
    and ativo = true;
$$;

revoke all on function public.unidade_publica_info(bigint) from public;
grant execute on function public.unidade_publica_info(bigint) to anon;
grant execute on function public.unidade_publica_info(bigint) to authenticated;

create or replace function public.cadastro_publico_tutor_pet(
  p_unidade_id bigint,
  p_nome text,
  p_telefone text,
  p_cpf text default null,
  p_cep text default null,
  p_logradouro text default null,
  p_numero text default null,
  p_bairro text default null,
  p_cidade text default null,
  p_estado text default null,
  p_pet_nome text default null,
  p_pet_genero text default null,
  p_pet_especie text default null,
  p_pet_raca text default null,
  p_pet_porte text default null,
  p_pet_restricoes text default null,
  p_pet_comportamento text default null,
  p_pet_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade_ativa boolean;
  v_cliente_id bigint;
  v_pet_id bigint;
  v_cpf_normalizado text;
  v_existing_id bigint;
begin
  select ativo into v_unidade_ativa from public.unidades where id = p_unidade_id;
  if v_unidade_ativa is null or v_unidade_ativa = false then
    return jsonb_build_object('ok', false, 'erro', 'unidade_invalida');
  end if;

  if coalesce(trim(p_nome), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'nome_obrigatorio');
  end if;

  v_cpf_normalizado := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  if v_cpf_normalizado <> '' then
    select id into v_existing_id
    from public.clientes
    where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_normalizado
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'erro', 'cpf_duplicado');
    end if;
  end if;

  insert into public.clientes (
    unidade_id, unidade_preferencial_id, nome, telefone, cpf,
    cep, logradouro, numero, bairro, cidade, estado,
    receber_msgs, origem_id
  ) values (
    p_unidade_id, p_unidade_id, trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cpf), ''),
    nullif(trim(p_cep), ''), nullif(trim(p_logradouro), ''), nullif(trim(p_numero), ''),
    nullif(trim(p_bairro), ''), nullif(trim(p_cidade), ''), nullif(trim(p_estado), ''),
    true, 'cadastro_publico'
  )
  returning id into v_cliente_id;

  insert into public.pets (
    unidade_id, cliente_id, nome, genero, especie, raca, porte,
    restricoes, comportamento, notas_internas, origem_id
  ) values (
    p_unidade_id, v_cliente_id, nullif(trim(p_pet_nome), ''), nullif(trim(p_pet_genero), ''),
    nullif(trim(p_pet_especie), ''), nullif(trim(p_pet_raca), ''), nullif(trim(p_pet_porte), ''),
    nullif(trim(p_pet_restricoes), ''), nullif(trim(p_pet_comportamento), ''), nullif(trim(p_pet_notas), ''),
    'cadastro_publico'
  )
  returning id into v_pet_id;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', v_cliente_id,
    'pet_id', v_pet_id,
    'cliente_nome', trim(p_nome),
    'pet_nome', trim(p_pet_nome)
  );
end;
$$;

revoke all on function public.cadastro_publico_tutor_pet(
  bigint, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) from public;
grant execute on function public.cadastro_publico_tutor_pet(
  bigint, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) to anon;
grant execute on function public.cadastro_publico_tutor_pet(
  bigint, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) to authenticated;
