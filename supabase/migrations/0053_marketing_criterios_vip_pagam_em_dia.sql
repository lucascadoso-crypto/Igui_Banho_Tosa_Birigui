-- Marketing & Fidelizacao: refina os criterios de "Pagam em dia" e
-- "VIP / mais fieis", a pedido do usuario (ver conversa). Substitui as
-- views de 0052_marketing_fidelizacao_views.sql; nenhuma tabela e alterada.
--
-- Novas regras de negocio:
--  - "Pagam em dia" deixa de ser so pacotes.pago = true. Agora exige que o
--    pagamento do pacote tenha ocorrido ate (no maximo) a data do 2o banho
--    do pacote (agendamentos.numero_sessao = 2). Pacotes com menos de 2
--    sessoes ou cuja 2a sessao ainda nao foi agendada usam so pago=true
--    como fallback (nao ha "2o banho" para comparar).
--  - "VIP / mais fieis" deixa de usar contagem de banhos nos ultimos 12
--    meses. Agora exige pacote ativo no momento + pelo menos 2 pacotes ja
--    CONCLUIDOS no historico (saldo zerado, nao cancelado). Cliente ainda
--    no 1o ou 2o pacote (menos de 2 concluidos) nao conta como fiel ainda.

create or replace view public.marketing_pacotes_status
with (security_invoker = true)
as
select
  ps.*,
  (
    ps.ativo is distinct from false
    and ps.saldo_calculado > 0
    and ps.status not ilike '%cancel%'
    and ps.status not ilike '%final%'
    and ps.status not ilike '%conclu%'
  ) as pacote_ativo,
  -- Pacote "concluido": todas as sessoes usadas, sem cancelamento.
  (
    ps.saldo_calculado = 0
    and ps.status not ilike '%cancel%'
  ) as pacote_concluido,
  seg2.data_segunda_sessao,
  -- Pago ate (no maximo) o 2o banho do pacote. Sem 2a sessao registrada
  -- ainda, cai no fallback de so olhar se esta pago.
  (
    ps.pago
    and ps.data_pagamento is not null
    and (
      seg2.data_segunda_sessao is null
      or ps.data_pagamento <= seg2.data_segunda_sessao
    )
  ) as pago_ate_segundo_banho
from public.pacotes_com_saldo ps
left join lateral (
  select min(a.data_agendamento) as data_segunda_sessao
  from public.agendamentos a
  where a.pacote_id = ps.id and a.numero_sessao = 2
) seg2 on true;

grant select on public.marketing_pacotes_status to authenticated;

