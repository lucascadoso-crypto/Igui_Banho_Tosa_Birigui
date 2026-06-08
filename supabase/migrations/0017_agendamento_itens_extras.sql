-- Suporte a servicos adicionais/extras por item de agendamento.
-- Migration aditiva: nao remove nem altera dados reais existentes.

alter table public.agendamento_itens
  add column if not exists descricao text,
  add column if not exists valor numeric(10,2),
  add column if not exists tipo text not null default 'principal',
  add column if not exists eh_extra boolean not null default false,
  add column if not exists valor_extra numeric(10,2) not null default 0;

update public.agendamento_itens
set
  tipo = case when eh_extra then 'adicional' else coalesce(nullif(tipo, ''), 'principal') end,
  valor = coalesce(valor, nullif(valor_cobrado, 0), nullif(valor_extra, 0), 0)
where valor is null
   or tipo is null
   or tipo = '';

create index if not exists idx_agendamento_itens_extra
on public.agendamento_itens(agendamento_id, eh_extra);
