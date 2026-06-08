-- Sistema Pet V2 - base extensions and enums

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  create type public.user_profile as enum (
    'master',
    'admin_unidade',
    'gerente',
    'financeiro',
    'atendente',
    'tosador',
    'somente_leitura'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agendamento_status as enum (
    'agendado',
    'confirmado',
    'em_atendimento',
    'finalizado',
    'cancelado',
    'faltou'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pacote_status as enum (
    'ativo',
    'concluido',
    'cancelado',
    'vencido'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.financeiro_tipo as enum (
    'receita',
    'despesa',
    'estorno'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.financeiro_status as enum (
    'pendente',
    'parcial',
    'pago',
    'cancelado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.forma_pagamento as enum (
    'pix',
    'dinheiro',
    'debito',
    'credito',
    'transferencia',
    'outro'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.whatsapp_status as enum (
    'pendente',
    'enviado',
    'erro',
    'ignorado'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
