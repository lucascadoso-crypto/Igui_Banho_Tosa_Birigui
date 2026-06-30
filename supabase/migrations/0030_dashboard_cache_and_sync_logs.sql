-- FASE 4.3: Dashboard moderno
-- Cria tabelas de suporte para cache de KPIs e rastreio de sincronizacoes,
-- alem das funcoes/triggers que mantem o cache e os saldos de pacote em dia.

create table if not exists public.sync_logs (
  id bigint generated always as identity primary key,
  unidade_id bigint references public.unidades(id) on delete cascade,
  tipo text not null,
  status text not null,
  registros_afetados integer default 0,
  mensagem text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_sync_logs_unidade on public.sync_logs(unidade_id);
create index if not exists idx_sync_logs_criado_em on public.sync_logs(criado_em);

create table if not exists public.dashboard_cache (
  id bigint generated always as identity primary key,
  unidade_id bigint not null references public.unidades(id) on delete cascade,
  data_cache date not null,
  total_entrada_dia numeric(12, 2) not null default 0,
  total_saida_dia numeric(12, 2) not null default 0,
  saldo_liquido_dia numeric(12, 2) not null default 0,
  total_recebido numeric(12, 2) not null default 0,
  total_pendente numeric(12, 2) not null default 0,
  agendamentos_dia integer not null default 0,
  agendamentos_concluidos integer not null default 0,
  pacotes_vencendo integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, data_cache)
);

create index if not exists idx_dashboard_cache_data on public.dashboard_cache(data_cache);

alter table public.sync_logs enable row level security;
alter table public.dashboard_cache enable row level security;

drop policy if exists "sync_logs_select_authenticated" on public.sync_logs;
create policy "sync_logs_select_authenticated"
  on public.sync_logs for select
  to authenticated
  using (true);

drop policy if exists "dashboard_cache_select_authenticated" on public.dashboard_cache;
create policy "dashboard_cache_select_authenticated"
  on public.dashboard_cache for select
  to authenticated
  using (true);

-- Funcao utilitaria: recalcula o cache de um dia/unidade a partir dos dados operacionais.
create or replace function public.fn_refresh_dashboard_cache(p_unidade_id bigint, p_data date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_entrada numeric(12, 2);
  v_saida numeric(12, 2);
  v_recebido numeric(12, 2);
  v_pendente numeric(12, 2);
  v_agendamentos integer;
  v_concluidos integer;
  v_pacotes_vencendo integer;
begin
  select coalesce(sum(valor_total), 0) filter (where pago = true)
    into v_entrada
  from public.agendamentos
  where unidade_id = p_unidade_id
    and data_agendamento = p_data
    and status <> 'Cancelado';

  select coalesce(sum(valor_total), 0)
    into v_saida
  from public.despesas
  where unidade_id = p_unidade_id
    and data_despesa = p_data;

  select
    coalesce(sum(valor_total) filter (where pago = true), 0),
    coalesce(sum(valor_total) filter (where pago is distinct from true), 0),
    count(*) filter (where status <> 'Cancelado'),
    count(*) filter (where status = 'Concluido')
  into v_recebido, v_pendente, v_agendamentos, v_concluidos
  from public.agendamentos
  where unidade_id = p_unidade_id
    and data_agendamento = p_data;

  select count(*)
    into v_pacotes_vencendo
  from public.pacotes
  where unidade_id = p_unidade_id
    and ativo = true
    and data_fim is not null
    and data_fim between current_date and current_date + 7;

  insert into public.dashboard_cache (
    unidade_id, data_cache, total_entrada_dia, total_saida_dia, saldo_liquido_dia,
    total_recebido, total_pendente, agendamentos_dia, agendamentos_concluidos,
    pacotes_vencendo, updated_at
  )
  values (
    p_unidade_id, p_data, v_entrada, v_saida, v_entrada - v_saida,
    v_recebido, v_pendente, v_agendamentos, v_concluidos,
    v_pacotes_vencendo, now()
  )
  on conflict (unidade_id, data_cache) do update set
    total_entrada_dia = excluded.total_entrada_dia,
    total_saida_dia = excluded.total_saida_dia,
    saldo_liquido_dia = excluded.saldo_liquido_dia,
    total_recebido = excluded.total_recebido,
    total_pendente = excluded.total_pendente,
    agendamentos_dia = excluded.agendamentos_dia,
    agendamentos_concluidos = excluded.agendamentos_concluidos,
    pacotes_vencendo = excluded.pacotes_vencendo,
    updated_at = now();

  insert into public.sync_logs (unidade_id, tipo, status, registros_afetados, mensagem)
  values (p_unidade_id, 'dashboard_cache', 'sucesso', 1, format('Cache atualizado para %s', p_data));
end;
$$;

-- Trigger: ao gravar/atualizar agendamento, refaz o cache do dia/unidade.
create or replace function public.fn_sync_dashboard_cache_on_agendamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.fn_refresh_dashboard_cache(new.unidade_id, new.data_agendamento);
  return new;
end;
$$;

drop trigger if exists trg_sync_dashboard_cache_on_agendamento on public.agendamentos;
create trigger trg_sync_dashboard_cache_on_agendamento
after insert or update of valor_total, pago, status, data_agendamento
on public.agendamentos
for each row
execute function public.fn_sync_dashboard_cache_on_agendamento();

-- Trigger: ao gravar/atualizar despesa, refaz o cache do dia/unidade.
create or replace function public.fn_sync_dashboard_cache_on_despesa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.fn_refresh_dashboard_cache(new.unidade_id, new.data_despesa);
  return new;
end;
$$;

drop trigger if exists trg_sync_dashboard_cache_on_despesa on public.despesas;
create trigger trg_sync_dashboard_cache_on_despesa
after insert or update of valor_total, valor, data_despesa
on public.despesas
for each row
execute function public.fn_sync_dashboard_cache_on_despesa();
