-- Nota interna por agendamento: anotação específica daquele atendimento
-- (diferente de pets.notas_internas/restricoes e clientes.restricoes, que
-- são permanentes e aparecem em todos os banhos do pet/cliente).
alter table public.agendamentos
  add column if not exists nota_interna text;

-- down: alter table public.agendamentos drop column if exists nota_interna;
