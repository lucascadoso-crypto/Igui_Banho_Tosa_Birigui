# Telas V2 - Plano

Data: 2026-06-08

## Objetivo

Deixar a V2 operacional com dados de teste antes de migrar dados reais, preservando o funcionamento do sistema antigo e melhorando a experiencia mobile-first.

## Estado atual

O projeto atual ja possui telas para os principais fluxos:

- `Login.tsx`;
- `Sidebar.tsx`;
- `PainelGeral.tsx`;
- `FinanceiroGlobal.tsx`;
- `Equipe.tsx`;
- `Settings.tsx`;
- `Clients.tsx`;
- `ClienteModal.tsx`;
- `ClientDetailsModal.tsx`;
- `CadastroPet.tsx`;
- `Pacotes.tsx`;
- `PacoteDetalhesModal.tsx`;
- `Appointments.tsx`;
- `AgendamentoDetalhesModal.tsx`;
- `Financeiro.tsx`;
- `Gastos.tsx`;
- `GastosModal.tsx`;
- `Auditoria.tsx`;
- `Perfil.tsx`;
- `ReciboView.tsx`.

O app usa estado interno em `App.tsx` para alternar telas. A navegacao atual tem modo global e modo por unidade.

## Principios mobile-first

- A primeira experiencia deve funcionar perfeitamente no celular.
- A agenda diaria deve ser a tela mais rapida de usar.
- Cadastros devem ser curtos, com detalhes avancados em etapas.
- Acoes frequentes devem ficar visiveis: novo agendamento, buscar cliente, receber pagamento, enviar WhatsApp.
- Menus longos devem virar navegação inferior ou drawer enxuto em mobile.
- Tabelas grandes devem virar cards filtraveis em mobile.

## Mapa de telas por perfil

### Master

- Painel Geral.
- Financeiro Geral.
- Unidades.
- Funcionarios.
- Configuracoes.
- Auditoria.
- Todas as telas de unidade.

### Admin/Gerente de unidade

- Agenda.
- Clientes.
- Pets.
- Pacotes.
- Financeiro da unidade.
- Gastos.
- Funcionarios da unidade, se permitido.
- Auditoria da unidade, se permitido.

### Financeiro

- Financeiro geral.
- Financeiro da unidade.
- Despesas.
- Relatorios.
- Leitura de agenda/pacotes, se necessario.

### Atendente

- Agenda.
- Clientes.
- Pets.
- Pacotes.
- WhatsApp.
- Recebimentos, se permitido.

### Tosador/Banhista

- Agenda do dia.
- Detalhes do pet.
- Status do atendimento.
- Observacoes de entrada/saida.

## Telas principais da V2

### Login

Manter:

- login por email/senha;
- cadastro de usuario, se desejado;
- bloqueio para usuario pendente.

Melhorar:

- remover hardcode de usuario master;
- tratar recuperacao de senha;
- exibir mensagens amigaveis;
- carregar identidade visual do Supabase novo.

### Seletor/Contexto de unidade

Manter:

- conceito de multi-unidade.

Melhorar:

- usuario operacional entra direto na propria unidade;
- master alterna unidade rapidamente;
- estado de unidade deve ser centralizado.

### Dashboard/Painel Geral

Dados:

- agendamentos do dia;
- receita do dia;
- pacotes ativos;
- atendimentos pendentes;
- alertas de pagamento;
- lembretes WhatsApp.

Mobile:

- cards compactos;
- atalhos rapidos;
- sem tabelas largas.

### Clientes

Fluxos:

- listar clientes;
- buscar por nome, telefone e CPF;
- criar cliente;
- editar cliente;
- abrir detalhes;
- ver pets;
- ver historico.

Campos obrigatorios minimos:

- nome;
- telefone;
- unidade.

### Pets/dependentes

Fluxos:

- criar pet vinculado ao cliente;
- editar pet;
- registrar restricoes;
- ver historico de atendimentos;
- ver pacotes do pet.

Campos obrigatorios minimos:

- unidade;
- cliente;
- nome.

### Pacotes

Fluxos:

- criar pacote;
- escolher cliente e pet;
- escolher servicos;
- definir quantidade de sessoes;
- gerar agenda;
- registrar pagamento total ou dividido;
- acompanhar saldo;
- cancelar pacote;
- renovar pacote.

Mobile:

- wizard em etapas;
- resumo fixo antes de salvar;
- tela de detalhes com sessoes em cards.

### Agenda/sessoes

Fluxos:

- agenda diaria;
- criar agendamento avulso;
- criar sessoes de pacote;
- editar horario;
- alterar status;
- iniciar atendimento;
- finalizar atendimento;
- registrar extra;
- registrar pagamento;
- enviar WhatsApp.

Status sugeridos:

- `agendado`;
- `confirmado`;
- `em_atendimento`;
- `finalizado`;
- `cancelado`;
- `faltou`.

### Financeiro

Fluxos:

- receitas de avulsos;
- receitas de pacotes;
- extras;
- transporte;
- despesas;
- pagamento dividido;
- filtros por dia, periodo e forma de pagamento.

Melhoria estrutural:

- exibir movimentos e pagamentos separados;
- permitir mais de duas formas de pagamento;
- manter compatibilidade visual com o antigo.

### WhatsApp

Fluxos:

- enviar lembrete manual;
- enviar confirmacao de agenda;
- registrar resultado;
- ver logs;
- configurar instancia por unidade.

Importante:

- tokens nao devem trafegar livremente no frontend;
- envio deve passar por Edge Function.

### Auditoria

Fluxos:

- listar acoes por unidade;
- filtrar por usuario, tabela, acao e data;
- ver dados antes/depois em telas administrativas.

### Funcionarios

Fluxos:

- listar funcionarios;
- vincular usuario auth a unidade;
- definir perfil;
- ativar/desativar;
- trocar unidade;
- bloquear usuario pendente.

### Configuracoes

Fluxos:

- identidade visual;
- unidades;
- catalogo de servicos;
- servicos por unidade;
- WhatsApp por unidade;
- logs de WhatsApp.

## Ajustes necessarios no codigo depois da aprovacao

- Centralizar client Supabase.
- Remover credenciais/fallbacks hardcoded.
- Adaptar queries para novo schema.
- Substituir `unidade_preferencial_id` por `unidade_id` em clientes.
- Adicionar `unidade_id` em pets.
- Adaptar pagamento dividido para `financeiro_pagamentos`.
- Ajustar WhatsApp para nova funcao e novas tabelas.
- Ajustar auditoria para `auditoria_logs`.
- Criar dados de teste via seed/migration.

## Nao fazer agora

- Nao importar dados reais.
- Nao conectar ao Supabase antigo.
- Nao executar migrations no banco novo sem revisao.
- Nao alterar telas/codigo antes da aprovacao deste plano.
