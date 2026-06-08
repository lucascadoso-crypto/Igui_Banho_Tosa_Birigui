# Plano V2

## Objetivo

Construir uma V2 independente do Sistema Pet, usando Supabase novo, preservando os fluxos do sistema antigo e migrando uma unidade especifica com clientes, pets, pacotes, sessoes/agendamentos e financeiro.

## Principios

- Nao mexer no sistema antigo.
- Nao usar credenciais reais em arquivos versionados.
- Nao criar tabelas antes da leitura dos arquivos em `docs/supabase-antigo`.
- Criar banco novo por migrations SQL versionadas.
- Usar RLS desde a primeira versao.
- Todas as tabelas principais devem ter `unidade_id`.
- Preservar ou melhorar os fluxos existentes.
- Mobile-first em todas as telas.

## Decisao de arquitetura

Manter React + TypeScript + Vite como base inicial, porque o repositorio ja contem os fluxos principais. A V2 deve corrigir a fundacao de dados, seguranca e organizacao antes de grandes alteracoes visuais.

## Estrutura recomendada

```txt
/
  docs/
    supabase-antigo/
    arquitetura/
  supabase/
    migrations/
    functions/
      whatsapp-reminder/
  src/ ou estrutura atual organizada por modulos
  scripts/
    migration/
      export-old/
      transform/
      import-new/
```

Como o projeto atual esta na raiz, a reorganizacao para `src/` pode ser feita depois. A prioridade inicial e banco, RLS e migracao.

## Modelo conceitual da V2

Tabelas principais propostas:

- `unidades`.
- `usuarios_perfis`.
- `usuarios_unidades`.
- `clientes`.
- `pets`.
- `servicos`.
- `servicos_unidade`.
- `pacotes`.
- `pacote_sessoes` ou manter sessoes como `agendamentos` com controle mais explicito.
- `agendamentos`.
- `agendamento_itens`.
- `financeiro_movimentos`.
- `financeiro_pagamentos`.
- `despesas`.
- `whatsapp_configuracoes`.
- `whatsapp_mensagens`.
- `auditoria_logs`.
- `migration_imports`.
- `migration_errors`.

## Regra de unidade

Toda tabela operacional deve ter `unidade_id`, incluindo:

- `clientes`.
- `pets`.
- `pacotes`.
- `agendamentos`.
- `agendamento_itens`.
- `financeiro_movimentos`.
- `financeiro_pagamentos`.
- `despesas`.
- `whatsapp_mensagens`.
- `auditoria_logs`.

Mesmo quando a unidade puder ser inferida por relacionamento, o campo deve existir para RLS, performance e auditoria.

## RLS

Regra base:

```sql
unidade_id in (
  select unidade_id
  from usuarios_unidades
  where user_id = auth.uid()
  and ativo = true
)
```

Perfis sugeridos:

- `master`.
- `admin_unidade`.
- `gerente`.
- `financeiro`.
- `atendente`.
- `tosador`.
- `somente_leitura`.

## Fases

### Fase 0 - Preparacao

- Remover credenciais reais de arquivos versionados.
- Garantir `.env.example` completo.
- Adicionar `docs/supabase-antigo`.
- Exportar schema do Supabase antigo em modo leitura.
- Identificar a unidade que sera migrada.

### Fase 1 - Banco novo

- Criar migrations SQL iniciais.
- Criar tabelas base.
- Criar indices.
- Criar RLS.
- Criar seeds minimos para perfis e unidade migrada.
- Criar ambiente Supabase novo de desenvolvimento/staging.

### Fase 2 - Adaptacao do app

- Remover fallbacks hardcoded de Supabase e ImgBB.
- Centralizar client Supabase.
- Adaptar queries para `unidade_id`.
- Corrigir `clientes` e `pets` para novo modelo.
- Ajustar auth/permissoes para `usuarios_unidades`.

### Fase 3 - Fluxos operacionais

- Clientes.
- Pets/dependentes.
- Pacotes.
- Sessoes/agendamentos.
- Financeiro com pagamento dividido.
- WhatsApp.
- Auditoria.

### Fase 4 - Migracao

- Exportar dados da unidade antiga.
- Transformar para schema V2.
- Importar em staging.
- Validar saldos de pacotes, agenda e financeiro.
- Corrigir divergencias.
- Importar no Supabase novo definitivo.

### Fase 5 - Mobile-first

- Revisar telas em celular real.
- Priorizar agenda diaria, cadastro rapido, pacote, pagamento e WhatsApp.
- Ajustar navegacao para uso recorrente em loja.
- Garantir que formularios longos funcionem bem no celular.

### Fase 6 - Producao

- Deploy Vercel com variaveis novas.
- Supabase novo com RLS ativo.
- Edge Functions com secrets no Supabase.
- Checklist de backup e rollback.
- Validacao com usuarios da unidade migrada.

## Nao implementar ainda

Antes de migrations e codigo, pendencias obrigatorias:

- Adicionar e ler `docs/supabase-antigo`.
- Confirmar unidade de origem.
- Confirmar regras de saldo de pacotes.
- Confirmar status reais de agenda e pacote.
- Confirmar como pagamentos divididos devem ser persistidos.
- Confirmar provedor atual de WhatsApp e nome correto da Edge Function.
