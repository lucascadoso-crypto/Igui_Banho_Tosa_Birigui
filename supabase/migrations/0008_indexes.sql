-- Sistema Pet V2 - indexes

create index if not exists idx_usuarios_unidades_user_id on public.usuarios_unidades(user_id);
create index if not exists idx_usuarios_unidades_unidade_id on public.usuarios_unidades(unidade_id);

create index if not exists idx_funcionarios_unidade_id on public.funcionarios(unidade_id);
create index if not exists idx_funcionarios_email on public.funcionarios(email);

create index if not exists idx_clientes_unidade_id on public.clientes(unidade_id);
create index if not exists idx_clientes_nome on public.clientes using gin (to_tsvector('portuguese', coalesce(nome, '')));
create index if not exists idx_clientes_telefone on public.clientes(telefone);
create index if not exists idx_clientes_cpf on public.clientes(cpf);

create index if not exists idx_pets_unidade_id on public.pets(unidade_id);
create index if not exists idx_pets_cliente_id on public.pets(cliente_id);
create index if not exists idx_pets_nome on public.pets using gin (to_tsvector('portuguese', coalesce(nome, '')));

create index if not exists idx_servicos_unidade_unidade_id on public.servicos_unidade(unidade_id);
create index if not exists idx_servicos_unidade_servico_id on public.servicos_unidade(servico_id);

create index if not exists idx_pacotes_unidade_status on public.pacotes(unidade_id, status);
create index if not exists idx_pacotes_cliente_id on public.pacotes(cliente_id);
create index if not exists idx_pacotes_pet_id on public.pacotes(pet_id);

create index if not exists idx_agendamentos_unidade_data on public.agendamentos(unidade_id, data_agendamento);
create index if not exists idx_agendamentos_unidade_status on public.agendamentos(unidade_id, status);
create index if not exists idx_agendamentos_pacote_id on public.agendamentos(pacote_id);
create index if not exists idx_agendamentos_pet_id on public.agendamentos(pet_id);

create index if not exists idx_agendamento_itens_unidade_id on public.agendamento_itens(unidade_id);
create index if not exists idx_agendamento_itens_agendamento_id on public.agendamento_itens(agendamento_id);

create index if not exists idx_despesas_unidade_data on public.despesas(unidade_id, data_despesa);

create index if not exists idx_financeiro_movimentos_unidade_data on public.financeiro_movimentos(unidade_id, data_competencia);
create index if not exists idx_financeiro_movimentos_status on public.financeiro_movimentos(unidade_id, status);
create index if not exists idx_financeiro_pagamentos_unidade_id on public.financeiro_pagamentos(unidade_id);
create index if not exists idx_financeiro_pagamentos_movimento_id on public.financeiro_pagamentos(movimento_id);

create index if not exists idx_whatsapp_mensagens_unidade_created on public.whatsapp_mensagens(unidade_id, created_at desc);
create index if not exists idx_whatsapp_mensagens_status on public.whatsapp_mensagens(unidade_id, status);

create index if not exists idx_auditoria_logs_unidade_created on public.auditoria_logs(unidade_id, created_at desc);
create index if not exists idx_auditoria_logs_user_id on public.auditoria_logs(user_id);
