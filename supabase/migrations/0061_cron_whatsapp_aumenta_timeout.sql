-- BUG: os dois cron jobs (whatsapp-lembrete-08h-hoje, whatsapp-lembrete-18h-
-- amanha) chamam net.http_post() sem informar timeout_milliseconds, que por
-- padrao no pg_net e 5000ms (5 segundos). A Edge Function lembrete-24h
-- processa TODOS os agendamentos do dia em sequencia (um por um, cada um
-- com uma chamada de rede real pro WhatsApp + escritas no banco) - qualquer
-- dia com mais de uns 3-5 agendamentos facilmente estoura 5s antes de
-- terminar. Quando o pg_net desiste de esperar, a chamada e registrada como
-- timeout em net._http_response (confirmado: "Timeout of 5000 ms reached"),
-- e quem esta mais pra frente na fila (ordenado por horario_inicio) nunca
-- recebe lembrete nenhum, sem erro registrado em whatsapp_mensagens porque
-- a execucao nunca chega a processar aquele agendamento.
--
-- Fix imediato: aumenta o timeout pra 2 minutos (120000ms), dando bastante
-- folga pra fila de um dia cheio terminar de processar. Nao resolve o
-- problema de raiz (a Edge Function ainda roda tudo em sequencia, sincrono,
-- preso a duracao do timeout de quem chamou) - isso e corrigido a parte, na
-- proxima migration/deploy da function usando EdgeRuntime.waitUntil() pra
-- nao depender de timeout nenhum.

select cron.alter_job(
  job_id := 2,
  command := $cmd$
  select net.http_post(
    url := 'https://ihhylytyompvdhkphgud.supabase.co/functions/v1/lembrete-24h',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pet_whatsapp_cron_anon_key'
        limit 1
      ),
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pet_whatsapp_cron_anon_key'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'modo', 'automatico',
      'janela', 'hoje',
      'tipo', 'LEMBRETE_08H',
      'origem', 'cron_08h'
    ),
    timeout_milliseconds := 120000
  );
  $cmd$
);

select cron.alter_job(
  job_id := 3,
  command := $cmd$
  select net.http_post(
    url := 'https://ihhylytyompvdhkphgud.supabase.co/functions/v1/lembrete-24h',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pet_whatsapp_cron_anon_key'
        limit 1
      ),
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pet_whatsapp_cron_anon_key'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'modo', 'automatico',
      'janela', 'amanha',
      'tipo', 'LEMBRETE_18H',
      'origem', 'cron_18h'
    ),
    timeout_milliseconds := 120000
  );
  $cmd$
);
