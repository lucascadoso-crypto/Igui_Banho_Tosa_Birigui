# Revisao - Equipe como ponto oficial de acessos

Status: preparado para revisao. Nada foi aplicado no Supabase e nenhum deploy foi disparado.

## Arquivo de migration preparado

- `supabase/migrations/0020_access_control_by_role.sql`

## Diagnostico das policies atuais em producao

Consulta somente leitura usada:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Principais achados:

- `usuarios_unidades` ja existe, mas ainda permite escrita direta para `is_master()` via policy `usuarios_unidades_master_write`.
- `funcionarios` ainda permite escrita direta para `is_master()` via policy `funcionarios_master_write`.
- `can_access_unidade` ainda usa `funcionarios` como fallback, alem de `usuarios_unidades`.
- `clientes`, `pets`, `pacotes`, `agendamentos`, `agendamento_itens`, `despesas`, `financeiro_movimentos` e `financeiro_pagamentos` usam policies `FOR ALL` baseadas em `can_access_unidade`, o que deixa `financeiro` com escrita se tiver acesso a unidade.
- Fiscal atual permite `financeiro` criar/excluir rascunhos por funcoes `fiscal_can_create_draft` e `fiscal_can_delete_draft`; a regra nova muda isso para somente leitura.

## Colunas confirmadas

### `public.funcionarios`

- `id bigint`
- `user_id uuid`
- `unidade_id bigint`
- `nome text`
- `email citext`
- `telefone text`
- `cargo public.user_profile`
- `ativo boolean`
- `foto_url text`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints relevantes:

- `funcionarios_pkey`
- `funcionarios_email_key`
- `funcionarios_user_id_key`
- FK `unidade_id -> unidades.id`
- FK real confirmada por `pg_constraint`: `funcionarios.user_id -> auth.users(id) ON DELETE SET NULL`

### `public.usuarios_unidades`

- `id bigint`
- `user_id uuid`
- `unidade_id bigint`
- `perfil public.user_profile`
- `ativo boolean`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints relevantes:

- `usuarios_unidades_pkey`
- `usuarios_unidades_unique_scope (user_id, unidade_id, perfil)`
- `usuarios_unidades_unidade_required_for_non_master`
- FK `unidade_id -> unidades.id`
- FK real confirmada por `pg_constraint`: `usuarios_unidades.user_id -> auth.users(id) ON DELETE CASCADE`

## Tabelas com RLS ajustado na migration 0020

- `usuarios_unidades`
- `funcionarios`
- `unidades`
- `clientes`
- `pets`
- `pacotes`
- `agendamentos`
- `agendamento_itens`
- `despesas`
- `financeiro_movimentos`
- `financeiro_pagamentos`
- `auditoria_logs`
- `servicos_unidade`
- `notas_fiscais`
- `nota_fiscal_itens`

## Funcoes/RPCs criadas ou substituidas

### Fonte de verdade

- `public.is_master()`
  - passa a usar `usuarios_unidades`.

- `public.can_access_unidade(target_unidade_id bigint)`
  - passa a usar `usuarios_unidades` como fonte de verdade.
  - remove o fallback por `funcionarios`.

- `public.access_profile_for_unidade(target_unidade_id bigint)`
  - retorna o perfil ativo do usuario na unidade.

### Guards de permissao

- `public.access_can_read_unit`
- `public.access_can_write_operational`
- `public.access_can_read_financial`
- `public.access_can_write_financial`
- `public.access_can_view_audit`
- `public.access_can_manage_team`
- `public.access_can_view_team`
- `public.access_can_read_config`
- `public.access_can_manage_config`

### Fiscal

- `public.fiscal_profile_for_unidade`
- `public.fiscal_can_view_config`
- `public.fiscal_can_manage_config`
- `public.fiscal_can_view_note`
- `public.fiscal_can_create_draft`
- `public.fiscal_can_edit_draft`
- `public.fiscal_can_delete_draft`

Mudanca principal: `financeiro` fica somente leitura no fiscal. Gerente/admin_unidade podem criar/editar rascunhos da propria unidade. Delete fiscal fica restrito a master.

### RPC oficial da tela Equipe

```sql
public.salvar_acesso_funcionario(
  p_funcionario_id bigint,
  p_auth_user_id uuid,
  p_unidade_id bigint,
  p_perfil public.user_profile,
  p_ativo boolean
)
```

Regras implementadas na RPC:

- `SECURITY DEFINER`
- `set search_path = public`
- valida `auth.uid()`
- permite execucao somente para Master
- valida unidade ativa
- valida existencia do login em `auth.users`
- nao usa e nao cria `public.users`
- valida existencia do funcionario
- exige correspondencia exata de e-mail normalizado entre login e funcionario
- impede vincular o mesmo login a outro funcionario
- desativa outros vinculos ativos do mesmo usuario
- cria/atualiza `usuarios_unidades`
- atualiza `funcionarios.user_id`, `funcionarios.unidade_id`, `funcionarios.cargo`, `funcionarios.ativo`
- registra auditoria em `auditoria_logs`
- retorna o estado final do acesso

### RPC de logins pendentes

```sql
public.listar_logins_pendentes_equipe()
```

Regras:

