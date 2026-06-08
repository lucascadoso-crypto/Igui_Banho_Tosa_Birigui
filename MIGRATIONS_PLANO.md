# Migrations - Plano

Data: 2026-06-08

## Objetivo

Planejar as migrations SQL do Supabase novo `Igui_Banho_Tosa_Birigui`, sem executar nada ainda e sem importar dados reais.

## Importante

Este documento e um plano. As migrations SQL executaveis devem ser criadas somente depois da aprovacao.

`docs/supabase-antigo` nao foi encontrado no workspace local nem no repositorio remoto analisado. Quando os backups forem adicionados, este plano deve ser revisado antes da criacao final das migrations.

## Estrutura proposta

```txt
supabase/
  migrations/
    0001_extensions_enums.sql
    0002_unidades_auth_perfis.sql
    0003_clientes_pets_servicos.sql
    0004_pacotes_agenda.sql
    0005_financeiro.sql
    0006_whatsapp_auditoria.sql
    0007_rls_policies.sql
    0008_indexes.sql
    0009_seed_teste_birigui.sql
```

## 0001_extensions_enums.sql

Responsabilidades:

- habilitar extensoes;
- criar enums/base de status.

Extensoes:

- `pgcrypto`, se necessario para `gen_random_uuid()`.
- `citext`, se aprovado para email.

Enums ou checks planejados:

- status de agendamento;
- status de pacote;
- status financeiro;
- tipo de movimento financeiro;
- forma de pagamento;
- perfil de usuario.

Status sugeridos:

```txt
agendamento: agendado, confirmado, em_atendimento, finalizado, cancelado, faltou
pacote: ativo, concluido, cancelado, vencido
financeiro: pendente, pago, parcial, cancelado
movimento: receita, despesa, estorno
```

## 0002_unidades_auth_perfis.sql

Criar:

- `config_sistema`;
- `unidades`;
- `usuarios_perfis`;
- `usuarios_unidades`;
- `funcionarios`.

Tambem preparar trigger opcional para criar funcionario pendente quando um usuario entrar via Auth.

Pontos de decisao:

- confirmar se `funcionarios.id` sera igual a `auth.users.id` ou se havera `user_id` separado;
- recomendacao: usar `funcionarios.id` proprio e `funcionarios.user_id` apontando para `auth.users.id`.

## 0003_clientes_pets_servicos.sql

Criar:

- `clientes`;
- `pets`;
- `servicos`;
- `servicos_unidade`.

Regras:

- `clientes.unidade_id` obrigatorio;
- `pets.unidade_id` obrigatorio;
- `pets.cliente_id` obrigatorio;
- `servicos` pode ser global;
- `servicos_unidade` sempre tem `unidade_id`.

Indices:

- clientes por `unidade_id`;
- clientes por telefone;
- clientes por nome;
- pets por `unidade_id`;
- pets por `cliente_id`;
- servicos_unidade por `unidade_id`.

## 0004_pacotes_agenda.sql

Criar:

- `pacotes`;
- `agendamentos`;
- `agendamento_itens`.

Regras:

- todas com `unidade_id`;
- `agendamentos` deve ter `cliente_id` alem de `pet_id` para facilitar RLS, busca e relatorios;
- `agendamento_itens` tambem deve ter `unidade_id`;
- pacotes devem permitir renovacao e vinculo com pacote anterior;
- sessoes de pacote podem continuar como `agendamentos` com `pacote_id` e `numero_sessao`.

Ponto de decisao:

- criar ou nao uma tabela separada `pacote_sessoes`.
- recomendacao inicial: nao criar agora se o app atual ja usa `agendamentos` como sessoes. Reavaliar depois da primeira versao operacional.

## 0005_financeiro.sql

Criar:

- `financeiro_movimentos`;
- `financeiro_pagamentos`;
- `despesas`.

Regras:

- `financeiro_movimentos` representa a obrigacao/receita/despesa.
- `financeiro_pagamentos` representa cada pagamento parcial.
- pagamento dividido deve ser N pagamentos, nao campos fixos.
- despesas podem gerar movimentos financeiros do tipo despesa.

Compatibilidade com app antigo:

- receita avulsa de `agendamentos`;
- receita de `pacotes`;
- extras de `agendamentos`;
- transporte separado;
- despesas como saida.

## 0006_whatsapp_auditoria.sql

Criar:

- `whatsapp_configuracoes`;
- `whatsapp_mensagens`;
- `auditoria_logs`;
- `migration_imports`;
- `migration_errors`.

Regras:

- logs de WhatsApp com `unidade_id`;
- auditoria com `unidade_id`, usuario, acao, tabela, registro e JSON antes/depois;
- tabelas de migracao existem desde cedo, mas nao serao usadas para importar dados reais nesta fase.

## 0007_rls_policies.sql

Responsabilidades:

- habilitar RLS em todas as tabelas sensiveis;
- criar policies por unidade;
- criar policies globais para master;
- permitir leitura restrita de catalogos;
- impedir acesso cruzado entre unidades.

Modelo base:

```sql
exists (
  select 1
  from public.usuarios_unidades uu
  where uu.user_id = auth.uid()
  and uu.unidade_id = table_name.unidade_id
  and uu.ativo = true
)
```

Policy master:

```sql
exists (
  select 1
  from public.usuarios_unidades uu
  where uu.user_id = auth.uid()
  and uu.perfil = 'master'
  and uu.ativo = true
)
```

## 0008_indexes.sql

Criar indices para:

- `unidade_id` em todas as tabelas principais;
- busca de clientes por nome e telefone;
- pets por cliente;
- agenda por unidade/data/status;
- pacotes por unidade/status;
- financeiro por unidade/data/status;
- auditoria por unidade/data;
- WhatsApp por unidade/data/status.

## 0009_seed_teste_birigui.sql

Criar dados falsos, sem importar dados reais:

- 1 unidade Birigui teste;
- config inicial do sistema;
- perfis;
- funcionarios de teste;
- servicos;
- clientes ficticios;
- pets ficticios;
- pacotes ficticios;
- agendamentos ficticios;
- pagamentos divididos ficticios;
- despesas ficticias;
- logs WhatsApp ficticios;
- logs auditoria ficticios.

## Ordem de validacao

1. Aplicar migrations em Supabase novo vazio.
2. Confirmar tabelas.
3. Confirmar RLS ativo.
4. Rodar seeds de teste.
5. Logar com usuario de teste.
6. Validar acesso por unidade.
7. Executar fluxo completo.
8. Ajustar app ao schema.
9. Repetir em ambiente limpo.

## Antes de criar SQL executavel

Confirmar:

- se pode seguir com o modelo financeiro novo;
- se `pacote_sessoes` fica fora da primeira versao;
- quais perfis iniciais devem existir;
- se a unidade de teste deve se chamar exatamente `Birigui`;
- se o provedor WhatsApp sera Evolution API;
- se tokens de WhatsApp ficarao em secrets ou tabela restrita.
