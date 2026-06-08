# Banco V2 - Plano

Data: 2026-06-08

Projeto Supabase novo: `Igui_Banho_Tosa_Birigui`

URL do Supabase novo:

```txt
https://ihhylytyompvdhkphgud.supabase.co
```

Variaveis permitidas no frontend:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

A `anon key` deve ficar somente em `.env.local` e na Vercel. Nenhuma chave real deve ser versionada.

## Estado da analise

O codigo V2 atual ja possui fluxos operacionais para:

- unidades;
- funcionarios;
- clientes;
- pets/dependentes;
- servicos;
- pacotes;
- sessoes/agendamentos;
- financeiro;
- gastos/despesas;
- WhatsApp;
- auditoria;
- recibos.

A pasta obrigatoria `docs/supabase-antigo` nao foi encontrada no workspace local nem na arvore remota da `main`. Portanto, este plano usa como referencia:

- o codigo atual da V2;
- os tipos em `types.ts`;
- o SQL inferido em `services/sqlGenerator.ts`;
- as queries Supabase dos componentes;
- os documentos locais ja criados: `ARQUITETURA_ATUAL.md`, `BANCO_ANTIGO.md`, `PLANO_V2.md` e `MIGRACAO_DADOS.md`.

Antes de migrar dados reais, os backups do Supabase antigo ainda precisam ser adicionados e analisados.

## Objetivo do banco V2

Criar um banco novo, independente do Supabase antigo, capaz de operar o sistema inteiro com dados de teste antes da migracao real.

O banco deve preservar os fluxos do antigo, mas corrigir os pontos estruturais:

- RLS obrigatorio;
- `unidade_id` em todas as tabelas principais;
- migrations SQL versionadas;
- separacao de configuracoes sensiveis;
- financeiro mais consistente;
- auditoria mais estruturada;
- suporte a pagamento dividido sem campos limitados a `valor_pagamento_2`.

## Principios do modelo

1. Toda tabela operacional deve carregar `unidade_id`.
2. Relacionamentos devem usar UUID.
3. Dados migrados futuramente devem ter campos de rastreio de origem.
4. Pagamentos devem ser uma entidade propria.
5. Logs e auditoria nao devem depender apenas de texto livre.
6. WhatsApp deve guardar historico de mensagens, mas tokens devem ser tratados com cuidado.
7. O frontend deve usar apenas anon key e respeitar RLS.

## Tabelas propostas

### `unidades`

Representa uma loja/unidade.

Campos principais:

- `id`;
- `nome`;
- `slug`;
- `cnpj`;
- `telefone`;
- `endereco_completo`;
- `ativo`;
- `created_at`;
- `updated_at`.

### `config_sistema`

Configuracoes globais da rede/sistema.

Campos principais:

- `id`;
- `nome_fantasia`;
- `logo_url`;
- `created_at`;
- `updated_at`.

### `usuarios_perfis`

Catalogo de perfis.

Perfis iniciais:

- `master`;
- `admin_unidade`;
- `gerente`;
- `financeiro`;
- `atendente`;
- `tosador`;
- `somente_leitura`.

### `usuarios_unidades`

Vinculo entre `auth.users` e unidades.

Campos principais:

- `id`;
- `user_id`;
- `unidade_id`;
- `perfil`;
- `ativo`;
- `created_at`;
- `updated_at`.

### `funcionarios`

Dados operacionais dos funcionarios.

Campos principais:

- `id`;
- `user_id`;
- `unidade_id`;
- `nome`;
- `email`;
- `telefone`;
- `cargo`;
- `ativo`;
- `foto_url`;
- `created_at`;
- `updated_at`.

### `clientes`

Tutores/clientes.

Campos principais:

- `id`;
- `unidade_id`;
- `nome`;
- `telefone`;
- `telefone_adicional`;
- `email`;
- `cpf`;
- `data_nascimento`;
- `genero`;
- `receber_msgs`;
- `notas_internas`;
- `restricoes`;
- endereco estruturado;
- `foto_url`;
- `origem_id`;
- `created_at`;
- `updated_at`.

### `pets`

Pets/dependentes.

Campos principais:

- `id`;
- `unidade_id`;
- `cliente_id`;
- `nome`;
- `data_nascimento`;
- `genero`;
- `especie`;
- `raca`;
- `porte`;
- `comportamento`;
- `notas_internas`;
- `restricoes`;
- `foto_url`;
- `origem_id`;
- `created_at`;
- `updated_at`.

### `servicos`

Catalogo global de servicos.

Campos principais:

- `id`;
- `nome`;
- `descricao`;
- `preco_base`;
- `duracao_minutos`;
- `ativo`;
- `created_at`;
- `updated_at`.

### `servicos_unidade`

Disponibilidade e preco por unidade.

Campos principais:

