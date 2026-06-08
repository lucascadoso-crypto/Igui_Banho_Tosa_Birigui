-- Sistema Pet V2 - row level security

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.perfil = 'master'
      and uu.ativo = true
  );
$$;

create or replace function public.can_access_unidade(target_unidade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master()
    or exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = auth.uid()
        and uu.unidade_id = target_unidade_id
        and uu.ativo = true
    );
$$;

alter table public.config_sistema enable row level security;
alter table public.unidades enable row level security;
alter table public.usuarios_perfis enable row level security;
alter table public.usuarios_unidades enable row level security;
alter table public.funcionarios enable row level security;
alter table public.clientes enable row level security;
alter table public.pets enable row level security;
alter table public.servicos enable row level security;
alter table public.servicos_unidade enable row level security;
alter table public.pacotes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agendamento_itens enable row level security;
alter table public.despesas enable row level security;
alter table public.financeiro_movimentos enable row level security;
alter table public.financeiro_pagamentos enable row level security;
alter table public.whatsapp_configuracoes enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.auditoria_logs enable row level security;
alter table public.migration_imports enable row level security;
alter table public.migration_errors enable row level security;

create policy "config_read_authenticated"
on public.config_sistema for select
to authenticated
using (true);

create policy "config_master_write"
on public.config_sistema for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "perfis_read_authenticated"
on public.usuarios_perfis for select
to authenticated
using (true);

create policy "unidades_read_allowed"
on public.unidades for select
to authenticated
using (public.is_master() or public.can_access_unidade(id));

create policy "unidades_master_write"
on public.unidades for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "usuarios_unidades_read_self_or_master"
on public.usuarios_unidades for select
to authenticated
using (public.is_master() or user_id = auth.uid() or public.can_access_unidade(unidade_id));

create policy "usuarios_unidades_master_write"
on public.usuarios_unidades for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "funcionarios_read_allowed"
on public.funcionarios for select
to authenticated
using (public.is_master() or user_id = auth.uid() or public.can_access_unidade(unidade_id));

create policy "funcionarios_master_write"
on public.funcionarios for all
to authenticated
using (public.is_master())
with check (public.is_master() or public.can_access_unidade(unidade_id));

create policy "servicos_read_authenticated"
on public.servicos for select
to authenticated
using (true);

create policy "servicos_master_write"
on public.servicos for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "clientes_unit_access"
on public.clientes for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "pets_unit_access"
on public.pets for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "servicos_unidade_unit_access"
on public.servicos_unidade for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "pacotes_unit_access"
on public.pacotes for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "agendamentos_unit_access"
on public.agendamentos for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "agendamento_itens_unit_access"
on public.agendamento_itens for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "despesas_unit_access"
on public.despesas for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "financeiro_movimentos_unit_access"
on public.financeiro_movimentos for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "financeiro_pagamentos_unit_access"
on public.financeiro_pagamentos for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "whatsapp_configuracoes_unit_read"
on public.whatsapp_configuracoes for select
to authenticated
using (public.can_access_unidade(unidade_id));

create policy "whatsapp_configuracoes_master_write"
on public.whatsapp_configuracoes for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "whatsapp_mensagens_unit_access"
on public.whatsapp_mensagens for all
to authenticated
using (public.can_access_unidade(unidade_id))
with check (public.can_access_unidade(unidade_id));

create policy "auditoria_logs_read_allowed"
on public.auditoria_logs for select
to authenticated
using (public.is_master() or public.can_access_unidade(unidade_id));

create policy "auditoria_logs_insert_allowed"
on public.auditoria_logs for insert
to authenticated
with check (public.is_master() or public.can_access_unidade(unidade_id));

create policy "migration_imports_master_only"
on public.migration_imports for all
to authenticated
using (public.is_master())
with check (public.is_master());

create policy "migration_errors_master_only"
on public.migration_errors for all
to authenticated
using (public.is_master())
with check (public.is_master());
