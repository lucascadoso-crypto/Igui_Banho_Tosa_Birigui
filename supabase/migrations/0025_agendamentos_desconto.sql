-- Adiciona coluna de desconto real em agendamentos.
-- Hoje o frontend lia appt.valor_desconto/appt.desconto, mas essa coluna nunca existiu
-- na tabela agendamentos (so existe em notas_fiscais/nota_fiscal_itens). Esta migration
-- cria a coluna para que o desconto no agendamento avulso passe a ser persistido de fato.

alter table public.agendamentos
  add column if not exists valor_desconto numeric(10,2) not null default 0;

alter table public.agendamentos
  add constraint agendamentos_valor_desconto_nao_negativo
  check (valor_desconto >= 0) not valid;

alter table public.agendamentos
  validate constraint agendamentos_valor_desconto_nao_negativo;