- `id`;
- `unidade_id`;
- `servico_id`;
- `preco`;
- `ativo`;
- `created_at`;
- `updated_at`.

### `pacotes`

Pacotes de fidelidade.

Campos principais:

- `id`;
- `unidade_id`;
- `cliente_id`;
- `pet_id`;
- `servico_id`;
- `nome`;
- `qtd_sessoes`;
- `valor_total`;
- `valor_transporte`;
- `status`;
- `renovacao_automatica`;
- `pacote_anterior_id`;
- `ciclo_renovacao`;
- `data_inicio`;
- `data_fim`;
- `origem_id`;
- `created_at`;
- `updated_at`.

### `agendamentos`

Agenda e sessoes.

Campos principais:

- `id`;
- `unidade_id`;
- `cliente_id`;
- `pet_id`;
- `pacote_id`;
- `numero_sessao`;
- `funcionario_id`;
- `data_agendamento`;
- `horario_inicio`;
- `horario_fim`;
- `status`;
- `tem_taxi`;
- `endereco_busca`;
- `valor_servicos`;
- `valor_transporte`;
- `valor_extra_total`;
- `status_pagamento_extra`;
- `data_inicio_real`;
- `data_fim_real`;
- `lembrete_enviado`;
- `origem_id`;
- `created_at`;
- `updated_at`.

### `agendamento_itens`

Servicos dentro do agendamento.

Campos principais:

- `id`;
- `unidade_id`;
- `agendamento_id`;
- `servico_id`;
- `valor_cobrado`;
- `created_at`.

### `financeiro_movimentos`

Entradas e saidas financeiras.

Campos principais:

- `id`;
- `unidade_id`;
- `cliente_id`;
- `pet_id`;
- `pacote_id`;
- `agendamento_id`;
- `despesa_id`;
- `tipo`;
- `categoria`;
- `descricao`;
- `valor_total`;
- `data_competencia`;
- `data_vencimento`;
- `status`;
- `origem`;
- `origem_id`;
- `created_at`;
- `updated_at`.

### `financeiro_pagamentos`

Pagamentos de movimentos financeiros.

Campos principais:

- `id`;
- `unidade_id`;
- `movimento_id`;
- `forma_pagamento`;
- `valor`;
- `pago_em`;
- `observacao`;
- `created_at`.

Esta tabela substitui o limite de campos fixos como `forma_pagamento_2` e permite qualquer quantidade de divisao.

### `despesas`

Gastos da unidade.

Campos principais:

- `id`;
- `unidade_id`;
- `nome_item`;
- `descricao`;
- `quantidade`;
- `valor_total`;
- `data_despesa`;
- `comprovante_url`;
- `created_at`;
- `updated_at`.

### `whatsapp_configuracoes`

Configuracao por unidade.

Campos principais:

- `id`;
- `unidade_id`;
- `provider`;
- `nome_instancia`;
- `url_servidor`;
- `ativo`;
- `created_at`;
- `updated_at`.

Observacao: tokens sensiveis devem ficar preferencialmente em secrets/Edge Function ou em tabela com acesso restrito por RLS/service role.

### `whatsapp_mensagens`

Historico de envios.

Campos principais:

- `id`;
- `unidade_id`;
- `cliente_id`;
- `pet_id`;
- `agendamento_id`;
- `telefone`;
- `tipo`;
- `mensagem`;
- `status`;
- `provider_message_id`;
- `detalhe_erro`;
- `enviado_em`;
- `created_at`.

### `auditoria_logs`

Auditoria estruturada.

Campos principais:

- `id`;
- `unidade_id`;
- `user_id`;
- `usuario_email`;
- `usuario_nome`;
- `acao`;
- `tabela`;
- `registro_id`;
- `descricao`;
- `dados_antes`;
- `dados_depois`;
- `ip`;
- `user_agent`;
- `created_at`.

### `migration_imports`

Controle futuro de importacoes.

### `migration_errors`

Erros de importacao futura.

## RLS planejado

Regra base para tabelas com `unidade_id`:

```sql
exists (
  select 1
  from public.usuarios_unidades uu
  where uu.user_id = auth.uid()
  and uu.unidade_id = <tabela>.unidade_id
  and uu.ativo = true
)
```

Excecao:

- perfil `master` pode acessar todas as unidades;
- Edge Functions com service role podem executar rotinas internas;
- tabelas globais como `servicos` podem ter leitura mais ampla.

## Dados de teste

Antes da migracao real, criar seed controlado para:

- unidade Birigui de teste;
- 2 funcionarios;
- 5 clientes;
- 6 pets;
- 4 servicos;
- 2 pacotes;
- 8 agendamentos;
- pagamentos divididos;
- despesas;
- logs de WhatsApp falsos;
- auditoria falsa.

Nenhum dado real deve ser importado nesta fase.
