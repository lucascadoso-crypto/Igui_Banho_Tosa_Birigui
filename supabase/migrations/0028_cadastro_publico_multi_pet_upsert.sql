-- Substitui cadastro_publico_tutor_pet (0027) por uma versao que aceita
-- multiplos pets de uma vez e, em vez de bloquear em caso de CPF duplicado,
-- localiza o cliente existente pelo telefone (fallback: CPF) e sobrescreve
-- os dados com o que o cliente preencheu agora -- usado tanto para o
-- cadastro normal quanto para padronizar clientes antigos que recebem o
-- link e atualizam os proprios dados.
--
-- "Tag" de origem: reaproveita a coluna origem_id (texto livre, ja existia
-- e nao e usada em nenhum outro lugar do front, confirmado por grep) tanto
-- em clientes quanto em pets, marcando 'cadastro_publico' sempre que um
-- registro e criado OU atualizado por aqui. Para listar quem veio do link:
--   select * from clientes where origem_id = 'cadastro_publico';

drop function if exists public.cadastro_publico_tutor_pet(
  bigint, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
);

create or replace function public.cadastro_publico_tutor_pets(
  p_unidade_id bigint,
  p_tutor jsonb,
  p_pets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade_ativa boolean;
  v_cliente_id bigint;
  v_cliente_existente boolean := false;
  v_nome text;
  v_telefone text;
  v_telefone_normalizado text;
  v_cpf text;
  v_cpf_normalizado text;
  v_pet jsonb;
  v_pet_nome text;
  v_pet_id bigint;
  v_pet_resultado jsonb := '[]'::jsonb;
begin
  select ativo into v_unidade_ativa from public.unidades where id = p_unidade_id;
  if v_unidade_ativa is null or v_unidade_ativa = false then
    return jsonb_build_object('ok', false, 'erro', 'unidade_invalida');
  end if;

  v_nome := trim(coalesce(p_tutor->>'nome', ''));
  if v_nome = '' then
    return jsonb_build_object('ok', false, 'erro', 'nome_obrigatorio');
  end if;

  if jsonb_array_length(coalesce(p_pets, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'pet_obrigatorio');
  end if;

  v_telefone := trim(coalesce(p_tutor->>'telefone', ''));
  v_telefone_normalizado := regexp_replace(v_telefone, '\D', '', 'g');
  v_cpf := trim(coalesce(p_tutor->>'cpf', ''));
  v_cpf_normalizado := regexp_replace(v_cpf, '\D', '', 'g');

  -- Localiza cliente existente: telefone primeiro, CPF como fallback.
  if v_telefone_normalizado <> '' then
    select id into v_cliente_id
    from public.clientes
    where regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_telefone_normalizado
    limit 1;
  end if;

  if v_cliente_id is null and v_cpf_normalizado <> '' then
    select id into v_cliente_id
    from public.clientes
    where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_normalizado
    limit 1;
  end if;

  if v_cliente_id is not null then
    v_cliente_existente := true;

    update public.clientes set
      unidade_id = p_unidade_id,
      unidade_preferencial_id = p_unidade_id,
      nome = v_nome,
      telefone = nullif(v_telefone, ''),
      cpf = nullif(v_cpf, ''),
      cep = nullif(trim(coalesce(p_tutor->>'cep', '')), ''),
      logradouro = nullif(trim(coalesce(p_tutor->>'logradouro', '')), ''),
      numero = nullif(trim(coalesce(p_tutor->>'numero', '')), ''),
      bairro = nullif(trim(coalesce(p_tutor->>'bairro', '')), ''),
      cidade = nullif(trim(coalesce(p_tutor->>'cidade', '')), ''),
      estado = nullif(trim(coalesce(p_tutor->>'estado', '')), ''),
      receber_msgs = true,
      origem_id = 'cadastro_publico',
      updated_at = now()
    where id = v_cliente_id;
  else
    insert into public.clientes (
      unidade_id, unidade_preferencial_id, nome, telefone, cpf,
      cep, logradouro, numero, bairro, cidade, estado,
      receber_msgs, origem_id
    ) values (
      p_unidade_id, p_unidade_id, v_nome, nullif(v_telefone, ''), nullif(v_cpf, ''),
      nullif(trim(coalesce(p_tutor->>'cep', '')), ''),
      nullif(trim(coalesce(p_tutor->>'logradouro', '')), ''),
      nullif(trim(coalesce(p_tutor->>'numero', '')), ''),
      nullif(trim(coalesce(p_tutor->>'bairro', '')), ''),
      nullif(trim(coalesce(p_tutor->>'cidade', '')), ''),
      nullif(trim(coalesce(p_tutor->>'estado', '')), ''),
      true, 'cadastro_publico'
    )
    returning id into v_cliente_id;
  end if;

  -- Upsert de cada pet: casa por cliente_id + nome (case-insensitive).
  for v_pet in select * from jsonb_array_elements(p_pets)
  loop
    v_pet_nome := trim(coalesce(v_pet->>'nome', ''));
    if v_pet_nome = '' then
      continue;
    end if;

    select id into v_pet_id
    from public.pets
    where cliente_id = v_cliente_id
      and lower(trim(nome)) = lower(v_pet_nome)
    limit 1;

    if v_pet_id is not null then
      update public.pets set
        genero = nullif(trim(coalesce(v_pet->>'genero', '')), ''),
        especie = nullif(trim(coalesce(v_pet->>'especie', '')), ''),
        raca = nullif(trim(coalesce(v_pet->>'raca', '')), ''),
        porte = nullif(trim(coalesce(v_pet->>'porte', '')), ''),
        restricoes = nullif(trim(coalesce(v_pet->>'restricoes', '')), ''),
        comportamento = nullif(trim(coalesce(v_pet->>'comportamento', '')), ''),
        notas_internas = nullif(trim(coalesce(v_pet->>'notas_internas', '')), ''),
        origem_id = 'cadastro_publico',
        updated_at = now()
      where id = v_pet_id;
    else
      insert into public.pets (
        unidade_id, cliente_id, nome, genero, especie, raca, porte,
        restricoes, comportamento, notas_internas, origem_id
      ) values (
        p_unidade_id, v_cliente_id, v_pet_nome,
        nullif(trim(coalesce(v_pet->>'genero', '')), ''),
        nullif(trim(coalesce(v_pet->>'especie', '')), ''),
        nullif(trim(coalesce(v_pet->>'raca', '')), ''),
        nullif(trim(coalesce(v_pet->>'porte', '')), ''),
        nullif(trim(coalesce(v_pet->>'restricoes', '')), ''),
        nullif(trim(coalesce(v_pet->>'comportamento', '')), ''),
        nullif(trim(coalesce(v_pet->>'notas_internas', '')), ''),
        'cadastro_publico'
      )
      returning id into v_pet_id;
    end if;

    v_pet_resultado := v_pet_resultado || jsonb_build_object('pet_id', v_pet_id, 'pet_nome', v_pet_nome);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', v_cliente_id,
    'cliente_nome', v_nome,
    'cliente_existente', v_cliente_existente,
    'pets', v_pet_resultado
  );
end;
$$;

revoke all on function public.cadastro_publico_tutor_pets(bigint, jsonb, jsonb) from public;
grant execute on function public.cadastro_publico_tutor_pets(bigint, jsonb, jsonb) to anon;
grant execute on function public.cadastro_publico_tutor_pets(bigint, jsonb, jsonb) to authenticated;