create or replace view public.marketing_cliente_metricas
with (security_invoker = true)
as
with finalizados as (
  select a.unidade_id, a.cliente_id, a.id, a.data_agendamento, a.pacote_id
  from public.agendamentos a
  where upper(a.status) = 'FINALIZADO'
),
banhos_12m as (
  select cliente_id, unidade_id, count(*) as banhos_12m
  from finalizados
  where data_agendamento >= (current_date - interval '12 months')
  group by cliente_id, unidade_id
),
avulsos as (
  select cliente_id, unidade_id, count(*) as avulsos_finalizados
  from finalizados
  where pacote_id is null
  group by cliente_id, unidade_id
),
ultimo_finalizado as (
  select cliente_id, unidade_id, max(data_agendamento) as ultimo_finalizado_em
  from finalizados
  group by cliente_id, unidade_id
),
pacotes_cliente as (
  select
    cliente_id,
    unidade_id,
    count(*) as total_pacotes,
    bool_or(pacote_ativo) as tem_pacote_ativo,
    count(*) filter (where pacote_concluido) as pacotes_concluidos,
    bool_or(
      not pacote_ativo
      and status not ilike '%cancel%'
      and (
        (data_fim is not null and data_fim between (current_date - 60) and (current_date - 30))
        or (data_fim is null and saldo_calculado = 0)
      )
    ) as pacote_vencido_recente,
    bool_and(pago) filter (where pacote_ativo) as pacotes_ativos_pagos,
    -- "Sempre paga em dia": de todos os pacotes ja pagos por este cliente,
    -- todos foram pagos ate o 2o banho.
    bool_and(pago_ate_segundo_banho) filter (where pago) as pagamentos_sempre_no_prazo,
    max(valor_total) filter (
      where not pacote_ativo
        and status not ilike '%cancel%'
        and (
          (data_fim is not null and data_fim between (current_date - 60) and (current_date - 30))
          or (data_fim is null and saldo_calculado = 0)
        )
    ) as valor_ultimo_pacote_vencido
  from public.marketing_pacotes_status
  group by cliente_id, unidade_id
),
ultimo_agendamento as (
  select distinct on (cliente_id, unidade_id)
    cliente_id, unidade_id, id as ultimo_agendamento_id
  from public.agendamentos
  order by cliente_id, unidade_id, data_agendamento desc nulls last, horario_inicio desc nulls last, id desc
)
select
  c.id as cliente_id,
  c.unidade_id,
  c.nome,
  c.telefone,
  c.receber_msgs,
  c.data_nascimento as cliente_nascimento,
  coalesce(b12.banhos_12m, 0) as banhos_12m,
  coalesce(av.avulsos_finalizados, 0) as avulsos_finalizados,
  uf.ultimo_finalizado_em,
  case
    when uf.ultimo_finalizado_em is not null then (current_date - uf.ultimo_finalizado_em)
    else null
  end as dias_desde_ultimo_finalizado,
  coalesce(pc.total_pacotes, 0) as total_pacotes,
  coalesce(pc.tem_pacote_ativo, false) as tem_pacote_ativo,
  coalesce(pc.pacote_vencido_recente, false) as pacote_vencido_recente,
  pc.pacotes_ativos_pagos,
  pc.valor_ultimo_pacote_vencido,
  ua.ultimo_agendamento_id,
  -- Colunas novas desta migration: apendadas no final porque
  -- CREATE OR REPLACE VIEW nao permite reordenar/inserir colunas
  -- existentes no meio da lista, so no fim.
  coalesce(pc.pacotes_concluidos, 0) as pacotes_concluidos,
  pc.pagamentos_sempre_no_prazo
from public.clientes c
left join banhos_12m b12 on b12.cliente_id = c.id and b12.unidade_id = c.unidade_id
left join avulsos av on av.cliente_id = c.id and av.unidade_id = c.unidade_id
left join ultimo_finalizado uf on uf.cliente_id = c.id and uf.unidade_id = c.unidade_id
left join pacotes_cliente pc on pc.cliente_id = c.id and pc.unidade_id = c.unidade_id
left join ultimo_agendamento ua on ua.cliente_id = c.id and ua.unidade_id = c.unidade_id
where c.ativo = true;

grant select on public.marketing_cliente_metricas to authenticated;

-- Colunas explicitas (em vez de m.*) e nessa ordem porque CREATE OR REPLACE
-- VIEW so aceita colunas novas no final: m.* traria pacotes_concluidos e
-- pagamentos_sempre_no_prazo ANTES das colunas seg_*, que ja existiam em
-- posicao fixa desde 0052 -- quebraria pelo mesmo motivo do erro acima.
create or replace view public.marketing_segmentos_clientes
with (security_invoker = true)
as
select
  m.cliente_id,
  m.unidade_id,
  m.nome,
  m.telefone,
  m.receber_msgs,
  m.cliente_nascimento,
  m.banhos_12m,
  m.avulsos_finalizados,
  m.ultimo_finalizado_em,
  m.dias_desde_ultimo_finalizado,
  m.total_pacotes,
  m.tem_pacote_ativo,
  m.pacote_vencido_recente,
  m.pacotes_ativos_pagos,
  m.valor_ultimo_pacote_vencido,
  m.ultimo_agendamento_id,
  (m.tem_pacote_ativo and m.pacotes_concluidos >= 2) as seg_vip,
  (
    m.tem_pacote_ativo
    and m.pacotes_ativos_pagos is true
    and m.pagamentos_sempre_no_prazo is true
  ) as seg_pagam_em_dia,
  (m.avulsos_finalizados >= 2 and m.total_pacotes = 0) as seg_avulso_recorrente,
  (m.pacote_vencido_recente and not m.tem_pacote_ativo) as seg_nao_renovaram,
  (m.dias_desde_ultimo_finalizado is null or m.dias_desde_ultimo_finalizado > 60) as seg_inativos,
  m.pacotes_concluidos,
  m.pagamentos_sempre_no_prazo
from public.marketing_cliente_metricas m;

grant select on public.marketing_segmentos_clientes to authenticated;
