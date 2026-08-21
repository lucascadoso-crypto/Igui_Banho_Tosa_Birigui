-- Marketing & Fidelizacao: "Inativos" passa a ser "Inativo Avulso" (a pedido
-- do usuario). Substitui public.marketing_segmentos_clientes de
-- 0053_marketing_criterios_vip_pagam_em_dia.sql; nenhuma tabela e alterada.
--
-- Objetivo: separar quem nunca teve vinculo de pacote (avulso puro) de quem
-- ja teve pacote e nao renovou (esse segundo caso ja e coberto por
-- seg_nao_renovaram, que so inclui quem teve pelo menos 1 pacote). Isso
-- permite campanhas diferentes: mais agressiva/oferta de pacote para quem
-- nunca fechou um, x renovacao para quem ja foi cliente de pacote.
--
-- Nova regra de seg_inativos ("Inativo Avulso"): nunca fechou pacote
-- (total_pacotes = 0) E ja teve pelo menos 1 servico avulso concluido
-- (avulsos_finalizados >= 1, senao seria so um lead que nunca comprou nada)
-- E sem banho finalizado ha mais de 60 dias. O nome da coluna
-- (seg_inativos) fica igual ao de 0052/0053 para nao mudar a posicao da
-- coluna na view -- so a formula muda.

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
  -- "Inativo Avulso": nunca fechou pacote, ja teve pelo menos 1 servico
  -- avulso concluido, e sem banho finalizado ha mais de 60 dias.
  (
    m.total_pacotes = 0
    and m.avulsos_finalizados >= 1
    and m.dias_desde_ultimo_finalizado > 60
  ) as seg_inativos,
  m.pacotes_concluidos,
  m.pagamentos_sempre_no_prazo
from public.marketing_cliente_metricas m;

grant select on public.marketing_segmentos_clientes to authenticated;
