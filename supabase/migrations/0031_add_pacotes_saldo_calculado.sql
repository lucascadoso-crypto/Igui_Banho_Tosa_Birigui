-- Corrige erro "column 'saldo_calculado' of relation 'pacotes' does not exist".
--
-- Causa raiz: as funcoes fn_init_package_balance() (trigger BEFORE INSERT ON pacotes)
-- e fn_sync_package_balance_on_appointment() (trigger AFTER UPDATE ON agendamentos)
-- ja existiam no banco e escrevem em pacotes.saldo_calculado, mas a coluna nunca
-- foi criada por nenhuma migration versionada (drift de schema).
--
-- Esta migration apenas adiciona a coluna que falta e faz o backfill dos pacotes
-- existentes com o mesmo calculo usado pelo trigger, para nao deixar dados
-- inconsistentes em pacotes que ja tinham sessoes concluidas antes da correcao.

alter table public.pacotes
  add column if not exists saldo_calculado integer;

comment on column public.pacotes.saldo_calculado is
  'Sessoes restantes do pacote (qtd_sessoes - sessoes concluidas). Mantido por fn_init_package_balance() e fn_sync_package_balance_on_appointment().';

with sessoes_concluidas as (
  select pacote_id, count(*) as concluidas
  from public.agendamentos
  where pacote_id is not null
    and status in ('Finalizado', 'Concluido', 'finalizado')
  group by pacote_id
)
update public.pacotes p
set saldo_calculado = greatest(0, p.qtd_sessoes - coalesce(sc.concluidas, 0))
from sessoes_concluidas sc
where sc.pacote_id = p.id
  and p.saldo_calculado is distinct from greatest(0, p.qtd_sessoes - coalesce(sc.concluidas, 0));

-- Pacotes sem nenhuma sessao concluida ainda (nao cobertos pelo join acima)
update public.pacotes
set saldo_calculado = qtd_sessoes
where saldo_calculado is null;
