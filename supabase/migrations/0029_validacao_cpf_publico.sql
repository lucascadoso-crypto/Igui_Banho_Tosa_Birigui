-- Validacao real de CPF (mesmo algoritmo de digito verificador usado no
-- frontend de CadastroPublico.tsx), aplicada tambem dentro da RPC publica
-- para que um CPF falso (ex: 999.999.999-99) nao seja aceito mesmo que
-- alguem chame a function diretamente, sem passar pela tela.

create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_sum integer;
  v_rest integer;
  v_d1 integer;
  v_d2 integer;
  i integer;
begin
  v_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  if length(v_digits) <> 11 then
    return false;
  end if;

  if v_digits ~ '^(\d)\1{10}$' then
    return false;
  end if;

  v_sum := 0;
  for i in 0..8 loop
    v_sum := v_sum + (substring(v_digits from i + 1 for 1)::integer) * (10 - i);
  end loop;
  v_rest := (v_sum * 10) % 11;
  v_d1 := case when v_rest = 10 then 0 else v_rest end;
  if v_d1 <> substring(v_digits from 10 for 1)::integer then
    return false;
  end if;

  v_sum := 0;
  for i in 0..9 loop
    v_sum := v_sum + (substring(v_digits from i + 1 for 1)::integer) * (11 - i);
  end loop;
  v_rest := (v_sum * 10) % 11;
  v_d2 := case when v_rest = 10 then 0 else v_rest end;
  if v_d2 <> substring(v_digits from 11 for 1)::integer then
    return false;
  end if;

  return true;
end;
$$;

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

  if v_cpf_normalizado <> '' and not public.cpf_valido(v_cpf_normalizado) then
    return jsonb_build_object('ok', false, 'erro', 'cpf_invalido');
  end if;

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
