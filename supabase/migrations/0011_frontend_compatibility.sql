-- Sistema Pet V2 - temporary frontend compatibility layer
-- Keeps current screens operational while the frontend is progressively moved to the normalized V2 model.

alter table public.clientes
  add column if not exists unidade_preferencial_id uuid references public.unidades(id) on delete set null;

alter table public.unidades
  add column if not exists whatsapp_nome_instancia text,
  add column if not exists whatsapp_token text,
  add column if not exists whatsapp_url_servidor text,
  add column if not exists whatsapp_ativo boolean not null default false;

update public.clientes
set unidade_preferencial_id = unidade_id
where unidade_preferencial_id is null;

alter table public.pacotes
  add column if not exists nome_pacote text,
  add column if not exists pago boolean not null default false,
  add column if not exists ativo boolean not null default true,
  add column if not exists forma_pagamento text,
  add column if not exists forma_pagamento_2 text,
  add column if not exists valor_pagamento_2 numeric(10,2) not null default 0,
  add column if not exists data_pagamento date;

alter table public.pacotes
  alter column status type text using status::text,
  alter column status set default 'Agendado';

update public.pacotes
set nome_pacote = coalesce(nome_pacote, nome),
    pago = case when status in ('pago', 'concluido', 'FINALIZADO', 'Finalizado') then true else pago end;

alter table public.agendamentos
  add column if not exists valor_total numeric(10,2) not null default 0,
  add column if not exists pago boolean not null default false,
  add column if not exists forma_pagamento text,
  add column if not exists forma_pagamento_2 text,
  add column if not exists valor_pagamento_2 numeric(10,2) not null default 0,
  add column if not exists forma_pagamento_extra text,
  add column if not exists data_pagamento_extra date;

alter table public.agendamentos
  alter column status type text using status::text,
  alter column status set default 'Agendado',
  alter column status_pagamento_extra type text using status_pagamento_extra::text,
  alter column status_pagamento_extra set default 'PENDENTE';

update public.agendamentos
set valor_total = case when valor_total = 0 then valor_servicos + valor_transporte else valor_total end,
    status = case status
      when 'agendado' then 'Agendado'
      when 'confirmado' then 'Confirmado'
      when 'em_atendimento' then 'Em Andamento'
      when 'finalizado' then 'Finalizado'
      when 'cancelado' then 'Cancelado'
      when 'faltou' then 'Faltou'
      else status
    end;

alter table public.whatsapp_mensagens
  add column if not exists nome_cliente text,
  add column if not exists nome_pet text,
  add column if not exists tipo_agendamento text,
  add column if not exists criado_em timestamptz not null default now();

alter table public.whatsapp_mensagens
  alter column status type text using status::text,
  alter column status set default 'PENDENTE';

alter table public.auditoria_logs
  add column if not exists criado_em timestamptz not null default now();
