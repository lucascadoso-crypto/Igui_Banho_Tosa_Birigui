-- Sistema Pet V2 - WhatsApp, audit and future migration bookkeeping

create table if not exists public.whatsapp_configuracoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null unique references public.unidades(id) on delete cascade,
  provider text not null default 'evolution_api',
  nome_instancia text,
  url_servidor text,
  token_secret_name text,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  telefone text,
  tipo text not null default 'manual',
  mensagem text,
  status public.whatsapp_status not null default 'pendente',
  provider_message_id text,
  detalhe_erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria_logs (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  usuario_email citext,
  usuario_nome text,
  acao text not null,
  tabela text,
  registro_id uuid,
  descricao text,
  dados_antes jsonb,
  dados_depois jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.migration_imports (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete set null,
  origem text not null,
  tipo text not null,
  status text not null default 'planejado',
  total_registros integer not null default 0,
  total_importados integer not null default 0,
  total_erros integer not null default 0,
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.migration_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.migration_imports(id) on delete cascade,
  tipo text not null,
  origem_id text,
  payload jsonb,
  erro text not null,
  created_at timestamptz not null default now()
);

create trigger set_whatsapp_configuracoes_updated_at
before update on public.whatsapp_configuracoes
for each row execute function public.set_updated_at();
