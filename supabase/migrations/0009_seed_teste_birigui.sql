-- Sistema Pet V2 - fictitious test seed only
-- No real client, pet, package or appointment data is inserted here.

insert into public.config_sistema (id, nome_fantasia, logo_url)
values (1, 'iG Banho e Tosa V2', null)
on conflict (id) do update
set nome_fantasia = excluded.nome_fantasia,
    logo_url = excluded.logo_url;

with unidade as (
  insert into public.unidades (nome, slug, telefone, endereco_completo, ativo)
  values ('Birigui Teste', 'birigui-teste', '(18) 3000-0000', 'Rua de Teste, 100 - Birigui/SP', true)
  on conflict (slug) do update
  set nome = excluded.nome,
      telefone = excluded.telefone,
      endereco_completo = excluded.endereco_completo,
      ativo = excluded.ativo
  returning id
),
servicos_seed as (
  insert into public.servicos (nome, descricao, preco_base, duracao_minutos, ativo)
  values
    ('Banho Pequeno', 'Banho para pets de pequeno porte', 55.00, 60, true),
    ('Banho Medio', 'Banho para pets de medio porte', 70.00, 75, true),
    ('Tosa Higienica', 'Tosa higienica de manutencao', 45.00, 45, true),
    ('Hidratacao', 'Hidratacao de pelagem', 35.00, 30, true)
  on conflict (nome) do update
  set descricao = excluded.descricao,
      preco_base = excluded.preco_base,
      duracao_minutos = excluded.duracao_minutos,
      ativo = excluded.ativo
  returning id, nome, preco_base
),
servicos_unidade_seed as (
  insert into public.servicos_unidade (unidade_id, servico_id, preco, ativo)
  select unidade.id, servicos_seed.id, servicos_seed.preco_base, true
  from unidade
  cross join servicos_seed
  on conflict (unidade_id, servico_id) do update
  set preco = excluded.preco,
      ativo = excluded.ativo
  returning id
),
funcionarios_seed as (
  insert into public.funcionarios (unidade_id, nome, email, telefone, cargo, ativo)
  select unidade.id, nome, email, telefone, cargo::public.user_profile, true
  from unidade
  cross join (
    values
      ('Ana Teste', 'ana.teste@example.com', '(18) 99900-0001', 'admin_unidade'),
      ('Bruno Teste', 'bruno.teste@example.com', '(18) 99900-0002', 'tosador'),
      ('Caixa Teste', 'caixa.teste@example.com', '(18) 99900-0003', 'financeiro')
  ) as f(nome, email, telefone, cargo)
  on conflict (email) do update
  set nome = excluded.nome,
      telefone = excluded.telefone,
      cargo = excluded.cargo,
      ativo = excluded.ativo,
      unidade_id = excluded.unidade_id
  returning id, nome, cargo, unidade_id
),
clientes_seed as (
  insert into public.clientes (unidade_id, nome, telefone, email, receber_msgs, logradouro, numero, bairro, cidade, estado, notas_internas)
  select unidade.id, nome, telefone, email, true, logradouro, numero, bairro, 'Birigui', 'SP', notas
  from unidade
  cross join (
    values
      ('Cliente Teste 01', '(18) 99911-0001', 'cliente01@example.com', 'Rua Alfa', '10', 'Centro', 'Prefere atendimento pela manha'),
      ('Cliente Teste 02', '(18) 99911-0002', 'cliente02@example.com', 'Rua Beta', '20', 'Jardim Teste', 'Pet com sensibilidade na pele'),
      ('Cliente Teste 03', '(18) 99911-0003', 'cliente03@example.com', 'Rua Gama', '30', 'Vila Teste', null),
      ('Cliente Teste 04', '(18) 99911-0004', 'cliente04@example.com', 'Rua Delta', '40', 'Centro', null),
      ('Cliente Teste 05', '(18) 99911-0005', 'cliente05@example.com', 'Rua Epsilon', '50', 'Jardim Teste', 'Usa taxi pet')
  ) as c(nome, telefone, email, logradouro, numero, bairro, notas)
  returning id, unidade_id, nome
),
pets_seed as (
  insert into public.pets (unidade_id, cliente_id, nome, especie, raca, porte, genero, comportamento, restricoes)
  select c.unidade_id, c.id, p.nome, p.especie, p.raca, p.porte, p.genero, p.comportamento, p.restricoes
  from clientes_seed c
  join lateral (
    values
      (
        case c.nome
          when 'Cliente Teste 01' then 'Mel'
          when 'Cliente Teste 02' then 'Thor'
          when 'Cliente Teste 03' then 'Luna'
          when 'Cliente Teste 04' then 'Nina'
          else 'Bob'
        end,
        'cao',
        case c.nome
          when 'Cliente Teste 01' then 'Shih-tzu'
          when 'Cliente Teste 02' then 'Golden Retriever'
          when 'Cliente Teste 03' then 'Poodle'
          when 'Cliente Teste 04' then 'Spitz'
          else 'SRD'
        end,
        case c.nome when 'Cliente Teste 02' then 'grande' else 'pequeno' end,
        case c.nome when 'Cliente Teste 04' then 'femea' else 'macho' end,
        'tranquilo',
        case c.nome when 'Cliente Teste 02' then 'Evitar shampoo perfumado' else null end
      )
  ) as p(nome, especie, raca, porte, genero, comportamento, restricoes) on true
  returning id, unidade_id, cliente_id, nome
),
pacote_seed as (
  insert into public.pacotes (unidade_id, cliente_id, pet_id, servico_id, nome, qtd_sessoes, valor_total, valor_transporte, status, data_inicio)
  select p.unidade_id, p.cliente_id, p.id, s.id, 'Pacote Teste 4 Banhos', 4, 220.00, 0.00, 'ativo'::public.pacote_status, current_date
  from pets_seed p
  join servicos_seed s on s.nome = 'Banho Pequeno'
  where p.nome in ('Mel', 'Luna')
  returning id, unidade_id, cliente_id, pet_id
),
agendamentos_pacote_seed as (
  insert into public.agendamentos (
    unidade_id, cliente_id, pet_id, pacote_id, numero_sessao, funcionario_id,
    data_agendamento, horario_inicio, horario_fim, status, valor_servicos, valor_transporte
  )
  select
    pacote_seed.unidade_id,
    pacote_seed.cliente_id,
    pacote_seed.pet_id,
    pacote_seed.id,
    gs.sessao,
    (select id from funcionarios_seed where cargo = 'tosador' limit 1),
    current_date + ((gs.sessao - 1) * 7),
    time '09:00',
    time '10:00',
    case when gs.sessao = 1 then 'confirmado'::public.agendamento_status else 'agendado'::public.agendamento_status end,
    55.00,
    0.00
  from pacote_seed
  cross join generate_series(1, 4) as gs(sessao)
  returning id, unidade_id, cliente_id, pet_id, pacote_id, numero_sessao, valor_servicos, valor_transporte
),
agendamento_avulso_seed as (
  insert into public.agendamentos (
    unidade_id, cliente_id, pet_id, funcionario_id, data_agendamento, horario_inicio,
    horario_fim, status, tem_taxi, endereco_busca, valor_servicos, valor_transporte
  )
  select
    p.unidade_id,
    p.cliente_id,
    p.id,
    (select id from funcionarios_seed where cargo = 'tosador' limit 1),
    current_date,
    time '14:00',
    time '15:00',
    'agendado'::public.agendamento_status,
    true,
    'Rua Epsilon, 50 - Jardim Teste',
    70.00,
    15.00
  from pets_seed p
  where p.nome = 'Bob'
  returning id, unidade_id, cliente_id, pet_id, valor_servicos, valor_transporte
),
todos_agendamentos as (
  select * from agendamentos_pacote_seed
  union all
  select id, unidade_id, cliente_id, pet_id, null::uuid as pacote_id, null::integer as numero_sessao, valor_servicos, valor_transporte
  from agendamento_avulso_seed
),
itens_seed as (
  insert into public.agendamento_itens (unidade_id, agendamento_id, servico_id, valor_cobrado)
  select a.unidade_id, a.id, s.id, a.valor_servicos
  from todos_agendamentos a
  join servicos_seed s on s.nome in ('Banho Pequeno', 'Banho Medio')
  where (a.valor_servicos = 55.00 and s.nome = 'Banho Pequeno')
     or (a.valor_servicos = 70.00 and s.nome = 'Banho Medio')
  returning id
),
movimento_pacote_seed as (
  insert into public.financeiro_movimentos (
    unidade_id, cliente_id, pet_id, pacote_id, tipo, categoria, descricao,
    valor_total, data_competencia, status, origem
  )
  select unidade_id, cliente_id, pet_id, id, 'receita'::public.financeiro_tipo, 'pacote', 'Venda ficticia de pacote teste', 220.00, current_date, 'pago'::public.financeiro_status, 'seed_teste'
  from pacote_seed
  limit 1
  returning id, unidade_id
),
pagamento_pacote_seed as (
  insert into public.financeiro_pagamentos (unidade_id, movimento_id, forma_pagamento, valor, observacao)
  select unidade_id, id, 'pix'::public.forma_pagamento, 120.00, 'Pagamento ficticio dividido - parte 1'
  from movimento_pacote_seed
  union all
  select unidade_id, id, 'credito'::public.forma_pagamento, 100.00, 'Pagamento ficticio dividido - parte 2'
  from movimento_pacote_seed
  returning id
),
despesa_seed as (
  insert into public.despesas (unidade_id, nome_item, descricao, quantidade, valor_total, data_despesa)
  select id, 'Shampoo Teste', 'Despesa ficticia para homologacao', 2, 89.90, current_date
  from unidade
  returning id, unidade_id, valor_total
),
movimento_despesa_seed as (
  insert into public.financeiro_movimentos (
    unidade_id, despesa_id, tipo, categoria, descricao, valor_total, data_competencia, status, origem
  )
  select unidade_id, id, 'despesa'::public.financeiro_tipo, 'insumos', 'Compra ficticia de shampoo', valor_total, current_date, 'pago'::public.financeiro_status, 'seed_teste'
  from despesa_seed
  returning id, unidade_id, valor_total
),
pagamento_despesa_seed as (
  insert into public.financeiro_pagamentos (unidade_id, movimento_id, forma_pagamento, valor, observacao)
  select unidade_id, id, 'dinheiro'::public.forma_pagamento, valor_total, 'Pagamento ficticio de despesa'
  from movimento_despesa_seed
  returning id
),
whatsapp_config_seed as (
  insert into public.whatsapp_configuracoes (unidade_id, provider, nome_instancia, url_servidor, token_secret_name, ativo)
  select id, 'evolution_api', 'birigui_teste', 'https://example.invalid', 'EVOLUTION_API_TOKEN_BIRIGUI', false
  from unidade
  on conflict (unidade_id) do update
  set provider = excluded.provider,
      nome_instancia = excluded.nome_instancia,
      url_servidor = excluded.url_servidor,
      token_secret_name = excluded.token_secret_name,
      ativo = excluded.ativo
  returning id
),
whatsapp_msg_seed as (
  insert into public.whatsapp_mensagens (
    unidade_id, cliente_id, pet_id, agendamento_id, telefone, tipo, mensagem, status, detalhe_erro
  )
  select
    a.unidade_id,
    a.cliente_id,
    a.pet_id,
    a.id,
    '(18) 99911-0005',
    'manual_teste',
    'Mensagem ficticia de teste. Nenhum envio real realizado.',
    'ignorado'::public.whatsapp_status,
    'Seed de homologacao'
  from agendamento_avulso_seed a
  returning id
)
insert into public.auditoria_logs (
  unidade_id, usuario_email, usuario_nome, acao, tabela, descricao, dados_depois
)
select
  unidade.id,
  'sistema@example.com',
  'Seed V2',
  'SEED_TESTE_CRIADO',
  'seed',
  'Dados ficticios de homologacao criados para a V2.',
  jsonb_build_object('real_data', false, 'scope', 'test_only')
from unidade;
