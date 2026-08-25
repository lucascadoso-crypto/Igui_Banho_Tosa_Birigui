-- Corrige dois bugs no cadastro publico (/cadastro?unidade=ID):
--
-- 1) telefone_variantes() nao tratava o "0" de discagem/DDD que alguns
--    clientes digitam na frente do numero (ex: "017991618824", 12 digitos).
--    Como o numero completo so era considerado nos formatos de 10/11 digitos,
--    um telefone com esse zero a mais nunca cruzava com a variante "limpa"
--    do mesmo numero ja cadastrado -- cadastro_publico_tutor_pets nao achava
--    o cliente existente e criava um cadastro duplicado (sem a tag "Via
--    Link", porque a atualizacao do cliente antigo simplesmente nao
--    acontecia). Esta migration remove o(s) zero(s) a mais antes de montar
--    as variantes.
--
-- 2) cadastro_publico_tutor_pets so validava nome e pet_obrigatorio; CPF,
--    CEP e endereco sao obrigatorios no formulario (CadastroPublico.tsx) mas
--    nao eram reforcados no servidor. Se o formulario for aberto com um
--    bundle antigo em cache (ou a function for chamada direto), da pra
--    gravar cliente sem endereco/CPF. Passa a validar os mesmos campos
--    obrigatorios do front no servidor.

create or replace function public.telefone_variantes(p_telefone text)
returns text[]
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_sem_ddd text;
  v_variantes text[] := array[]::text[];
begin
  v_digits := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');

  -- Remove zero(s) de discagem na frente (ex: "017991618824" -> "17991618824").
  -- Numero valido com DDD tem no maximo 11 digitos; qualquer coisa alem
  -- disso comecando em "0" e prefixo de discagem, nao parte do numero.
  while length(v_digits) > 11 and left(v_digits, 1) = '0' loop
    v_digits := substr(v_digits, 2);
  end loop;

  if length(v_digits) < 8 then
    return v_variantes;
  end if;

  -- numero completo com DDD (10 ou 11 digitos)
  if length(v_digits) in (10, 11) then
    v_variantes := array_append(v_variantes, v_digits);

    -- alterna com/sem o 9o digito do celular, mantendo o DDD
    if length(v_digits) = 11 then
      v_variantes := array_append(v_variantes, substr(v_digits, 1, 2) || substr(v_digits, 4));
    else
      v_variantes := array_append(v_variantes, substr(v_digits, 1, 2) || '9' || substr(v_digits, 3));
    end if;
  else
    v_variantes := array_append(v_variantes, v_digits);
  end if;

  -- numero sem DDD (8 ou 9 digitos finais), para casar com cadastros antigos
  -- que foram salvos sem o codigo de area
  if length(v_digits) >= 10 then
    v_sem_ddd := substr(v_digits, 3);
  else
    v_sem_ddd := v_digits;
  end if;

  if length(v_sem_ddd) = 9 then
    v_variantes := array_append(v_variantes, v_sem_ddd);
    v_variantes := array_append(v_variantes, substr(v_sem_ddd, 2));
  elsif length(v_sem_ddd) = 8 then
    v_variantes := array_append(v_variantes, v_sem_ddd);
    v_variantes := array_append(v_variantes, '9' || v_sem_ddd);
  else
    v_variantes := array_append(v_variantes, v_sem_ddd);
  end if;

  return (select array_agg(distinct v) from unnest(v_variantes) v where v <> '');
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
  v_cep text;
  v_logradouro text;
  v_numero text;
  v_bairro text;
  v_cidade text;
  v_estado text;
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
  v_cep := trim(coalesce(p_tutor->>'cep', ''));
  v_logradouro := trim(coalesce(p_tutor->>'logradouro', ''));
  v_numero := trim(coalesce(p_tutor->>'numero', ''));
  v_bairro := trim(coalesce(p_tutor->>'bairro', ''));
  v_cidade := trim(coalesce(p_tutor->>'cidade', ''));
  v_estado := trim(coalesce(p_tutor->>'estado', ''));

  if v_telefone_normalizado = '' then
    return jsonb_build_object('ok', false, 'erro', 'telefone_obrigatorio');
  end if;

  if v_cpf_normalizado = '' then
    return jsonb_build_object('ok', false, 'erro', 'cpf_obrigatorio');
  end if;

  if not public.cpf_valido(v_cpf_normalizado) then
    return jsonb_build_object('ok', false, 'erro', 'cpf_invalido');
  end if;

  if v_cep = '' or v_logradouro = '' or v_numero = '' or v_bairro = '' or v_cidade = '' or v_estado = '' then
    return jsonb_build_object('ok', false, 'erro', 'endereco_obrigatorio');
  end if;

  -- Localiza cliente existente: telefone (tolerando DDD/9o digito) primeiro,
  -- CPF como fallback.
  select c.id into v_cliente_id
  from public.clientes c
  where c.ativo = true
    and public.telefone_variantes(v_telefone) && public.telefone_variantes(c.telefone)
  order by (c.telefone = v_telefone) desc, c.id
  limit 1;

  if v_cliente_id is null then
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
      cep = coalesce(nullif(v_cep, ''), cep),
      logradouro = coalesce(nullif(v_logradouro, ''), logradouro),
      numero = coalesce(nullif(v_numero, ''), numero),
      bairro = coalesce(nullif(v_bairro, ''), bairro),
      cidade = coalesce(nullif(v_cidade, ''), cidade),
      estado = coalesce(nullif(v_estado, ''), estado),
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
        'cep', case when v_cliente_antes.cep is distinct from nullif(v_cep, '') and nullif(v_cep, '') is not null
          then jsonb_build_object('antes', v_cliente_antes.cep, 'depois', v_cep) end,
        'logradouro', case when v_cliente_antes.logradouro is distinct from nullif(v_logradouro, '') and nullif(v_logradouro, '') is not null
          then jsonb_build_object('antes', v_cliente_antes.logradouro, 'depois', v_logradouro) end
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
      nullif(v_cep, ''), nullif(v_logradouro, ''), nullif(v_numero, ''),
      nullif(v_bairro, ''), nullif(v_cidade, ''), nullif(v_estado, ''),
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
