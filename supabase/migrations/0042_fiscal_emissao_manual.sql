-- Fiscal Fase 2: emissao manual de NFS-e (usuario emite no Portal Nacional e
-- registra aqui; nenhuma integracao real com API de emissao nesta fase).
--
-- Aditiva sobre a estrutura da Fase 1 (0019_fiscal_phase1.sql,
-- 0039_fiscal_parametrizacao_me.sql). Nao cria uma tabela nova: a tabela
-- public.notas_fiscais e o RPC criar_rascunho_fiscal_por_movimento() ja
-- cobrem origem (agendamento avulso finalizado / pacote pago), dados sempre
-- frescos e dados fiscais do catalogo da unidade. O que faltava era permitir
-- a nota sair de RASCUNHO.
--
-- R4 (rascunho -> emitida -> cancelada; excluida so a partir de rascunho):
-- 1) Remove a constraint que travava toda nota em RASCUNHO para sempre.
-- 2) Adiciona coluna para guardar o motivo do cancelamento.
-- 3) Ensina o trigger de protecao (fiscal_protect_nota_fiscal) a permitir
--    exatamente as duas transicoes novas, sem abrir a porta para editar
--    qualquer outro campo.
-- 4) Duas funcoes SECURITY DEFINER (mesmo padrao de
--    criar_rascunho_fiscal_por_movimento) para emitir/cancelar, com a mesma
--    checagem de permissao ja usada para criar/excluir rascunho
--    (fiscal_can_create_draft: master ou perfil 'financeiro' da unidade).
--    A RLS de UPDATE existente (notas_fiscais_update_draft_allowed) exige
--    status = 'RASCUNHO' tanto no USING quanto no WITH CHECK, entao um
--    update direto do cliente jamais consegue mudar o status; so estas
--    funcoes (que rodam com privilegio do dono, contornando a RLS) podem.

begin;

alter table public.notas_fiscais
  add column if not exists motivo_cancelamento text;

alter table public.notas_fiscais
  drop constraint if exists notas_fiscais_status_fase1_check;

create or replace function public.fiscal_protect_nota_fiscal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then

    -- Emissao manual: RASCUNHO -> EMITIDA (via marcar_nota_fiscal_emitida()).
    if old.status = 'RASCUNHO' and new.status = 'EMITIDA' then
      if (
        to_jsonb(new) - array[
          'status',
          'numero_nota',
          'data_emissao',
          'codigo_verificacao',
          'url_documento',
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
          'emitida_por_user_id',
          'updated_at'
        ]::text[]
      ) then
        raise exception 'Emissao manual so pode alterar status, numero da nota, data de emissao e dados de verificacao.';
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

create or replace function public.marcar_nota_fiscal_emitida(
  p_nota_fiscal_id bigint,
  p_numero_nota text,
  p_data_emissao timestamptz,
  p_codigo_verificacao text default null,
  p_url_documento text default null
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
    emitida_por_user_id = auth.uid()
  where id = nota.id
  returning * into nota;

  perform public.fiscal_safe_audit(
    nota.unidade_id,
    'EMISSAO_MANUAL_NOTA_FISCAL',
    'notas_fiscais',
    nota.id,
    'Marcou nota fiscal #' || nota.id::text || ' como emitida manualmente (NFS-e ' || nota.numero_nota || ').',
    null,
    jsonb_build_object('numero_nota', nota.numero_nota, 'data_emissao', nota.data_emissao)
  );

  return nota;
end;
$$;

create or replace function public.cancelar_nota_fiscal(
  p_nota_fiscal_id bigint,
  p_motivo text
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
    raise exception 'Usuario autenticado obrigatorio para cancelar nota fiscal.';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Motivo do cancelamento e obrigatorio.';
  end if;

  select * into nota from public.notas_fiscais where id = p_nota_fiscal_id for update;

  if not found then
    raise exception 'Nota fiscal % nao encontrada.', p_nota_fiscal_id;
  end if;

  if not public.fiscal_can_create_draft(nota.unidade_id) then
    raise exception 'Usuario sem permissao para cancelar nota fiscal nesta unidade.';
  end if;

  if nota.status <> 'EMITIDA' then
    raise exception 'Somente notas emitidas podem ser canceladas.';
  end if;

  update public.notas_fiscais
  set
    status = 'CANCELADA',
    motivo_cancelamento = btrim(p_motivo),
    data_cancelamento = now(),
    cancelada_por_user_id = auth.uid()
  where id = nota.id
  returning * into nota;

  perform public.fiscal_safe_audit(
    nota.unidade_id,
    'CANCELAMENTO_NOTA_FISCAL',
    'notas_fiscais',
    nota.id,
    'Cancelou nota fiscal #' || nota.id::text || '. Motivo: ' || nota.motivo_cancelamento,
    null,
    jsonb_build_object('motivo_cancelamento', nota.motivo_cancelamento)
  );

  return nota;
end;
$$;

revoke execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text) from public;
revoke execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text) from anon;
grant execute on function public.marcar_nota_fiscal_emitida(bigint, text, timestamptz, text, text) to authenticated;

revoke execute on function public.cancelar_nota_fiscal(bigint, text) from public;
revoke execute on function public.cancelar_nota_fiscal(bigint, text) from anon;
grant execute on function public.cancelar_nota_fiscal(bigint, text) to authenticated;

commit;
