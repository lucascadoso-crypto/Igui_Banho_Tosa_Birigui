-- Financeiro (Prompt 2/4): Contas a Receber com idade da divida.
--
-- Wrapper aditivo de fn_financeiro_eventos_pendentes (migration 0034) -- mesma
-- fonte/regra de pendencia (pago = false, "vencido" = data de referencia
-- anterior a hoje em America/Sao_Paulo), sem duplicar nenhum calculo. So
-- acrescenta o telefone do cliente (link de "Cobrar no WhatsApp") e o pet
-- (pet_id/pet_nome, buscados direto em agendamentos/pacotes a partir do
-- referencia_id+origem -- fn_financeiro_eventos_pendentes nao devolve pet_id,
-- e nao precisamos alterar ela so por isso), usados pelo botao "Receber" que
-- reaproveita registrarPagamentoPacote/registrarRecebimentoAvulso/
-- registrarRecebimentoExtra. Agrupamento por cliente e faixas de idade da
-- divida (a vencer, 1-7, 8-30, 31-60, +60 dias) ficam no frontend -- a
-- funcao so devolve "vencido" (boolean) e a data de referencia, como a
-- lista atual ja faz.

create or replace function public.fn_financeiro_contas_pendentes_detalhe(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_transporte text default 'todos',
  p_categoria text default 'todos',
  p_forma_pagamento text default 'todas',
  p_limite int default 1000
)
returns table (
  origem text,
  referencia_id bigint,
  unidade_id bigint,
  cliente_id bigint,
  cliente_nome text,
  cliente_telefone text,
  pet_id bigint,
  pet_nome text,
  categoria text,
  descricao text,
  vencimento date,
  valor numeric,
  vencido boolean
)
language sql
stable
as $$
  select
    ep.origem,
    ep.referencia_id,
    ep.unidade_id,
    ep.cliente_id,
    ep.cliente_nome,
    c.telefone as cliente_telefone,
    coalesce(a.pet_id, pac.pet_id) as pet_id,
    coalesce(pa.nome, pp.nome) as pet_nome,
    ep.categoria,
    ep.descricao,
    ep.data_referencia as vencimento,
    ep.valor,
    ep.vencido
  from public.fn_financeiro_eventos_pendentes(p_unidade_id, p_data_inicio, p_data_fim, p_transporte, p_categoria, p_forma_pagamento) ep
  left join public.clientes c on c.id = ep.cliente_id
  left join public.agendamentos a on a.id = ep.referencia_id and ep.origem in ('avulso', 'adicional')
  left join public.pets pa on pa.id = a.pet_id
  left join public.pacotes pac on pac.id = ep.referencia_id and ep.origem = 'pacote'
  left join public.pets pp on pp.id = pac.pet_id
  order by ep.data_referencia asc
  limit p_limite;
$$;

comment on function public.fn_financeiro_contas_pendentes_detalhe(bigint, date, date, text, text, text, int) is
  'Wrapper de fn_financeiro_eventos_pendentes (migration 0034) com telefone do cliente, usado pela aba Contas a Receber do Financeiro Geral para agrupar por cliente/idade da divida e montar o link de WhatsApp. Nao duplica regra de pendencia nenhuma.';
