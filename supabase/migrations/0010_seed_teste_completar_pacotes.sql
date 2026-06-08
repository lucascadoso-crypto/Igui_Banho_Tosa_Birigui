-- Sistema Pet V2 - complement fictitious package seed after base seed
-- This migration only creates missing fake package/session/finance records.

with unidade as (
  select id
  from public.unidades
  where slug = 'birigui-teste'
  limit 1
),
servico_banho as (
  select id
  from public.servicos
  where nome = 'Banho Pequeno'
  limit 1
),
tosador as (
  select id
  from public.funcionarios
  where email = 'bruno.teste@example.com'
  limit 1
),
pets_alvo as (
  select p.id as pet_id, p.cliente_id, p.unidade_id, p.nome
  from public.pets p
  join unidade u on u.id = p.unidade_id
  where p.nome in ('Mel', 'Luna')
),
pacotes_seed as (
  insert into public.pacotes (
    unidade_id, cliente_id, pet_id, servico_id, nome, qtd_sessoes,
    valor_total, valor_transporte, status, data_inicio
  )
  select
    p.unidade_id,
    p.cliente_id,
    p.pet_id,
    s.id,
    'Pacote Teste 4 Banhos',
    4,
    220.00,
    0.00,
    'ativo'::public.pacote_status,
    current_date
  from pets_alvo p
  cross join servico_banho s
  where not exists (
    select 1
    from public.pacotes existing
    where existing.pet_id = p.pet_id
      and existing.nome = 'Pacote Teste 4 Banhos'
  )
  returning id, unidade_id, cliente_id, pet_id
),
agendamentos_seed as (
  insert into public.agendamentos (
    unidade_id, cliente_id, pet_id, pacote_id, numero_sessao, funcionario_id,
    data_agendamento, horario_inicio, horario_fim, status, valor_servicos, valor_transporte
  )
  select
    p.unidade_id,
    p.cliente_id,
    p.pet_id,
    p.id,
    gs.sessao,
    t.id,
    current_date + ((gs.sessao - 1) * 7),
    time '09:00',
    time '10:00',
    case when gs.sessao = 1 then 'confirmado'::public.agendamento_status else 'agendado'::public.agendamento_status end,
    55.00,
    0.00
  from pacotes_seed p
  cross join generate_series(1, 4) as gs(sessao)
  cross join tosador t
  returning id, unidade_id, cliente_id, pet_id, pacote_id, valor_servicos
),
itens_seed as (
  insert into public.agendamento_itens (unidade_id, agendamento_id, servico_id, valor_cobrado)
  select a.unidade_id, a.id, s.id, a.valor_servicos
  from agendamentos_seed a
  cross join servico_banho s
  returning id
),
movimento_pacote_seed as (
  insert into public.financeiro_movimentos (
    unidade_id, cliente_id, pet_id, pacote_id, tipo, categoria, descricao,
    valor_total, data_competencia, status, origem
  )
  select
    p.unidade_id,
    p.cliente_id,
    p.pet_id,
    p.id,
    'receita'::public.financeiro_tipo,
    'pacote',
    'Venda ficticia de pacote teste',
    220.00,
    current_date,
    'pago'::public.financeiro_status,
    'seed_teste'
  from pacotes_seed p
  returning id, unidade_id
),
pagamentos_seed as (
  insert into public.financeiro_pagamentos (unidade_id, movimento_id, forma_pagamento, valor, observacao)
  select unidade_id, id, 'pix'::public.forma_pagamento, 120.00, 'Pagamento ficticio dividido - parte 1'
  from movimento_pacote_seed
  union all
  select unidade_id, id, 'credito'::public.forma_pagamento, 100.00, 'Pagamento ficticio dividido - parte 2'
  from movimento_pacote_seed
  returning id
)
insert into public.auditoria_logs (
  unidade_id, usuario_email, usuario_nome, acao, tabela, descricao, dados_depois
)
select
  unidade.id,
  'sistema@example.com',
  'Seed V2',
  'SEED_TESTE_PACOTES_COMPLETADO',
  'seed',
  'Pacotes e sessoes ficticias complementares criados para homologacao.',
  jsonb_build_object('real_data', false, 'scope', 'test_only')
from unidade
where exists (select 1 from pacotes_seed);
