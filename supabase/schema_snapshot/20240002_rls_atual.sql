-- ============================================================================
-- SCHEMA SNAPSHOT (somente documentacao) - RLS atual, capturado em 29/06/2026
-- Projeto Supabase: Igui_Banho_Tosa_Birigui (ref ihhylytyompvdhkphgud)
-- ============================================================================
--
-- Mesma ressalva do arquivo 20240001: isto e uma FOTOGRAFIA do RLS que ja
-- existe hoje no banco, nao uma migration nova. As migrations reais que
-- criaram/ajustaram essas policies estao em supabase/migrations/0007,
-- 0012, 0018, 0019, 0020, 0022, 0023.
--
-- RLS esta habilitado em TODAS as 27 tabelas (verificado via
-- pg_class.relrowsecurity = true para cada uma). Nenhuma tabela tem RLS
-- "forced" (relforcerowsecurity = false em todas).
--
-- Funcoes usadas nas policies abaixo (is_master, can_access_unidade,
-- fiscal_can_view_config, fiscal_can_manage_config, fiscal_can_view_note,
-- fiscal_can_edit_draft, fiscal_can_delete_draft) ja existem no banco e
-- estao definidas nas migrations 0007/0019/0020/0022/0023 -- nao
-- redefinidas aqui.
--
-- Padrao usado para ser seguro de re-rodar: "drop policy if exists" antes
-- de cada "create policy" (Postgres nao suporta CREATE POLICY IF NOT EXISTS).
-- ============================================================================

alter table public.agendamento_itens enable row level security;
alter table public.agendamentos enable row level security;
alter table public.auditoria_logs enable row level security;
alter table public.catalogo_pacotes enable row level security;
alter table public.catalogo_pacotes_unidade enable row level security;
alter table public.clientes enable row level security;
alter table public.config_fiscal_unidade enable row level security;
alter table public.config_sistema enable row level security;
alter table public.configuracoes_sistema enable row level security;
alter table public.despesas enable row level security;
alter table public.financeiro_movimentos enable row level security;
alter table public.financeiro_pagamentos enable row level security;
alter table public.funcionarios enable row level security;
alter table public.logs_whatsapp enable row level security;
alter table public.migration_errors enable row level security;
alter table public.migration_imports enable row level security;
alter table public.nota_fiscal_itens enable row level security;
alter table public.notas_fiscais enable row level security;
alter table public.pacotes enable row level security;
alter table public.pets enable row level security;
alter table public.servicos enable row level security;
alter table public.servicos_fiscais enable row level security;
alter table public.servicos_unidade enable row level security;
alter table public.unidades enable row level security;
alter table public.usuarios_perfis enable row level security;
alter table public.usuarios_unidades enable row level security;
alter table public.whatsapp_configuracoes enable row level security;
alter table public.whatsapp_mensagens enable row level security;

-- Observacao: pacote_sql_publico (cadastro_publico_tutor_pets,
-- unidade_publica_info) NAO usa nenhuma policy de RLS para anon -- sao
-- functions SECURITY DEFINER que bypassam RLS deliberadamente, expostas via
-- GRANT EXECUTE apenas. Ver migrations 0027/0028/0029.


