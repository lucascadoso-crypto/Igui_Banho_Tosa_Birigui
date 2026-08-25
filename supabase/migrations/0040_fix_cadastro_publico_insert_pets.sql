-- Corrige bug introduzido na 0038: o INSERT de pet novo em
-- cadastro_publico_tutor_pets declarava 11 colunas (..., notas_internas,
-- origem_id) mas so passava 10 valores (faltava o valor de notas_internas),
-- o que faz o Postgres estourar "INSERT has more target columns than
-- expressions" sempre que o cadastro publico tenta criar um pet que ainda
-- nao existe para aquele cliente. O frontend captura esse erro e mostra
-- "Nao foi possivel concluir o cadastro. Verifique os dados e tente
-- novamente." Esta migration apenas reaplica a mesma funcao da 0038 com o
-- valor de notas_internas de volta no INSERT.
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
  v_cliente_antes public.clientes;
  v_campos jsonb := '{}'::jsonb;
  v_novo_valor text;
  v_similar record;
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

  -- Localiza cliente existente: telefone (tolerando DDD/9o digito) primeiro,
  -- CPF como fallback.
  if v_telefone_normalizado <> '' then
    select c.id into v_cliente_id
    from public.clientes c
    where c.ativo = true
      and public.telefone_variantes(v_telefone) && public.telefone_variantes(c.telefone)
    order by (c.telefone = v_telefone) desc, c.id
    limit 1;
  end if;

  if v_cliente_id is null and v_cpf_normalizado <> '' then
    select id into v_cliente_id
    from public.clientes
    where ativo = true
      and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf_normalizado
    limit 1;
  end if;

  if v_cliente_id is not null then
    v_cliente_existente := true;

    select * into v_cliente_antes from public.clientes where id = v_cliente_id;

    -- So sobrescreve o que veio preenchido; campo que o link nao mandou
    -- mantem o valor antigo (nunca apaga dado bom com vazio).
    update public.clientes set
      unidade_id = p_unidade_id,
      unidade_preferencial_id = p_unidade_id,
      nome = coalesce(nullif(v_nome, ''), nome),
      telefone = coalesce(nullif(v_telefone, ''), telefone),
      cpf = coalesce(nullif(v_cpf, ''), cpf),
      cep = coalesce(nullif(trim(coalesce(p_tutor->>'cep', '')), ''), cep),
      logradouro = coalesce(nullif(trim(coalesce(p_tutor->>'logradouro', '')), ''), logradouro),
      numero = coalesce(nullif(trim(coalesce(p_tutor->>'numero', '')), ''), numero),
      bairro = coalesce(nullif(trim(coalesce(p_tutor->>'bairro', '')), ''), bairro),
      cidade = coalesce(nullif(trim(coalesce(p_tutor->>'cidade', '')), ''), cidade),
      estado = coalesce(nullif(trim(coalesce(p_tutor->>'estado', '')), ''), estado),
      receber_msgs = true,
      origem_id = 'cadastro_publico',
      updated_at = now()
    where id = v_cliente_id;

    select
      jsonb_strip_nulls(jsonb_build_object(
        'nome', case when v_cliente_antes.nome is distinct from nullif(v_nome, '') and nullif(v_nome, '') is not null
          then jsonb_build_object('antes', v_cliente_antes.nome, 'depois', v_nome) end,
        'telefone', case when v_cliente_antes.telefone is distinct from nullif(v_telefone, '') and nullif(v_telefone, '') is not null
          then jsonb_build_object('antes', v_cliente_antes.telefone, 'depois', v_telefone) end,
        'cpf', case when v_cliente_antes.cpf is distinct from nullif(v_cpf, '') and nullif(v_cpf, '') is not null
          then jsonb_build_object('antes', v_cliente_antes.cpf, 'depois', v_cpf) end,
        'cep', case when v_cliente_antes.cep is distinct from nullif(trim(coalesce(p_tutor->>'cep', '')), '') and nullif(trim(coalesce(p_tutor->>'cep', '')), '') is not null
          then jsonb_build_object('antes', v_cliente_antes.cep, 'depois', p_tutor->>'cep') end,
        'logradouro', case when v_cliente_antes.logradouro is distinct from nullif(trim(coalesce(p_tutor->>'logradouro', '')), '') and nullif(trim(coalesce(p_tutor->>'logradouro', '')), '') is not null
          then jsonb_build_object('antes', v_cliente_antes.logradouro, 'depois', p_tutor->>'logradouro') end
      ))
    into v_campos;

    perform public.registrar_merge_cliente(v_cliente_id, p_unidade_id, 'cadastro_publico', coalesce(v_campos, '{}'::jsonb));
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

    -- Telefone/CPF nao bateram com ninguem. Se o nome for muito parecido com
    -- um cliente ja existente, nao mescla sozinho: so registra na fila de
    -- revisao manual.
    for v_similar in
      select c.id, similarity(lower(c.nome), lower(v_nome)) as sim
      from public.clientes c
      where c.ativo = true
        and c.id <> v_cliente_id
        and similarity(lower(c.nome), lower(v_nome)) > 0.45
      order by sim desc
      limit 3
    loop
      insert into public.clientes_duplicados_pendentes (
        cliente_id_existente, cliente_id_novo, unidade_id, motivo, similaridade
      ) values (
        v_similar.id, v_cliente_id, p_unidade_id, 'nome_similar', v_similar.sim
      )
      on conflict (cliente_id_existente, cliente_id_novo) where status = 'pendente' do nothing;
    end loop;
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
        genero = coalesce(nullif(trim(coalesce(v_pet->>'genero', '')), ''), genero),
        especie = coalesce(nullif(trim(coalesce(v_pet->>'especie', '')), ''), especie),
        raca = coalesce(nullif(trim(coalesce(v_pet->>'raca', '')), ''), raca),
        porte = coalesce(nullif(trim(coalesce(v_pet->>'porte', '')), ''), porte),
        restricoes = coalesce(nullif(trim(coalesce(v_pet->>'restricoes', '')), ''), restricoes),
        comportamento = coalesce(nullif(trim(coalesce(v_pet->>'comportamento', '')), ''), comportamento),
        notas_internas = coalesce(nullif(trim(coalesce(v_pet->>'notas_internas', '')), ''), notas_internas),
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
