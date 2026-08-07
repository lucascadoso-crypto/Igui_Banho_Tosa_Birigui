-- Corrige a raiz da recorrência dos pacotes: até aqui a "frequência" era só
-- adivinhada a partir de qtd_sessoes (4 = semanal, 2 = quinzenal) e a renovação
-- ancorava sempre na última data_agendamento gravada — inclusive quando essa
-- data tinha sido remarcada manualmente, propagando o dia da semana errado
-- pra sempre. Colunas aditivas, sem backfill: pacotes existentes continuam
-- com esses campos nulos (o app cai no fallback pela 1ª sessão) até serem
-- recriados/renovados.

alter table public.pacotes
  add column if not exists intervalo_dias integer,
  add column if not exists dia_semana_preferido integer check (dia_semana_preferido between 0 and 6);

comment on column public.pacotes.intervalo_dias is
  'Intervalo em dias entre sessões (7 = semanal, 14 = quinzenal), fixado na criação do pacote. Não deve ser re-derivado de qtd_sessoes depois de criado.';
comment on column public.pacotes.dia_semana_preferido is
  'Dia da semana (0=domingo..6=sábado) da 1ª sessão do pacote. Usado para realinhar a data ao renovar, mesmo que a última sessão tenha sido remarcada manualmente.';
