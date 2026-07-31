-- Adiciona coluna de acrescimo real em agendamentos, espelhando exatamente
-- o padrao da coluna valor_desconto (migration 0025_agendamentos_desconto.sql).

alter table public.agendamentos
  add column if not exists valor_acrescimo numeric(10,2) not null default 0;

alter table public.agendamentos
  add constraint agendamentos_valor_acrescimo_nao_negativo
  check (valor_acrescimo >= 0) not valid;

alter table public.agendamentos
  validate constraint agendamentos_valor_acrescimo_nao_negativo;
