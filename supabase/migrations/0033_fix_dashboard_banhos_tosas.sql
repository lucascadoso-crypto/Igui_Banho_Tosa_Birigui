-- FIX: contadores de Banhos/Tosas do Dashboard Gerencial zerados quando
-- "data_fim_real" esta nula em atendimentos ja finalizados.
--
-- Bug observado: com um periodo/filtro em que ha faturamento (fn_receita_eventos
-- so exige a.pago = true), fn_dashboard_kpis retornava banhos_atual/tosas_atual
-- = 0 porque a contagem original exigia
--   a.status = 'Finalizado' AND a.data_fim_real IS NOT NULL
-- Quando um atendimento finalizado tem data_fim_real nula (dado legado, ou
-- finalizado por um caminho que nao passou por performFinalizeAppointment em
-- components/Appointments.tsx), ele e contado como receita mas excluido da
-- contagem de banhos/tosas.
--
-- Fix: usar coalesce(data de finalizacao convertida, data_agendamento) em vez
-- de exigir data_fim_real IS NOT NULL — mesmo fallback ja usado em
-- ClientDetailsModal.tsx e Pacotes.tsx para o mesmo problema de dado legado.
-- Migration aditiva (create or replace), sem alterar dados nem tabelas.

create or replace function public.fn_dashboard_kpis(
  p_unidade_id bigint,
  p_data_inicio date,
  p_data_fim date,
  p_data_inicio_ant date,
  p_data_fim_ant date,
  p_transporte text default 'todos'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_fat_atual numeric;
  v_fat_ant numeric;
  v_banhos_atual bigint;
  v_banhos_ant bigint;
  v_tosas_atual bigint;
  v_tosas_ant bigint;
  v_pacotes_ativos_atual bigint;
  v_pacotes_ativos_ant bigint;
  v_novos_clientes_atual bigint;
  v_novos_clientes_ant bigint;
begin
  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_fat_atual
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio, p_data_fim, p_transporte);

  select coalesce(sum(valor_servico + valor_transporte), 0)
    into v_fat_ant
  from public.fn_receita_eventos(p_unidade_id, p_data_inicio_ant, p_data_fim_ant, p_transporte);

  -- Banhos/Tosas realizados: pela data de finalizacao (data_fim_real,
  -- convertida para America/Sao_Paulo). Quando data_fim_real e nula num
  -- atendimento ja Finalizado, usa data_agendamento como fallback (ambas ja
  -- sao datas de calendario, sem necessidade de conversao adicional).
  select
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'banho'),
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'tosa')
  into v_banhos_atual, v_tosas_atual
  from public.agendamentos a
  where a.status = 'Finalizado'
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and coalesce((a.data_fim_real at time zone 'America/Sao_Paulo')::date, a.data_agendamento) between p_data_inicio and p_data_fim;

  select
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'banho'),
    count(*) filter (where public.fn_categoria_agendamento(a.id) = 'tosa')
  into v_banhos_ant, v_tosas_ant
  from public.agendamentos a
  where a.status = 'Finalizado'
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (p_transporte = 'todos' or (p_transporte = 'com' and a.tem_taxi = true) or (p_transporte = 'sem' and a.tem_taxi = false))
    and coalesce((a.data_fim_real at time zone 'America/Sao_Paulo')::date, a.data_agendamento) between p_data_inicio_ant and p_data_fim_ant;

  -- Pacotes ativos: status atual (nao ha historico por data), com proxy de
  -- "existia ate o fim do periodo" via created_at. Mesma definicao de "Ativo"
  -- usada em components/Pacotes.tsx (nao cancelado/finalizado e com sessoes
  -- restantes), nao o texto cru de pacotes.status.
  select count(*)
    into v_pacotes_ativos_atual
  from public.pacotes p
  where (p_unidade_id is null or p.unidade_id = p_unidade_id)
    and p.status not ilike '%cancel%'
    and ((p.created_at at time zone 'America/Sao_Paulo')::date) <= p_data_fim
    and (p_transporte = 'todos'
      or (p_transporte = 'com' and coalesce(p.valor_transporte, 0) > 0)
      or (p_transporte = 'sem' and coalesce(p.valor_transporte, 0) = 0))
    and coalesce(p.qtd_sessoes, 0) > (
      select count(*) from public.agendamentos ag
      where ag.pacote_id = p.id and ag.status = 'Finalizado'
    );

  select count(*)
    into v_pacotes_ativos_ant
  from public.pacotes p
  where (p_unidade_id is null or p.unidade_id = p_unidade_id)
    and p.status not ilike '%cancel%'
    and ((p.created_at at time zone 'America/Sao_Paulo')::date) <= p_data_fim_ant
    and (p_transporte = 'todos'
      or (p_transporte = 'com' and coalesce(p.valor_transporte, 0) > 0)
      or (p_transporte = 'sem' and coalesce(p.valor_transporte, 0) = 0))
    and coalesce(p.qtd_sessoes, 0) > (
      select count(*) from public.agendamentos ag
      where ag.pacote_id = p.id and ag.status = 'Finalizado'
    );

  -- Novos clientes: filtro de transporte nao se aplica (cliente nao "tem taxi").
  select count(*)
    into v_novos_clientes_atual
  from public.clientes c
  where (p_unidade_id is null or c.unidade_id = p_unidade_id)
    and ((c.created_at at time zone 'America/Sao_Paulo')::date) between p_data_inicio and p_data_fim;

  select count(*)
    into v_novos_clientes_ant
  from public.clientes c
  where (p_unidade_id is null or c.unidade_id = p_unidade_id)
    and ((c.created_at at time zone 'America/Sao_Paulo')::date) between p_data_inicio_ant and p_data_fim_ant;

  return jsonb_build_object(
    'faturamento_atual', v_fat_atual,
    'faturamento_anterior', v_fat_ant,
    'banhos_atual', v_banhos_atual,
    'banhos_anterior', v_banhos_ant,
    'tosas_atual', v_tosas_atual,
    'tosas_anterior', v_tosas_ant,
    'pacotes_ativos_atual', v_pacotes_ativos_atual,
    'pacotes_ativos_anterior', v_pacotes_ativos_ant,
    'novos_clientes_atual', v_novos_clientes_atual,
    'novos_clientes_anterior', v_novos_clientes_ant
  );
end;
$$;
