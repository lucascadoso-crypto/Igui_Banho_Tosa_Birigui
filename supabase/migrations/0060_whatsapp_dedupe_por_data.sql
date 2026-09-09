-- BUG: alreadySent() em supabase/functions/lembrete-24h/index.ts decide se
-- ja mandou um lembrete/confirmacao olhando so agendamento_id + tipo de
-- mensagem (LEMBRETE_08H, LEMBRETE_18H, CONFIRMACAO, AVISO_PRONTO_*) - nunca
-- compara a DATA a que aquele aviso se referia.
--
-- Isso quebra o caso de remarcar uma sessao pra outro dia: se aquele
-- agendamento_id ja recebeu, por exemplo, um LEMBRETE_18H em algum momento
-- (pra data antiga), o sistema entende "esse agendamento ja foi avisado" e
-- nunca manda de novo o lembrete automatico das 8h/18h - mesmo a sessao
-- agora sendo em outro dia, que nunca recebeu aviso nenhum. Foi exatamente
-- o caso relatado: sessao da Amora (pacote) remarcada de ontem pra amanha,
-- lembrete automatico nunca saiu porque o mesmo agendamento_id ja tinha um
-- LEMBRETE_18H "SUCESSO" registrado de antes da remarcacao.
--
-- Fix: guarda a data a que cada mensagem se referia (data_referencia) e o
-- codigo da Edge Function passa a comparar tambem essa data na deduplicacao
-- - uma nota fiscal (mensagem) de uma data antiga nao bloqueia mais o aviso
-- da nova data.

alter table public.whatsapp_mensagens
  add column if not exists data_referencia date;

comment on column public.whatsapp_mensagens.data_referencia is
  'Data do agendamento (agendamentos.data_agendamento) no momento do envio - usada pela Edge Function lembrete-24h para nao confundir avisos de datas diferentes do mesmo agendamento_id ao checar duplicidade (ex.: sessao remarcada).';

-- Backfill best-effort: preenche com a data atual do agendamento vinculado,
-- para mensagens antigas que ainda nao tinham essa coluna. Onde o
-- agendamento nao existe mais (ou nunca teve vinculo), fica null - a
-- deduplicacao so olha para mensagens que tenham data_referencia = data
-- atual do agendamento, entao null nunca vai "falso-positivar" um bloqueio.
update public.whatsapp_mensagens wm
set data_referencia = a.data_agendamento
from public.agendamentos a
where wm.agendamento_id = a.id
  and wm.data_referencia is null;
