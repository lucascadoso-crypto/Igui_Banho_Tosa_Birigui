# Migracao de Dados

## Objetivo

Migrar uma unidade especifica do sistema antigo para o Supabase novo da V2, preservando clientes, pets, pacotes, sessoes/agendamentos e financeiro.

## Premissas

- O sistema antigo esta em producao e nao deve ser alterado.
- A migracao deve ser somente leitura no banco antigo.
- O Supabase novo deve receber dados ja transformados para o schema V2.
- Todas as tabelas principais da V2 devem ter `unidade_id`.
- A primeira carga deve ocorrer em staging.

## Bloqueio atual

A pasta `docs/supabase-antigo` nao foi encontrada no repositorio analisado. Antes de criar scripts ou migrations, e necessario adicionar:

- Export do schema antigo.
- Lista de tabelas reais.
- Politicas RLS antigas, se existirem.
- Functions/triggers antigas.
- Amostra anonimizada ou relatorio de contagem por tabela.
- ID/nome da unidade que sera migrada.

## Escopo da migracao

Migrar:

- Unidade selecionada.
- Clientes da unidade.
- Pets/dependentes desses clientes.
- Pacotes ativos, concluidos e historicos relevantes.
- Sessoes/agendamentos vinculados a pacotes.
- Agendamentos avulsos.
- Financeiro relacionado: pagamentos, pagamento dividido, despesas e extras.
- Logs de WhatsApp relevantes, se necessarios.
- Auditoria essencial, se necessaria.

Nao migrar automaticamente sem decisao:

- Credenciais de WhatsApp do banco antigo.
- Usuarios desativados.
- Dados de outras unidades.
- Logs muito antigos sem valor operacional.
- Segredos/API keys.

## Ordem segura

1. Backup/export do banco antigo.
2. Criar Supabase novo em staging.
3. Criar migrations da V2.
4. Criar unidade destino.
5. Migrar clientes.
6. Migrar pets.
7. Migrar servicos e disponibilidade por unidade.
8. Migrar pacotes.
9. Migrar agendamentos/sessoes.
10. Migrar itens de agendamento.
11. Migrar financeiro/pagamentos/despesas.
12. Migrar logs auxiliares, se aprovado.
13. Validar relatorios.
14. Repetir carga limpa.
15. Fazer carga final no Supabase novo definitivo.

## Mapeamentos esperados

### Clientes

Origem inferida: `clientes`.

Destino V2:

- `origem_id`.
- `unidade_id`.
- `nome`.
- `telefone`.
- `telefone_adicional`.
- `email`.
- `cpf`.
- endereco estruturado.
- preferencias de comunicacao.
- observacoes/restricoes.

### Pets

Origem inferida: `pets`.

Destino V2:

- `origem_id`.
- `unidade_id`.
- `cliente_id`.
- `nome`.
- `especie`.
- `raca`.
- `porte`.
- `genero`.
- `data_nascimento`.
- comportamento.
- restricoes.
- observacoes.

### Pacotes

Origem inferida: `pacotes`.

Destino V2:

- `origem_id`.
- `unidade_id`.
- `cliente_id`.
- `pet_id`.
- `servico_id`.
- `qtd_sessoes`.
- `valor_total`.
- `valor_transporte`.
- status.
- pagamento.
- renovacao.
- vinculo com pacote anterior, se existir.

### Sessoes/agendamentos

Origem inferida: `agendamentos` e `agendamento_itens`.

Destino V2:

- `origem_id`.
- `unidade_id`.
- `cliente_id`.
- `pet_id`.
- `pacote_id`, quando houver.
- `numero_sessao`.
- `funcionario_id`.
- data e horario.
- status.
- valores.
- itens/servicos.
- taxi/transporte.
- campos de inicio/fim real.

### Financeiro

Origem inferida:

- pagamentos em `agendamentos`.
- pagamentos em `pacotes`.
- extras em `agendamentos`.
- saidas em `despesas`.

Destino V2 recomendado:

- `financeiro_movimentos`.
- `financeiro_pagamentos`.

Pagamento dividido deve virar multiplos registros em `financeiro_pagamentos`, evitando campos fixos como `forma_pagamento_2`.

## Validacoes obrigatorias

### Contagem

- Total de clientes migrados.
- Total de pets migrados.
- Total de pacotes migrados.
- Total de agendamentos migrados.
- Total de despesas migradas.

### Integridade

- Nenhum pet sem cliente.
- Nenhum pacote sem cliente/pet.
- Nenhum agendamento sem unidade.
- Nenhum agendamento de pacote apontando para pacote inexistente.
- Nenhum pagamento sem movimento financeiro.

### Financeiro

- Total de receita por dia no antigo versus V2.
- Total por forma de pagamento.
- Total de despesas por dia.
- Total de pacotes pagos.
- Total de avulsos pagos.
- Total de extras pagos.

### Pacotes

- Sessoes totais.
- Sessoes realizadas.
- Sessoes futuras.
- Pacotes vencidos/cancelados/concluidos.
- Saldo por pacote.

## Riscos

- Clientes duplicados por telefone, nome ou CPF vazio.
- Pets vinculados ao cliente errado.
- Pacotes com saldo calculado de forma diferente do esperado.
- Datas afetadas por timezone.
- Status escritos com variacoes de texto.
- Pagamento dividido nao refletido no SQL atual.
- Despesas sem comprovante.
- Logs de WhatsApp com dados sensiveis.
- Diferenca entre unidade preferencial e unidade real de atendimento.

## Estrategia de rollback

Como a V2 usa Supabase novo, o rollback operacional e desligar o acesso a V2 e manter o sistema antigo intacto. A importacao deve ser idempotente usando `origem_id` e `migration_import_id`, permitindo limpar e repetir cargas no banco novo.

## Artefatos recomendados

- `migration_imports`: execucoes de importacao.
- `migration_errors`: erros por registro.
- `origem_id` nas principais tabelas migradas.
- `origem_tabela`, quando necessario.
- Relatorio CSV/JSON de validacao.
- Checklist assinado antes da virada.

## Proximo passo

Adicionar os arquivos do banco antigo em `docs/supabase-antigo` e confirmar qual unidade sera migrada. Depois disso, criar as migrations SQL da V2 em branch separada.
