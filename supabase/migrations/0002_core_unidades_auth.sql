-- Sistema Pet V2 - core, units, profiles and employees

create table if not exists public.config_sistema (
  id integer primary key default 1,
  nome_fantasia text not null default 'iG Banho e Tosa',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint config_sistema_singleton check (id = 1)
);

create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  cnpj text,
  telefone text,
  endereco_completo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuarios_perfis (
  perfil public.user_profile primary key,
  nome text not null,
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios_unidades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete cascade,
  perfil public.user_profile not null default 'atendente',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_unidades_unidade_required_for_non_master
    check (perfil = 'master' or unidade_id is not null),
  constraint usuarios_unidades_unique_scope
    unique (user_id, unidade_id, perfil)
);

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  nome text not null,
  email citext unique,
  telefone text,
  cargo public.user_profile not null default 'atendente',
  ativo boolean not null default false,
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_config_sistema_updated_at
before update on public.config_sistema
for each row execute function public.set_updated_at();

create trigger set_unidades_updated_at
before update on public.unidades
for each row execute function public.set_updated_at();

create trigger set_usuarios_unidades_updated_at
before update on public.usuarios_unidades
for each row execute function public.set_updated_at();

create trigger set_funcionarios_updated_at
before update on public.funcionarios
for each row execute function public.set_updated_at();

insert into public.usuarios_perfis (perfil, nome, descricao) values
  ('master', 'Master', 'Acesso total ao sistema e a todas as unidades.'),
  ('admin_unidade', 'Administrador da Unidade', 'Administra cadastros, agenda e equipe da unidade.'),
  ('gerente', 'Gerente', 'Gerencia operacao da unidade.'),
  ('financeiro', 'Financeiro', 'Acessa rotinas financeiras e relatorios.'),
  ('atendente', 'Atendente', 'Opera clientes, pets, pacotes e agenda.'),
  ('tosador', 'Tosador/Banhista', 'Acompanha agenda e atendimentos.'),
  ('somente_leitura', 'Somente Leitura', 'Consulta dados sem alterar.')
on conflict (perfil) do update
set nome = excluded.nome,
    descricao = excluded.descricao;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
  display_name text;
  initial_profile public.user_profile := 'atendente';
  initial_active boolean := false;
begin
  select not exists (select 1 from public.funcionarios) into is_first_user;

  if is_first_user then
    initial_profile := 'master';
    initial_active := true;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'full_name',
    initcap(split_part(new.email, '@', 1)),
    'Novo Funcionario'
  );

  insert into public.funcionarios (user_id, nome, email, cargo, ativo)
  values (new.id, display_name, new.email, initial_profile, initial_active)
  on conflict (user_id) do update
  set email = excluded.email,
      nome = coalesce(public.funcionarios.nome, excluded.nome);

  if is_first_user then
    insert into public.usuarios_unidades (user_id, unidade_id, perfil, ativo)
    values (new.id, null, 'master', true)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
