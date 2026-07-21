-- Fiscal Fase 4: emissao real via API (Sefin Nacional). A trigger de
-- protecao (fiscal_protect_nota_fiscal, criada em 0042) so deixava a
-- transicao RASCUNHO -> EMITIDA alterar numero_nota, data_emissao,
-- codigo_verificacao e url_documento - nao deixava gravar chave_acesso,
-- xml_documento nem resposta_integracao, que sao exatamente os dados que a
-- Sefin Nacional devolve numa emissao real via nfse-teste-envio-dps.
--
-- Aditiva: mesma funcao, so amplia a lista de campos permitidos nessa
-- transicao especifica. Nao muda nenhum outro comportamento (cancelamento,
-- edicao de rascunho continuam identicos).

begin;

create or replace function public.fiscal_protect_nota_fiscal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then

    -- Emissao manual ou via API: RASCUNHO -> EMITIDA.
    if old.status = 'RASCUNHO' and new.status = 'EMITIDA' then
      if (
        to_jsonb(new) - array[
          'status',
          'numero_nota',
          'data_emissao',
          'codigo_verificacao',
          'url_documento',
          'chave_acesso',
          'xml_documento',
          'resposta_integracao',
          'emitida_por_user_id',
          'updated_at'
        ]::text[]
      ) <> (
        to_jsonb(old) - array[
          'status',
          'numero_nota',
          'data_emissao',
          'codigo_verificacao',
          'url_documento',
          'chave_acesso',
          'xml_documento',
          'resposta_integracao',
          'emitida_por_user_id',
          'updated_at'
        ]::text[]
      ) then
        raise exception 'Emissao so pode alterar status, numero da nota, data de emissao, dados de verificacao e dados de integracao.';
      end if;

      return new;
    end if;

    -- Cancelamento: EMITIDA -> CANCELADA (via cancelar_nota_fiscal()).
    if old.status = 'EMITIDA' and new.status = 'CANCELADA' then
      if (
        to_jsonb(new) - array[
          'status',
          'motivo_cancelamento',
          'data_cancelamento',
          'cancelada_por_user_id',
          'updated_at'
        ]::text[]
      ) <> (
        to_jsonb(old) - array[
          'status',
          'motivo_cancelamento',
          'data_cancelamento',
          'cancelada_por_user_id',
          'updated_at'
        ]::text[]
      ) then
        raise exception 'Cancelamento so pode alterar status, motivo e dados de cancelamento.';
      end if;

      return new;
    end if;

    if old.status is distinct from 'RASCUNHO' then
      raise exception 'Somente rascunhos fiscais podem ser editados nesta fase.';
    end if;

    if new.status is distinct from 'RASCUNHO' then
      raise exception 'Transicao de status nao permitida nesta fase.';
    end if;

    if (
      to_jsonb(new) - array[
        'data_competencia',
        'descricao_servico',
        'observacoes_fiscais',
        'tomador_nome',
        'tomador_cpf_cnpj',
        'tomador_email',
        'tomador_telefone',
        'tomador_endereco',
        'atualizada_por_user_id',
        'updated_at'
      ]::text[]
    ) <> (
      to_jsonb(old) - array[
        'data_competencia',
        'descricao_servico',
        'observacoes_fiscais',
        'tomador_nome',
        'tomador_cpf_cnpj',
        'tomador_email',
        'tomador_telefone',
        'tomador_endereco',
        'atualizada_por_user_id',
        'updated_at'
      ]::text[]
    ) then
      raise exception 'Somente data de competencia, descricao, observacoes fiscais e dados do tomador podem ser alterados no rascunho fiscal nesta fase.';
    end if;

    new.atualizada_por_user_id := auth.uid();

    perform public.fiscal_safe_audit(
      new.unidade_id,
      'EDICAO_RASCUNHO_FISCAL',
      'notas_fiscais',
      new.id,
      'Editou campos permitidos do rascunho fiscal #' || new.id::text || '.',
      jsonb_build_object(
        'data_competencia', old.data_competencia,
        'descricao_servico', old.descricao_servico,
        'observacoes_fiscais', old.observacoes_fiscais,
        'tomador_nome', old.tomador_nome,
        'tomador_email', old.tomador_email,
        'tomador_telefone', old.tomador_telefone,
        'tomador_endereco', old.tomador_endereco
      ),
      jsonb_build_object(
        'data_competencia', new.data_competencia,
        'descricao_servico', new.descricao_servico,
        'observacoes_fiscais', new.observacoes_fiscais,
        'tomador_nome', new.tomador_nome,
        'tomador_email', new.tomador_email,
        'tomador_telefone', new.tomador_telefone,
        'tomador_endereco', new.tomador_endereco
      )
    );
  end if;

  return new;