-- ----------------------------------------------------------------------------
-- agendamento_itens
-- ----------------------------------------------------------------------------
drop policy if exists "agendamento_itens_unit_access" on public.agendamento_itens;
create policy "agendamento_itens_unit_access" on public.agendamento_itens for all to authenticated
  using (is_master() or can_access_unidade(unidade_id))
  with check (is_master() or can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- agendamentos
-- ----------------------------------------------------------------------------
drop policy if exists "agendamentos_unit_access" on public.agendamentos;
create policy "agendamentos_unit_access" on public.agendamentos for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- auditoria_logs
-- ----------------------------------------------------------------------------
drop policy if exists "auditoria_logs_insert_allowed" on public.auditoria_logs;
create policy "auditoria_logs_insert_allowed" on public.auditoria_logs for insert to authenticated
  with check (is_master() or can_access_unidade(unidade_id));

drop policy if exists "auditoria_logs_read_allowed" on public.auditoria_logs;
create policy "auditoria_logs_read_allowed" on public.auditoria_logs for select to authenticated
  using (is_master() or can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- catalogo_pacotes
-- ----------------------------------------------------------------------------
drop policy if exists "catalogo_pacotes_master_write" on public.catalogo_pacotes;
create policy "catalogo_pacotes_master_write" on public.catalogo_pacotes for all to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists "catalogo_pacotes_read_authenticated" on public.catalogo_pacotes;
create policy "catalogo_pacotes_read_authenticated" on public.catalogo_pacotes for select to authenticated
  using (true);


-- ----------------------------------------------------------------------------
-- catalogo_pacotes_unidade
-- ----------------------------------------------------------------------------
drop policy if exists "catalogo_pacotes_unidade_unit_access" on public.catalogo_pacotes_unidade;
create policy "catalogo_pacotes_unidade_unit_access" on public.catalogo_pacotes_unidade for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- clientes
-- ----------------------------------------------------------------------------
drop policy if exists "clientes_unit_access" on public.clientes;
create policy "clientes_unit_access" on public.clientes for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- config_fiscal_unidade
-- ----------------------------------------------------------------------------
drop policy if exists "config_fiscal_unidade_select_allowed" on public.config_fiscal_unidade;
create policy "config_fiscal_unidade_select_allowed" on public.config_fiscal_unidade for select to authenticated
  using (fiscal_can_view_config(unidade_id));

drop policy if exists "config_fiscal_unidade_insert_master" on public.config_fiscal_unidade;
create policy "config_fiscal_unidade_insert_master" on public.config_fiscal_unidade for insert to authenticated
  with check (fiscal_can_manage_config(unidade_id));

drop policy if exists "config_fiscal_unidade_update_master" on public.config_fiscal_unidade;
create policy "config_fiscal_unidade_update_master" on public.config_fiscal_unidade for update to authenticated
  using (fiscal_can_manage_config(unidade_id))
  with check (fiscal_can_manage_config(unidade_id));

drop policy if exists "config_fiscal_unidade_delete_master" on public.config_fiscal_unidade;
create policy "config_fiscal_unidade_delete_master" on public.config_fiscal_unidade for delete to authenticated
  using (fiscal_can_manage_config(unidade_id));


-- ----------------------------------------------------------------------------
-- config_sistema
-- ----------------------------------------------------------------------------
drop policy if exists "config_sistema_public_select" on public.config_sistema;
create policy "config_sistema_public_select" on public.config_sistema for select to anon, authenticated
  using (true);

drop policy if exists "config_sistema_read_authenticated" on public.config_sistema;
create policy "config_sistema_read_authenticated" on public.config_sistema for select to authenticated
  using (true);

drop policy if exists "config_sistema_master_write" on public.config_sistema;
create policy "config_sistema_master_write" on public.config_sistema for all to authenticated
  using (is_master())
  with check (is_master());


-- ----------------------------------------------------------------------------
-- configuracoes_sistema
-- ----------------------------------------------------------------------------
drop policy if exists "configuracoes_sistema_read_allowed" on public.configuracoes_sistema;
create policy "configuracoes_sistema_read_allowed" on public.configuracoes_sistema for select to authenticated
  using (is_master() or unidade_id is null or can_access_unidade(unidade_id));

drop policy if exists "configuracoes_sistema_master_write" on public.configuracoes_sistema;
create policy "configuracoes_sistema_master_write" on public.configuracoes_sistema for all to authenticated
  using (is_master())
  with check (is_master());


-- ----------------------------------------------------------------------------
-- despesas
-- ----------------------------------------------------------------------------
drop policy if exists "despesas_unit_access" on public.despesas;
create policy "despesas_unit_access" on public.despesas for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- financeiro_movimentos
-- ----------------------------------------------------------------------------
drop policy if exists "financeiro_movimentos_unit_access" on public.financeiro_movimentos;
create policy "financeiro_movimentos_unit_access" on public.financeiro_movimentos for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- financeiro_pagamentos
-- ----------------------------------------------------------------------------
drop policy if exists "financeiro_pagamentos_unit_access" on public.financeiro_pagamentos;
create policy "financeiro_pagamentos_unit_access" on public.financeiro_pagamentos for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- funcionarios
-- ----------------------------------------------------------------------------
drop policy if exists "funcionarios_read_allowed" on public.funcionarios;
create policy "funcionarios_read_allowed" on public.funcionarios for select to authenticated
  using (is_master() or user_id = auth.uid() or can_access_unidade(unidade_id));

drop policy if exists "funcionarios_master_write" on public.funcionarios;
create policy "funcionarios_master_write" on public.funcionarios for all to authenticated
  using (is_master())
  with check (is_master());
-- Observacao: a migration 0020 adiciona o trigger guard_funcionarios_access_columns,
-- que bloqueia UPDATE direto de user_id/unidade_id/cargo/ativo mesmo por quem
-- passar nesta policy -- essas colunas só mudam via a RPC salvar_acesso_funcionario.


-- ----------------------------------------------------------------------------
-- logs_whatsapp
-- ----------------------------------------------------------------------------
drop policy if exists "logs_whatsapp_unit_access" on public.logs_whatsapp;
create policy "logs_whatsapp_unit_access" on public.logs_whatsapp for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- migration_errors
-- ----------------------------------------------------------------------------
drop policy if exists "migration_errors_master_only" on public.migration_errors;
create policy "migration_errors_master_only" on public.migration_errors for all to authenticated
  using (is_master())
  with check (is_master());


-- ----------------------------------------------------------------------------
-- migration_imports
-- ----------------------------------------------------------------------------
drop policy if exists "migration_imports_master_only" on public.migration_imports;
create policy "migration_imports_master_only" on public.migration_imports for all to authenticated
  using (is_master())
  with check (is_master());


-- ----------------------------------------------------------------------------
-- nota_fiscal_itens
-- ----------------------------------------------------------------------------
drop policy if exists "nota_fiscal_itens_select_allowed" on public.nota_fiscal_itens;
create policy "nota_fiscal_itens_select_allowed" on public.nota_fiscal_itens for select to authenticated
  using (exists (
    select 1 from notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id and fiscal_can_view_note(nf.unidade_id)
  ));

drop policy if exists "nota_fiscal_itens_update_draft_allowed" on public.nota_fiscal_itens;
create policy "nota_fiscal_itens_update_draft_allowed" on public.nota_fiscal_itens for update to authenticated
  using (exists (
    select 1 from notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id and nf.status = 'RASCUNHO' and fiscal_can_edit_draft(nf.unidade_id)
  ))
  with check (exists (
    select 1 from notas_fiscais nf
    where nf.id = nota_fiscal_itens.nota_fiscal_id and nf.status = 'RASCUNHO' and fiscal_can_edit_draft(nf.unidade_id)
  ));
-- Observacao: nao ha policy de INSERT/DELETE explicita nesta tabela alem das
-- duas acima -- confirmado em pg_policies (so SELECT e UPDATE existem hoje).


-- ----------------------------------------------------------------------------
-- notas_fiscais
-- ----------------------------------------------------------------------------
drop policy if exists "notas_fiscais_select_allowed" on public.notas_fiscais;
create policy "notas_fiscais_select_allowed" on public.notas_fiscais for select to authenticated
  using (fiscal_can_view_note(unidade_id));

drop policy if exists "notas_fiscais_update_draft_allowed" on public.notas_fiscais;
create policy "notas_fiscais_update_draft_allowed" on public.notas_fiscais for update to authenticated
  using (fiscal_can_edit_draft(unidade_id) and status = 'RASCUNHO')
  with check (fiscal_can_edit_draft(unidade_id) and status = 'RASCUNHO');

drop policy if exists "notas_fiscais_delete_draft_allowed" on public.notas_fiscais;
create policy "notas_fiscais_delete_draft_allowed" on public.notas_fiscais for delete to authenticated
  using (status = 'RASCUNHO' and fiscal_can_delete_draft(unidade_id));
-- Observacao: nao ha policy de INSERT explicita -- confirmado em pg_policies.
-- Criacao de nota fiscal provavelmente acontece via RPC SECURITY DEFINER
-- nao mapeada neste snapshot (fora do escopo desta tarefa).


-- ----------------------------------------------------------------------------
-- pacotes
-- ----------------------------------------------------------------------------
drop policy if exists "pacotes_unit_access" on public.pacotes;
create policy "pacotes_unit_access" on public.pacotes for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- pets
-- ----------------------------------------------------------------------------
drop policy if exists "pets_unit_access" on public.pets;
create policy "pets_unit_access" on public.pets for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- servicos
-- ----------------------------------------------------------------------------
drop policy if exists "servicos_select_authenticated" on public.servicos;
create policy "servicos_select_authenticated" on public.servicos for select to authenticated
  using (true);

drop policy if exists "servicos_insert_master" on public.servicos;
create policy "servicos_insert_master" on public.servicos for insert to authenticated
  with check (is_master());

drop policy if exists "servicos_update_master" on public.servicos;
create policy "servicos_update_master" on public.servicos for update to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists "servicos_delete_master" on public.servicos;
create policy "servicos_delete_master" on public.servicos for delete to authenticated
  using (is_master());


-- ----------------------------------------------------------------------------
-- servicos_fiscais
-- ----------------------------------------------------------------------------
drop policy if exists "servicos_fiscais_select_allowed" on public.servicos_fiscais;
create policy "servicos_fiscais_select_allowed" on public.servicos_fiscais for select to authenticated
  using (fiscal_can_view_config(unidade_id));

drop policy if exists "servicos_fiscais_insert_master" on public.servicos_fiscais;
create policy "servicos_fiscais_insert_master" on public.servicos_fiscais for insert to authenticated
  with check (fiscal_can_manage_config(unidade_id));

drop policy if exists "servicos_fiscais_update_master" on public.servicos_fiscais;
create policy "servicos_fiscais_update_master" on public.servicos_fiscais for update to authenticated
  using (fiscal_can_manage_config(unidade_id))
  with check (fiscal_can_manage_config(unidade_id));

drop policy if exists "servicos_fiscais_delete_master" on public.servicos_fiscais;
create policy "servicos_fiscais_delete_master" on public.servicos_fiscais for delete to authenticated
  using (fiscal_can_manage_config(unidade_id));


-- ----------------------------------------------------------------------------
-- servicos_unidade
-- ----------------------------------------------------------------------------
drop policy if exists "servicos_unidade_unit_access" on public.servicos_unidade;
create policy "servicos_unidade_unit_access" on public.servicos_unidade for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- unidades
-- ----------------------------------------------------------------------------
drop policy if exists "unidades_select_master_or_unit" on public.unidades;
create policy "unidades_select_master_or_unit" on public.unidades for select to authenticated
  using (is_master() or can_access_unidade(id));

drop policy if exists "unidades_insert_master" on public.unidades;
create policy "unidades_insert_master" on public.unidades for insert to authenticated
  with check (is_master());

drop policy if exists "unidades_update_master" on public.unidades;
create policy "unidades_update_master" on public.unidades for update to authenticated
  using (is_master())
  with check (is_master());

drop policy if exists "unidades_delete_master" on public.unidades;
create policy "unidades_delete_master" on public.unidades for delete to authenticated
  using (is_master());
-- Observacao: anon NAO tem nenhuma policy de leitura em unidades -- e por
-- isso que a pagina publica /cadastro usa a RPC unidade_publica_info
-- (SECURITY DEFINER) em vez de selecionar a tabela direto (migration 0027).


-- ----------------------------------------------------------------------------
-- usuarios_perfis
-- ----------------------------------------------------------------------------
drop policy if exists "perfis_read_authenticated" on public.usuarios_perfis;
create policy "perfis_read_authenticated" on public.usuarios_perfis for select to authenticated
  using (true);
-- Observacao: nao ha policy de escrita nesta tabela -- confirmado em
-- pg_policies. Os 7 valores do enum user_profile sao a fonte de verdade;
-- esta tabela parece ser só descritiva (nome/descricao de cada perfil).


-- ----------------------------------------------------------------------------
-- usuarios_unidades
-- ----------------------------------------------------------------------------
drop policy if exists "usuarios_unidades_read_allowed" on public.usuarios_unidades;
create policy "usuarios_unidades_read_allowed" on public.usuarios_unidades for select to authenticated
  using (is_master() or user_id = auth.uid() or can_access_unidade(unidade_id));

drop policy if exists "usuarios_unidades_master_write" on public.usuarios_unidades;
create policy "usuarios_unidades_master_write" on public.usuarios_unidades for all to authenticated
  using (is_master())
  with check (is_master());
-- Observacao: a migration 0020 adiciona o trigger guard_usuarios_unidades_direct_write,
-- que bloqueia INSERT/UPDATE/DELETE direto nesta tabela (mesmo passando pela
-- policy acima), exceto quando a transacao vem da RPC salvar_acesso_funcionario.


-- ----------------------------------------------------------------------------
-- whatsapp_configuracoes
-- ----------------------------------------------------------------------------
drop policy if exists "whatsapp_configuracoes_unit_access" on public.whatsapp_configuracoes;
create policy "whatsapp_configuracoes_unit_access" on public.whatsapp_configuracoes for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ----------------------------------------------------------------------------
-- whatsapp_mensagens
-- ----------------------------------------------------------------------------
drop policy if exists "whatsapp_mensagens_unit_access" on public.whatsapp_mensagens;
create policy "whatsapp_mensagens_unit_access" on public.whatsapp_mensagens for all to authenticated
  using (can_access_unidade(unidade_id))
  with check (can_access_unidade(unidade_id));


-- ============================================================================
-- FIM DO SNAPSHOT DE RLS (33 policies em 24 das 27 tabelas).
-- catalogo_pacotes_unidade, clientes, pets ja foram listadas acima dentro de
-- suas proprias secoes -- as 3 tabelas "sem nenhuma policy propria" extra
-- nesta lista nao existem: todas as 27 tabelas tem RLS habilitado E pelo
-- menos uma policy, exceto nenhuma exceção encontrada.
-- ============================================================================
