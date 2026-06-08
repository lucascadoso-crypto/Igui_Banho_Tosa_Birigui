# Arquitetura Atual

Analise realizada em 2026-06-08 sobre o repositorio V2 `lucascadoso-crypto/Igui_Banho_Tosa_Sistema_Birigui-`.

## Resumo

O projeto atual e um ERP de banho e tosa multi-unidade em React, TypeScript e Vite. Ele ja contem os fluxos principais do sistema antigo: login, unidades, clientes, pets, pacotes, agendamentos, financeiro, gastos, WhatsApp, auditoria, equipe, configuracoes e recibos.

O acesso ao Supabase e feito diretamente pelo frontend com `@supabase/supabase-js`. Existe tambem uma Supabase Edge Function para WhatsApp. O projeto tem um gerador de SQL em `services/sqlGenerator.ts`, mas ainda nao possui migrations formais versionadas nem RLS documentado no repositorio.

## Stack

- Frontend: React 19, TypeScript, Vite.
- UI: Tailwind via CDN, Font Awesome via CDN, classes utilitarias nos componentes.
- Banco e auth: Supabase.
- Edge Functions: Supabase Functions em Deno.
- Graficos: Recharts.
- Animacoes: Framer Motion e Motion.
- PDF/recibos: jsPDF e html2canvas.
- IA: Google Gemini via `@google/genai`.
- Upload de imagem: ImgBB.

## Estrutura

```txt
/
  App.tsx
  index.tsx
  index.html
  types.ts
  constants.tsx
  package.json
  vite.config.ts
  components/
  services/
  lib/
  supabase/functions/whatsapp-reminder/index.ts
```

## Telas e modulos

O roteamento e controlado por estado em `App.tsx`, sem React Router.

- Login/cadastro.
- Painel Geral.
- Financeiro Geral.
- Equipe.
- Meu Perfil.
- Configuracoes.
- Clientes.
- Pacotes.
- Agendamento.
- Financeiro da unidade.
- Gastos.
- Auditoria.
- Recibo por query string: `?view=recibo&id=<agendamento_id>`.

## Fluxos atuais

### Login e permissoes

- Usa Supabase Auth com email e senha.
- Busca perfil na tabela `funcionarios`.
- Usuario com `ativa = false` ou `cargo = pendente` fica bloqueado.
- Existe regra hardcoded para `lucas.cadoso@gmail.com` como `master`.

### Multi-unidade

- `unidades` alimenta o menu lateral.
- Usuarios operacionais sao direcionados para a propria unidade.
- `master` e `financeiro` acessam visoes globais.
- Alguns filtros de unidade estao no frontend, mas a V2 precisa de RLS no banco.

### Clientes e pets

- Clientes sao cadastrados em `clientes`.
- Pets sao cadastrados em `pets` e vinculados por `cliente_id`.
- Clientes usam `unidade_preferencial_id`, nao `unidade_id`.
- Pets nao possuem `unidade_id` no tipo atual nem no SQL gerado.

### Pacotes

- Pacotes usam `cliente_id`, `pet_id`, `unidade_id`, `servico_id`, quantidade de sessoes, valor, pagamento, status e renovacao.
- A criacao de pacote gera agendamentos/sessoes.
- As sessoes sao derivadas de `agendamentos` vinculados por `pacote_id`.

### Agendamentos

- Agendamentos usam `pet_id`, `pacote_id`, `numero_sessao`, `funcionario_id`, `unidade_id`, data, horario, valores, pagamento e status.
- Itens ficam em `agendamento_itens`.
- A agenda diaria filtra por `unidade_id` e `data_agendamento`.

### Financeiro

- O financeiro e calculado a partir de `agendamentos`, `pacotes`, `despesas` e extras.
- O frontend ja considera pagamento dividido por campos como `forma_pagamento_2` e `valor_pagamento_2`.
- A tabela `financeiro` aparece no SQL gerado, mas nao e a principal fonte operacional atual.

### WhatsApp

- O frontend chama `supabase.functions.invoke('lembrete-24h')`.
- O repositorio contem `supabase/functions/whatsapp-reminder/index.ts`.
- A funcao envia mensagens via Evolution API usando configuracoes salvas em `unidades`.
- Logs sao gravados em `logs_whatsapp`.

### Auditoria

- `services/logger.ts` registra eventos em `auditoria`.
- A tela de auditoria consulta `auditoria` e `logs_whatsapp`.
- A auditoria atual e textual; a V2 deve evoluir para `dados_antes` e `dados_depois`.

## Variaveis de ambiente

- `VITE_SUPABASE_URL`.
- `VITE_SUPABASE_ANON_KEY`.
- `GEMINI_API_KEY`.
- `VITE_IMGBB_API_KEY`.
- `SUPABASE_URL` para Edge Function.
- `SUPABASE_SERVICE_ROLE_KEY` para Edge Function.

O arquivo `.env` existe no repositorio remoto analisado. Segredos reais nao devem permanecer versionados.

## Tabelas referenciadas

- `config_sistema`.
- `unidades`.
- `clientes`.
- `pets`.
- `servicos`.
- `servicos_unidade`.
- `pacotes`.
- `agendamentos`.
- `agendamento_itens`.
- `funcionarios`.
- `despesas`.
- `financeiro`.
- `logs_whatsapp`.
- `auditoria`.

## Riscos tecnicos imediatos

- Ausencia de `docs/supabase-antigo` no repositorio analisado.
- Ausencia de migrations formais.
- Ausencia de RLS versionado.
- Fallbacks de credenciais no frontend.
- Regra de master hardcoded por email.
- Divergencia entre nome da funcao chamada (`lembrete-24h`) e pasta versionada (`whatsapp-reminder`).
- `clientes` e `pets` precisam receber `unidade_id` para a V2.
- Pagamento dividido precisa entrar no schema oficial.

## Recomendacao

Preservar este projeto como base funcional da V2, mas criar uma fundacao nova de banco com migrations formais, RLS, variaveis seguras e modelo multi-unidade consistente.