- `SECURITY DEFINER`
- somente Master enxerga retorno
- consulta `auth.users` sem expor essa tabela ao frontend
- usa correspondencia exata de e-mail normalizado
- retorna estados:
  - `PENDENTE_DE_APROVACAO`
  - `SEM_LOGIN_VINCULADO`
  - `ACESSO_ATIVO`
  - `ACESSO_SUSPENSO`

## Triggers de protecao

### `usuarios_unidades`

Trigger:

```sql
guard_usuarios_unidades_direct_write
```

Bloqueia `INSERT`, `UPDATE` e `DELETE` diretos, exceto quando a transacao foi iniciada pela RPC `salvar_acesso_funcionario`.

### `funcionarios`

Trigger:

```sql
guard_funcionarios_access_columns
```

Bloqueia update direto de:

- `user_id`
- `unidade_id`
- `cargo`
- `ativo`

Esses campos so podem ser alterados pela RPC oficial.

## Rotas/modulos por cargo

### Master

- Todas as unidades
- Painel Geral
- Financeiro Geral
- Marketing
- Configuracoes
- Equipe
- Agendamento
- Clientes
- Pacotes
- Financeiro
- Gastos
- Auditoria
- Notas Fiscais
- Fiscal Settings

### Gerente

- Propria unidade
- Marketing
- Agendamento
- Clientes
- Pets via prontuario/cliente
- Pacotes
- Financeiro da unidade
- Gastos
- Notas Fiscais/rascunhos da propria unidade
- Configuracoes operacionais da propria unidade
- Equipe em modo consulta

Sem:

- Auditoria
- Outras unidades
- Controle de cargos/permissoes
- Configuracoes globais
- Secrets/certificados/tokens

### Admin Unidade

Inicialmente igual a Gerente.

### Financeiro

Somente leitura na propria unidade:

- Agenda
- Clientes
- Pets
- Pacotes
- Financeiro
- Recebimentos
- Relatorios
- Notas Fiscais
- Auditoria
- Informacoes operacionais da unidade

Bloqueado por RLS para:

- criar
- editar
- excluir
- cancelar
- receber
- estornar
- finalizar
- criar rascunho fiscal
- alterar pagamentos
- alterar equipe
- alterar configuracoes

### Tosador(a) / Banhista

Perfil interno: `tosador`.

Acesso direto por RLS:

- leitura da Agenda da propria unidade
- leitura de dados essenciais relacionados a atendimentos

Sem acesso a:

- Clientes como modulo
- Pacotes
- Financeiro geral
- Auditoria
- Notas Fiscais
- Equipe
- Configuracoes
- Outras unidades

Observacao: a migration preparada ainda nao cria RPCs operacionais especificas de tosador para iniciar/finalizar/receber. Esse ponto deve ser implementado como uma migration complementar ou antes da aplicacao final se a liberacao do perfil `tosador` depender dessas acoes imediatamente.

### Atendente e Somente Leitura

Sem liberacao nova nesta etapa.

## Impacto fiscal

A migration 0020 substitui a regra anterior:

- `financeiro` deixa de criar/editar/excluir rascunhos fiscais.
- `financeiro` fica somente leitura.
- `master` mantem controle total.
- `gerente` e `admin_unidade` podem criar/editar rascunhos da propria unidade conforme triggers fiscais existentes.
- Delete de rascunho fiscal fica restrito a `master`.

## O que nao foi alterado

Nesta etapa de preparacao:

- nenhuma migration foi aplicada no Supabase;
- nenhum dado real foi alterado;
- nenhum deploy foi disparado;
- nenhuma nota fiscal real foi emitida;
- nenhuma API externa foi chamada;
- nenhum secret foi criado ou lido.

## Testes obrigatorios apos aprovacao e aplicacao controlada

### Master

1. Abrir Equipe.
2. Listar funcionarios.
3. Listar logins pendentes via RPC.
4. Vincular login a funcionario existente.
5. Alterar cargo.
6. Trocar unidade.
7. Desativar acesso.
8. Confirmar auditoria gerada.

### Gerente/Admin Unidade

1. Entrar na propria unidade.
2. Confirmar acesso a Agenda, Clientes, Pacotes, Financeiro e Notas Fiscais.
3. Confirmar bloqueio de Auditoria.
4. Confirmar bloqueio de Equipe para gestao de acessos.
5. Tentar acessar outra unidade por URL/consulta e confirmar bloqueio.

### Financeiro

1. Confirmar leitura de Agenda, Clientes, Pacotes, Financeiro, Auditoria e Notas Fiscais.
2. Tentar criar/editar/excluir cliente, agendamento, pacote, pagamento, despesa e nota fiscal.
3. Confirmar bloqueio por RLS/API, nao apenas por botao oculto.

### Tosador(a)/Banhista

1. Confirmar acesso somente a Agenda da propria unidade.
2. Confirmar bloqueio de Clientes, Pacotes, Financeiro, Auditoria, Fiscal, Equipe e Configuracoes.
3. Confirmar que acoes operacionais so funcionam quando RPCs especificas forem disponibilizadas.

### Login pendente

1. Criar conta sem funcionario correspondente.
2. Confirmar que nao recebe acesso automaticamente.
3. Confirmar que aparece na lista segura de pendencias para Master.
4. Vincular explicitamente a um funcionario com e-mail igual normalizado.
5. Confirmar acesso apenas apos salvar pela tela Equipe.
