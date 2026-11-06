-- CRM (Prompt 1): ciclo de retorno POR PET (a metrica existente em
-- marketing_cliente_metricas e so por cliente). View aditiva, somente
-- leitura -- nenhuma tabela e alterada.
--
-- security_invoker = true: a RLS ja ativa em pets/agendamentos/pacotes
-- (policy "..._unit_access" via can_access_unidade(unidade_id)) continua
-- valendo para quem consulta, sem necessidade de policy propria aqui --
-- mesmo padrao de 0041/0052.
--
-- Regras de negocio:
--  - "Finalizado" usa data_fim_real (fallback data_agendamento para
--    registros antigos sem data_fim_real), mesmo padrao do historico em
--    ClientDetailsModal.tsx (dataExibicao).
--  - intervalo_medio_dias = media dos intervalos (em dias) entre
--    atendimentos finalizados consecutivos do pet. Precisa de pelo menos 2
--    atendimentos finalizados para existir; com 0 ou 1, fica null.
--  - proximo_retorno_previsto = ultimo_atendimento + intervalo_medio_dias
--    (arredondado), quando houver intervalo calculavel.
--  - Pet com pacote ativo (marketing_pacotes_status.pacote_ativo) e uma
--    sessao futura ja agendada (nao finalizada/cancelada) sempre conta como
--    'em_dia', independente do calculo acima.
--  - status_retorno: 'sem_historico' (nunca teve atendimento finalizado),
--    'atrasado' (passou do proximo_retorno_previsto) ou 'em_dia' (demais
--    casos, incluindo pet com so 1 atendimento, sem baseline para cobrar).

create or replace view public.crm_pet_retorno
with (security_invoker = true)
as
with finalizados as (
  select
    a.pet_id,
    a.cliente_id,
    a.unidade_id,
    coalesce(a.data_fim_real::date, a.data_agendamento) as data_evento
  from public.agendamentos a
  where upper(a.status) = 'FINALIZADO'
),
finalizados_com_gap as (
  select
    pet_id,
    cliente_id,
    unidade_id,
    data_evento,
    data_evento - lag(data_evento) over (partition by pet_id order by data_evento) as gap_dias
  from finalizados
),
pet_stats as (
  select
    pet_id,
    cliente_id,
    unidade_id,
    count(*) as total_atendimentos_finalizados,
    max(data_evento) as ultimo_atendimento,
    avg(gap_dias) as intervalo_medio_dias
  from finalizados_com_gap
  group by pet_id, cliente_id, unidade_id
),
pacote_futuro as (
  select distinct mps.pet_id
  from public.marketing_pacotes_status mps
  join public.agendamentos a2 on a2.pacote_id = mps.id
  where mps.pacote_ativo
    and a2.data_agendamento >= current_date
    and upper(a2.status) not in ('FINALIZADO', 'CANCELADO')
)
select
  p.id as pet_id,
  p.cliente_id,
  p.unidade_id,
  coalesce(ps.total_atendimentos_finalizados, 0) as total_atendimentos_finalizados,
  round(ps.intervalo_medio_dias::numeric, 1) as intervalo_medio_dias,
  ps.ultimo_atendimento,
  case
    when ps.ultimo_atendimento is not null and ps.intervalo_medio_dias is not null
      then ps.ultimo_atendimento + round(ps.intervalo_medio_dias)::int
    else null
  end as proximo_retorno_previsto,
  case
    when ps.ultimo_atendimento is not null and ps.intervalo_medio_dias is not null
      and current_date > (ps.ultimo_atendimento + round(ps.intervalo_medio_dias)::int)
    then (current_date - (ps.ultimo_atendimento + round(ps.intervalo_medio_dias)::int))
    else 0
  end as dias_atraso,
  case
    when pf.pet_id is not null then 'em_dia'
    when coalesce(ps.total_atendimentos_finalizados, 0) = 0 then 'sem_historico'
    when ps.ultimo_atendimento is not null and ps.intervalo_medio_dias is not null
      and current_date > (ps.ultimo_atendimento + round(ps.intervalo_medio_dias)::int)
    then 'atrasado'
    else 'em_dia'
  end as status_retorno
from public.pets p
left join pet_stats ps on ps.pet_id = p.id
left join pacote_futuro pf on pf.pet_id = p.id
where p.ativo is distinct from false;

grant select on public.crm_pet_retorno to authenticated;
