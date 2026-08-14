-- Marketing & Fidelizacao: views de segmentacao de clientes (somente leitura).
--
-- Modulo aditivo: nenhuma tabela existente e alterada. As views abaixo
-- reaproveitam public.pacotes_com_saldo (0041_pacotes_saldo_view.sql) como
-- fonte de verdade de saldo de pacote, e comparam agendamentos.status com
-- upper(...) = 'FINALIZADO', o mesmo padrao ja usado em 0041.
--
-- security_invoker = true em todas as views: a RLS ja ativa em clientes,
-- pets, pacotes e agendamentos (policy "..._unit_access" via
-- can_access_unidade(unidade_id), ver 0013_bigint_business_ids.sql) continua
-- valendo para quem consulta, sem necessidade de policy propria aqui.
--
-- Decisoes de negocio registradas durante a auditoria (ver relatorio):
--  - "Pagam em dia": nao existe campo de atraso/vencimento em pacotes nem em
--    financeiro_movimentos (linhas dessa tabela so sao criadas DEPOIS que o
--    pacote e marcado pago, nunca em estado pendente/parcial para pacotes
--    -- ver services/pacotePayments.ts:garantirFinanceiroMovimento). Por
--    decisao do usuario, o segmento usa pacotes.pago = true como unico sinal
--    real disponivel, sem inventar nocao de atraso.
--  - "VIP": corte fixo de >= 4 banhos FINALIZADO nos ultimos 12 meses
--    (nao havia um numero de negocio definido; valor de partida, ajustavel).
--  - "pacote_ativo" (por linha de pacote) espelha a regra ja usada em
--    components/Pacotes.tsx:getPackageStatus/isActivePackage (saldo > 0,
--    ativo != false, status sem cancelado/finalizado/concluido) para nao
--    duplicar com uma definicao divergente.

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
  ) as pacote_ativo
from public.pacotes_com_saldo ps;

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
    bool_or(
      not pacote_ativo
      and status not ilike '%cancel%'
      and (
        (data_fim is not null and data_fim between (current_date - 60) and (current_date - 30))
        or (data_fim is null and saldo_calculado = 0)
      )
    ) as pacote_vencido_recente,
    bool_and(pago) filter (where pacote_ativo) as pacotes_ativos_pagos,
    -- Valor do pacote vencido mais recente, usado como estimativa de potencial
    -- de recompra no KPI "Não renovaram" (valor real historico, nao inventado).
    -- Cancelados sao excluidos: cancelamento nao e a mesma coisa que "nao renovou".
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
  ua.ultimo_agendamento_id
from public.clientes c
left join banhos_12m b12 on b12.cliente_id = c.id and b12.unidade_id = c.unidade_id
left join avulsos av on av.cliente_id = c.id and av.unidade_id = c.unidade_id
left join ultimo_finalizado uf on uf.cliente_id = c.id and uf.unidade_id = c.unidade_id
left join pacotes_cliente pc on pc.cliente_id = c.id and pc.unidade_id = c.unidade_id
left join ultimo_agendamento ua on ua.cliente_id = c.id and ua.unidade_id = c.unidade_id
where c.ativo = true;

grant select on public.marketing_cliente_metricas to authenticated;

create or replace view public.marketing_segmentos_clientes
with (security_invoker = true)
as
select
  m.*,
  (m.banhos_12m >= 4) as seg_vip,
  (m.tem_pacote_ativo and m.pacotes_ativos_pagos is true) as seg_pagam_em_dia,
  (m.avulsos_finalizados >= 2 and m.total_pacotes = 0) as seg_avulso_recorrente,
  (m.pacote_vencido_recente and not m.tem_pacote_ativo) as seg_nao_renovaram,
  (m.dias_desde_ultimo_finalizado is null or m.dias_desde_ultimo_finalizado > 60) as seg_inativos
from public.marketing_cliente_metricas m;

grant select on public.marketing_segmentos_clientes to authenticated;

create or replace view public.marketing_aniversariantes
with (security_invoker = true)
as
select
  c.id as cliente_id,
  c.unidade_id,
  c.nome as cliente_nome,
  c.telefone,
  c.receber_msgs,
  'cliente'::text as tipo_aniversariante,
  c.nome as nome_aniversariante,
  c.data_nascimento,
  ua.ultimo_agendamento_id
from public.clientes c
left join lateral (
  select a.id as ultimo_agendamento_id
  from public.agendamentos a
  where a.cliente_id = c.id and a.unidade_id = c.unidade_id
  order by a.data_agendamento desc nulls last, a.horario_inicio desc nulls last, a.id desc
  limit 1
) ua on true
where c.ativo = true
  and c.data_nascimento is not null
  and extract(month from c.data_nascimento) = extract(month from current_date)
union all
select
  c.id as cliente_id,
  c.unidade_id,
  c.nome as cliente_nome,
  c.telefone,
  c.receber_msgs,
  'pet'::text as tipo_aniversariante,
  p.nome as nome_aniversariante,
  p.data_nascimento,
  ua.ultimo_agendamento_id
from public.pets p
join public.clientes c on c.id = p.cliente_id
left join lateral (
  select a.id as ultimo_agendamento_id
  from public.agendamentos a
  where a.cliente_id = c.id and a.unidade_id = c.unidade_id
  order by a.data_agendamento desc nulls last, a.horario_inicio desc nulls last, a.id desc
  limit 1
) ua on true
where p.ativo = true
  and c.ativo = true
  and p.data_nascimento is not null
  and extract(month from p.data_nascimento) = extract(month from current_date);

grant select on public.marketing_aniversariantes to authenticated;