end;
$$;

-- Permite a emissao via API definir chave_acesso/xml_documento/
-- resposta_integracao junto com numero_nota/data_emissao, no mesmo RPC ja
-- usado pela emissao manual (marcar_nota_fiscal_emitida). Mesma checagem de
-- permissao (fiscal_can_create_draft) e mesmo padrao SECURITY DEFINER das
-- funcoes de 0042.
--
-- Assinatura muda (3 parametros novos) - precisa dropar a versao antiga de
-- 5 parametros primeiro, senao ficam duas funcoes sobrepostas e uma chamada
-- via RPC com nomes de parametro parciais fica ambigua para o PostgREST.
drop function if exists public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text);

create or replace function public.marcar_nota_fiscal_emitida(
  p_nota_fiscal_id bigint,
  p_numero_nota text,
  p_data_emissao timestamptz,
  p_codigo_verificacao text default null,
  p_url_documento text default null,
  p_chave_acesso text default null,
  p_xml_documento text default null,
  p_resposta_integracao jsonb default null
)
returns public.notas_fiscais
language plpgsql
security definer
set search_path = public
as $$
declare
  nota public.notas_fiscais;
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio para emitir nota fiscal.';
  end if;

  select * into nota from public.notas_fiscais where id = p_nota_fiscal_id for update;

  if not found then
    raise exception 'Nota fiscal % nao encontrada.', p_nota_fiscal_id;
  end if;

  if not public.fiscal_can_create_draft(nota.unidade_id) then
    raise exception 'Usuario sem permissao para emitir nota fiscal nesta unidade.';
  end if;

  if nota.status <> 'RASCUNHO' then
    raise exception 'Somente rascunhos podem ser marcados como emitidos.';
  end if;

  if coalesce(btrim(p_numero_nota), '') = '' then
    raise exception 'Numero da NFS-e e obrigatorio para marcar como emitida.';
  end if;

  if p_data_emissao is null then
    raise exception 'Data de emissao e obrigatoria para marcar como emitida.';
  end if;

  update public.notas_fiscais
  set
    status = 'EMITIDA',
    numero_nota = btrim(p_numero_nota),
    data_emissao = p_data_emissao,
    codigo_verificacao = nullif(btrim(coalesce(p_codigo_verificacao, '')), ''),
    url_documento = nullif(btrim(coalesce(p_url_documento, '')), ''),
    chave_acesso = nullif(btrim(coalesce(p_chave_acesso, '')), ''),
    xml_documento = p_xml_documento,
    resposta_integracao = coalesce(p_resposta_integracao, resposta_integracao),
    emitida_por_user_id = auth.uid()
  where id = nota.id
  returning * into nota;

  perform public.fiscal_safe_audit(
    nota.unidade_id,
    'EMISSAO_NOTA_FISCAL',
    'notas_fiscais',
    nota.id,
    'Marcou nota fiscal #' || nota.id::text || ' como emitida (NFS-e ' || nota.numero_nota || ').',
    null,
    jsonb_build_object('numero_nota', nota.numero_nota, 'data_emissao', nota.data_emissao, 'chave_acesso', nota.chave_acesso)
  );

  return nota;
end;
$$;

revoke execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text, text, text, jsonb) from public;
revoke execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text, text, text, jsonb) from anon;
grant execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text, text, text, jsonb) to authenticated;

commit;
