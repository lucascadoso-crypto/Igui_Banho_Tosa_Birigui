-- CRM (Prompt 1): colunas aditivas em public.pets para a ficha do pet.
--
-- comportamento_tags: etiquetas estruturadas (multi-select), usadas para
-- alertas rapidos na agenda/painel do agendamento. O campo "comportamento"
-- (texto livre, ja existente) continua do jeito que esta -- as tags sao um
-- complemento, nao um substituto.
--
-- tosa_preferida / tosa_referencia_url: preferencia de tosa do pet e foto de
-- referencia (mesmo fluxo de upload ja usado para pets.foto_url).
--
-- Tabela ja existe (public.pets, 0013_bigint_business_ids.sql) e ja tem RLS
-- ativo com policy baseada em can_access_unidade(unidade_id) e grants para
-- authenticated/service_role -- nao precisa de nova policy/grant so por
-- ganhar colunas novas.

begin;

alter table public.pets
  add column if not exists comportamento_tags text[] not null default '{}'::text[],
  add column if not exists tosa_preferida text,
  add column if not exists tosa_referencia_url text;

alter table public.pets
  add constraint pets_comportamento_tags_valida check (
    comportamento_tags <@ array[
      'docil', 'medroso', 'agitado', 'morde',
      'nao_gosta_secador', 'idoso', 'primeira_vez'
    ]::text[]
  );

comment on column public.pets.comportamento_tags is
  'Etiquetas estruturadas de comportamento (ver CHECK para valores validos). Campo "comportamento" (texto livre) continua em paralelo.';
comment on column public.pets.tosa_preferida is 'Descricao livre da tosa preferida do pet.';
comment on column public.pets.tosa_referencia_url is 'URL da foto de referencia da tosa preferida (upload via imgbb, mesmo fluxo de foto_url).';

commit;
