-- Sistema Pet V2 - clients, pets and services

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  nome text not null,
  telefone text,
  telefone_adicional text,
  email citext,
  cpf text,
  data_nascimento date,
  nacionalidade text default 'Brasil',
  genero text,
  receber_msgs boolean not null default true,
  notas_internas text,
  restricoes text,
  logradouro text,
  cep text,
  numero text,
  bairro text,
  complemento text,
  cidade text,
  estado text,
  foto_url text,
  origem_id text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  data_nascimento date,
  genero text,
  especie text,
  raca text,
  porte text,
  comportamento text,
  notas_internas text,
  restricoes text,
  foto_url text,
  origem_id text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  preco_base numeric(10,2) not null default 0,
  duracao_minutos integer,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servicos_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete cascade,
  preco numeric(10,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, servico_id)
);

create trigger set_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

create trigger set_pets_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

create trigger set_servicos_updated_at
before update on public.servicos
for each row execute function public.set_updated_at();

create trigger set_servicos_unidade_updated_at
before update on public.servicos_unidade
for each row execute function public.set_updated_at();
