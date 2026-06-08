-- Sistema Pet V2 - packages and appointments

create table if not exists public.pacotes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete restrict,
  servico_id uuid references public.servicos(id) on delete set null,
  nome text,
  qtd_sessoes integer not null default 4 check (qtd_sessoes > 0),
  valor_total numeric(10,2) not null default 0,
  valor_transporte numeric(10,2) not null default 0,
  status public.pacote_status not null default 'ativo',
  renovacao_automatica boolean not null default false,
  pacote_anterior_id uuid references public.pacotes(id) on delete set null,
  ciclo_renovacao integer not null default 1,
  data_inicio date,
  data_fim date,
  origem_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete restrict,
  pacote_id uuid references public.pacotes(id) on delete set null,
  numero_sessao integer,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  data_agendamento date not null,
  horario_inicio time not null,
  horario_fim time,
  status public.agendamento_status not null default 'agendado',
  tem_taxi boolean not null default false,
  endereco_busca text,
  valor_servicos numeric(10,2) not null default 0,
  valor_transporte numeric(10,2) not null default 0,
  valor_extra_total numeric(10,2) not null default 0,
  status_pagamento_extra public.financeiro_status not null default 'pendente',
  data_inicio_real timestamptz,
  data_fim_real timestamptz,
  lembrete_enviado boolean not null default false,
  origem_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agendamentos_numero_sessao_positive check (numero_sessao is null or numero_sessao > 0)
);

create table if not exists public.agendamento_itens (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  servico_id uuid references public.servicos(id) on delete set null,
  valor_cobrado numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create trigger set_pacotes_updated_at
before update on public.pacotes
for each row execute function public.set_updated_at();

create trigger set_agendamentos_updated_at
before update on public.agendamentos
for each row execute function public.set_updated_at();
