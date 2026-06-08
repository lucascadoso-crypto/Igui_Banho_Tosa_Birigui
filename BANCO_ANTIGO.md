# Banco Antigo

## Status da leitura

A regra do projeto diz: antes de criar tabelas, ler os arquivos em `docs/supabase-antigo`.

Na analise do repositorio em 2026-06-08, essa pasta nao foi encontrada na arvore do projeto. Portanto, este documento registra o que foi possivel inferir pelo codigo da V2 e o que ainda precisa ser anexado para validar o banco antigo real de producao.

Nenhuma tabela foi criada nesta etapa.

## Fontes analisadas

- `App.tsx`.
- `types.ts`.
- `services/sqlGenerator.ts`.
- Componentes em `components/`.
- `services/logger.ts`.
- `services/whatsappService.ts`.
- `supabase/functions/whatsapp-reminder/index.ts`.

## Tabelas inferidas pelo codigo

### `config_sistema`

Usada para identidade visual.

Campos inferidos:

- `id`.
- `nome_fantasia`.
- `logo_url`.
- `updated_at`.

### `unidades`

Usada para lojas/unidades e configuracao de WhatsApp.

Campos inferidos:

- `id`.
- `nome`.
- `endereco_completo`.
- `telefone`.
- `whatsapp_nome_instancia`.
- `whatsapp_token`.
- `whatsapp_url_servidor`.
- `whatsapp_ativo`.
- `created_at`.

### `clientes`

Usada para tutores/clientes.

Campos inferidos:

- `id`.
- `nome`.
- `telefone`.
- `telefone_adicional`.
- `email`.
- `cpf`.
- `data_nascimento`.
- `nacionalidade`.
- `genero`.
- `receber_msgs`.
- `notas_internas`.
- `restricoes`.
- `logradouro`.
- `cep`.
- `numero`.
- `bairro`.
- `complemento`.
- `cidade`.
- `estado`.
- `foto_url`.
- `unidade_preferencial_id`.
- `created_at`.

Observacao: para a V2, `unidade_preferencial_id` nao deve substituir `unidade_id`. A tabela principal precisa ter `unidade_id`.

### `pets`

Usada para pets/dependentes.

Campos inferidos:

- `id`.
- `cliente_id`.
- `nome`.
- `data_nascimento`.
- `genero`.
- `especie`.
- `raca`.
- `porte`.
- `comportamento`.
- `notas_internas`.
- `restricoes`.
- `foto_url`.
- `created_at`.

Observacao: para a V2, `pets` deve ter `unidade_id`.

### `servicos`

Catalogo de servicos.

Campos inferidos:

- `id`.
- `nome`.
- `preco_base`.
- `created_at`.

### `servicos_unidade`

Disponibilidade de servicos por unidade.

Campos inferidos:

- `id`.
- `servico_id`.
- `unidade_id`.
- `ativo`.
- `created_at`.

### `pacotes`

Pacotes de fidelidade/recorrencia.

Campos inferidos:

- `id`.
- `nome`.
- `nome_pacote`.
- `cliente_id`.
- `pet_id`.
- `unidade_id`.
- `servico_id`.
- `qtd_sessoes`.
- `valor_total`.
- `valor_transporte`.
- `forma_pagamento`.
- `data_pagamento`.
- `pago`.
- `ativo`.
- `status`.
- `renovacao_automatica`.
- `created_at`.
- `forma_pagamento_2` usado pelo frontend.
- `valor_pagamento_2` usado pelo frontend.
- `pacote_anterior_id` citado nos tipos.
- `ciclo_renovacao` citado nos tipos.

### `agendamentos`

Agenda e sessoes.

Campos inferidos:

- `id`.
- `pet_id`.
- `pacote_id`.
- `numero_sessao`.
- `funcionario_id`.
- `unidade_id`.
- `data_agendamento`.
- `horario_inicio`.
- `horario_fim`.
- `valor_total`.
- `valor_transporte`.
- `status`.
- `pago`.
- `forma_pagamento`.
- `forma_pagamento_2` usado pelo frontend.
- `valor_pagamento_2` usado pelo frontend.
- `tem_taxi`.
- `endereco_busca`.
- `lembrete_enviado`.
- `valor_extra_total`.
- `status_pagamento_extra`.
- `forma_pagamento_extra`.
- `data_pagamento_extra`.
- `data_inicio_real`.
- `data_fim_real`.
- `created_at`.

### `agendamento_itens`

Servicos realizados/cobrados em um agendamento.

Campos inferidos:

- `id`.
- `agendamento_id`.
- `servico_id`.
- `valor_cobrado`.
- `created_at`.

### `funcionarios`

Usuarios operacionais vinculados ao Supabase Auth.

Campos inferidos:

- `id`.
- `nome`.
- `email`.
- `cargo`.
- `unidade_id`.
- `ativa`.
- `foto_url`.
- `created_at`.

### `despesas`

Gastos da unidade.

Campos inferidos:

- `id`.
- `unidade_id`.
- `nome_item`.
- `descricao`.
- `quantidade`.
- `valor_total`.
- `data_despesa`.
- `comprovante_url`.
- `created_at`.

### `financeiro`

Aparece no SQL gerado, mas nao parece ser a principal origem do financeiro atual.

Campos inferidos:

- `id`.
- `unidade_id`.
- `tipo`.
- `valor`.
- `data`.
- `descricao`.
- `created_at`.

### `logs_whatsapp`

Logs de envio.

Campos inferidos:

- `id`.
- `unidade_id`.
- `nome_cliente`.
- `nome_pet`.
- `telefone`.
- `tipo_agendamento`.
- `status`.
- `mensagem`.
- `detalhe_erro`.
- `criado_em`.

### `auditoria`

Logs internos.

Campos inferidos:

- `id`.
- `unidade_id`.
- `usuario_nome`.
- `usuario_email`.
- `acao`.
- `descricao`.
- `criado_em`.

## Relacionamentos inferidos

- `clientes.unidade_preferencial_id -> unidades.id`.
- `pets.cliente_id -> clientes.id`.
- `pacotes.cliente_id -> clientes.id`.
- `pacotes.pet_id -> pets.id`.
- `pacotes.unidade_id -> unidades.id`.
- `pacotes.servico_id -> servicos.id`.
- `agendamentos.pet_id -> pets.id`.
- `agendamentos.pacote_id -> pacotes.id`.
- `agendamentos.funcionario_id -> funcionarios.id`.
- `agendamentos.unidade_id -> unidades.id`.
- `agendamento_itens.agendamento_id -> agendamentos.id`.
- `agendamento_itens.servico_id -> servicos.id`.
- `despesas.unidade_id -> unidades.id`.
- `logs_whatsapp.unidade_id -> unidades.id`.
- `auditoria.unidade_id -> unidades.id`.
- `funcionarios.unidade_id -> unidades.id`.

## Lacunas que precisam dos arquivos do banco antigo

- Schema real de producao.
- Tipos exatos, constraints, defaults e indices.
- Politicas RLS existentes, se houver.
- Triggers/functions instaladas no Supabase antigo.
- Campos criados manualmente no banco e nao refletidos em `sqlGenerator.ts`.
- Valores reais de status usados em pacotes, agendamentos e financeiro.
- Regras reais de saldo de pacote.
- Estrutura real de pagamento dividido.
- Se ha dados duplicados ou inconsistentes por unidade.

## Conclusao

O codigo permite inferir bastante do modelo atual, mas nao substitui a leitura do banco antigo. Antes de criar migrations da V2, e necessario adicionar os arquivos em `docs/supabase-antigo` ou exportar o schema do Supabase antigo em modo somente leitura.
