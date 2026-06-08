import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json().catch(() => ({}));
    const { agendamento_id, telefone, mensagem, unidade_id, tipo } = body;
    const isCron = body?.name === 'cron-trigger' || (!agendamento_id && !telefone);

    console.log(`[Robô WhatsApp] Iniciando processamento. Tipo de solicitação: ${isCron ? 'CRON/BATCH' : 'INDIVIDUAL'}`);

    // Helper para envio via Evolution API
    const sendViaEvolution = async (unidade: any, telefoneDestino: string, texto: string) => {
      if (!unidade?.whatsapp_url_servidor || !unidade?.whatsapp_nome_instancia || !unidade?.whatsapp_token) {
        throw new Error('Configuração da Evolution API pendente para esta unidade.');
      }

      if (unidade.whatsapp_ativo === false) {
        return { ok: false, status: 'skipped', detail: 'WhatsApp desativado para esta unidade.' };
      }

      let baseUrl = unidade.whatsapp_url_servidor.trim();
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1);
      
      const instancia = unidade.whatsapp_nome_instancia.trim();
      const finalUrl = `${baseUrl}/message/sendText/${instancia}`;

      const telLimpo = telefoneDestino.replace(/\D/g, '');
      const numeroTratado = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;

      const payload = {
        number: numeroTratado,
        text: texto,
        delay: 1200,
        linkPreview: true
      };

      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': unidade.whatsapp_token
        },
        body: JSON.stringify(payload)
      });

      const responseOk = response.ok;
      const responseText = responseOk ? 'Sucesso' : await response.text();

      return { ok: responseOk, detail: responseText, telefone: numeroTratado };
    };

    if (!isCron) {
      // --- FLUXO INDIVIDUAL (Manual ou Específico) ---
      let targetPhone = telefone;
      let targetMessage = mensagem;
      let targetUnitId = unidade_id;
      let targetAgendamento: any = null;

      if (agendamento_id) {
        // Busca dados do agendamento específico
        const { data: appt, error: apptError } = await supabase
          .from('agendamentos')
          .select(`
            id, data_agendamento, horario_inicio, tem_taxi, pacote_id, numero_sessao, unidade_id,
            pets ( nome, clientes ( nome, telefone ) ),
            unidades ( nome, whatsapp_nome_instancia, whatsapp_token, whatsapp_url_servidor, whatsapp_ativo )
          `)
          .eq('id', agendamento_id)
          .single();

        if (apptError || !appt) throw new Error(`Agendamento ${agendamento_id} não encontrado.`);
        targetAgendamento = appt;
        targetUnitId = appt.unidade_id;
        
        if (!targetPhone) targetPhone = appt.pets?.clientes?.telefone;
        
        if (!targetMessage) {
          // Lógica de mensagem padrão baseada no tipo ou status se não for passado mensagem manual
          const nomePet = appt.pets?.nome;
          const hora = String(appt.horario_inicio || '').substring(0, 5);
          targetMessage = `Olá! Passando para confirmar o agendamento do(a) *${nomePet}* hoje às *${hora}*. 🐾`;
        }
      }

      // Busca dados da unidade se não tivermos
      const { data: unidadData, error: unitErr } = await supabase
        .from('unidades')
        .select('*')
        .eq('id', targetUnitId)
        .single();

      if (unitErr || !unidadData) throw new Error('Unidade não encontrada para envio.');

      const result = await sendViaEvolution(unidadData, targetPhone, targetMessage);

      // Log de Auditoria
      await supabase.from('whatsapp_mensagens').insert([{
        status: result.ok ? 'SUCESSO' : 'ERRO',
        nome_cliente: targetAgendamento?.pets?.clientes?.nome || 'Manual',
        nome_pet: targetAgendamento?.pets?.nome || 'Manual',
        telefone: result.telefone || targetPhone,
        unidade_id: targetUnitId,
        detalhe_erro: result.ok ? null : result.detail,
        tipo_agendamento: tipo || 'INDIVIDUAL',
        criado_em: new Date().toISOString()
      }]);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.ok ? 200 : 400
      });

    } else {
      // --- FLUXO CRON (BATCH REMINDERS) ---
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const tomorrowStr = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(tomorrow);

      const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(tomorrow);

      const { data: agendamentos, error: fetchError } = await supabase
        .from('agendamentos')
        .select(`
          id, data_agendamento, horario_inicio, tem_taxi, pacote_id, numero_sessao, lembrete_enviado, unidade_id, status,
          pacotes ( qtd_sessoes ),
          pets ( nome, clientes ( nome, telefone ) ),
          unidades ( nome, whatsapp_nome_instancia, whatsapp_token, whatsapp_url_servidor, whatsapp_ativo )
        `)
        .eq('data_agendamento', tomorrowStr)
        .or('lembrete_enviado.eq.false,lembrete_enviado.is.null')
        .eq('status', 'Agendado');

      if (fetchError) throw fetchError;

      if (!agendamentos || agendamentos.length === 0) {
        return new Response(JSON.stringify({ message: 'Nenhum lembrete pendente para amanhã.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }

      const summary = [];
      for (const appt of agendamentos) {
        try {
          const cliente = appt.pets?.clientes;
          const unidade = Array.isArray(appt.unidades) ? appt.unidades[0] : appt.unidades;
          
          let msg = '';
          const hora = String(appt.horario_inicio || '').substring(0, 5);
          if (appt.pacote_id) {
            msg = `Olá *${cliente.nome}*! 🐾 Passando para lembrar que amanhã às *${hora}* é dia de banho do(a) *${appt.pets.nome}* (Pacote). Estamos esperando! ✨`;
          } else {
            msg = `Olá *${cliente.nome}*! 🐾 Passando para lembrar do banho do(a) *${appt.pets.nome}* amanhã às ${hora}. Confirmado? 🛁🐶`;
          }

          const res = await sendViaEvolution(unidade, cliente.telefone, msg);
          
          await supabase.from('whatsapp_mensagens').insert([{
            status: res.ok ? 'SUCESSO' : 'ERRO',
            nome_cliente: cliente.nome,
            nome_pet: appt.pets.nome,
            telefone: res.telefone,
            unidade_id: appt.unidade_id,
            detalhe_erro: res.ok ? null : res.detail,
            tipo_agendamento: 'LEMBRETE_AUTO',
            criado_em: new Date().toISOString()
          }]);

          if (res.ok) {
            await supabase.from('agendamentos').update({ lembrete_enviado: true }).eq('id', appt.id);
          }
          summary.push({ id: appt.id, status: res.ok ? 'sent' : 'failed' });
        } catch (e) {
          summary.push({ id: appt.id, status: 'error', error: e.message });
        }
      }

      return new Response(JSON.stringify({ processed: summary.length, results: summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

  } catch (error) {
    console.error('[CRITICAL] Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
