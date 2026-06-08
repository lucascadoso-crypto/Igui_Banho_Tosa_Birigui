-- Sistema Pet V2 - finance

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  nome_item text not null,
  descricao text,
  quantidade integer not null default 1 check (quantidade > 0),
  valor_total numeric(10,2) not null default 0,
  data_despesa date not null default current_date,
  comprovante_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financeiro_movimentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  pacote_id uuid references public.pacotes(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  despesa_id uuid references public.despesas(id) on delete set null,
  tipo public.financeiro_tipo not null,
  categoria text not null,
  descricao text,
  valor_total numeric(10,2) not null default 0,
  data_competencia date not null default current_date,
  data_vencimento date,
  status public.financeiro_status not null default 'pendente',
  origem text,
  origem_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financeiro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  movimento_id uuid not null references public.financeiro_movimentos(id) on delete cascade,
  forma_pagamento public.forma_pagamento not null,
  valor numeric(10,2) not null check (valor > 0),
  pago_em timestamptz not null default now(),
  observacao text,
  created_at timestamptz not null default now()
);

create trigger set_despesas_updated_at
before update on public.despesas
for each row execute function public.set_updated_at();

create trigger set_financeiro_movimentos_updated_at
before update on public.financeiro_movimentos
for each row execute function public.set_updated_at();
