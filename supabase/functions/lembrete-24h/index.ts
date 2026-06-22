import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MessageTipo = "confirmacao" | "lembrete" | "pronto" | "manual";
type MessageOrigem = "auto" | "manual";

const tipoToLog: Record<MessageTipo, string> = {
  confirmacao: "CONFIRMACAO",
  lembrete: "LEMBRETE_MANUAL",
  pronto: "PRONTO",
  manual: "MANUAL",
};

const tipoToAudit: Record<MessageTipo, string> = {
  confirmacao: "WHATSAPP_CONFIRMACAO_AGENDAMENTO",
  lembrete: "WHATSAPP_LEMBRETE_MANUAL",
  pronto: "WHATSAPP_AVISO_FINALIZADO",
  manual: "WHATSAPP_MANUAL",
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeTipo(value: unknown): MessageTipo {
  const tipo = String(value || "lembrete")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (tipo === "confirmacao" || tipo === "confirmacao_agendamento") return "confirmacao";
  if (tipo === "pronto" || tipo === "concluido" || tipo === "finalizado") return "pronto";
  if (tipo === "manual") return "manual";
  return "lembrete";
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function cleanPhone(value: unknown) {
  const phone = String(value || "").replace(/\D/g, "");
  if (!phone) return "";
  return phone.startsWith("55") ? phone : `55${phone}`;
}

function compactDetail(value: unknown) {
  if (!value) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
}

function formatDateBR(dateValue: unknown) {
  const raw = String(dateValue || "");
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildMessage(agendamento: any, tipo: MessageTipo) {
  const pet = firstRelated(agendamento.pets);
  const clienteDireto = firstRelated(agendamento.clientes);
  const clienteDoPet = firstRelated(pet?.clientes);
  const cliente = clienteDireto || clienteDoPet || {};
  const pacote = firstRelated(agendamento.pacotes);
  const nomeCliente = String(cliente.nome || "Cliente").trim();
  const nomePet = String(pet?.nome || "seu pet").trim();
  const dataFormatada = formatDateBR(agendamento.data_agendamento);
  const horario = String(agendamento.horario_inicio || "").substring(0, 5);
  const hasTaxi = Boolean(agendamento.tem_taxi);

  if (tipo === "confirmacao") {
    const lines = [
      `Olá *${nomeCliente}*! 🐾`,
      "",
      `Seu atendimento para *${nomePet}* foi agendado para *${dataFormatada} às ${horario}*.`,
      hasTaxi
        ? `🚕 Nosso motorista passará para buscar o(a) ${nomePet}.`
        : "🛁 Aguardamos você no horário combinado.",
    ];

    if (agendamento.pacote_id) {
      lines.push(`✨ Sessão *${agendamento.numero_sessao || "?"}/${pacote?.qtd_sessoes || "?"}* do seu pacote.`);
    }

    return lines.join("\n");
  }

  if (tipo === "pronto") {
    return [
      `Olá *${nomeCliente}*! 🐾`,
      "",
      `O(A) *${nomePet}* já terminou o banho e está cheirosinho(a)!`,
      "",
      hasTaxi
        ? "🚕 Nosso motorista fará a entrega com segurança."
        : "🛁 Já pode vir buscá-lo(a)!",
    ].join("\n");
  }

  return [
    `Olá *${nomeCliente}*! 🐾`,
    "",
    `Passando para lembrar do banho do(a) *${nomePet}* em *${dataFormatada} às ${horario}*.`,
    hasTaxi ? "🚕 Nosso motorista passará para buscar." : "🛁 Contamos com você!",
  ].join("\n");
}

async function sendViaEvolution(unidade: any, telefone: string, mensagem: string) {
  if (!unidade?.whatsapp_url_servidor || !unidade?.whatsapp_nome_instancia || !unidade?.whatsapp_token) {
    throw new Error("Configuracao de WhatsApp incompleta para esta unidade.");
  }

  if (unidade.whatsapp_ativo === false) {
    throw new Error("WhatsApp desativado para esta unidade.");
  }

  const baseUrl = String(unidade.whatsapp_url_servidor).trim().replace(/\/$/, "");
  const instanceName = String(unidade.whatsapp_nome_instancia).trim();
  const url = `${baseUrl}/message/sendText/${instanceName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: unidade.whatsapp_token,
    },
    body: JSON.stringify({
      number: telefone,
      text: mensagem,
      delay: 1200,
      linkPreview: true,
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    detalhe: parsed || text || response.statusText,
    providerMessageId: parsed?.key?.id || parsed?.messageId || parsed?.id || null,
  };
}

async function logWhatsapp(supabase: any, payload: Record<string, unknown>) {
  await supabase.from("whatsapp_mensagens").insert({
    ...payload,
    criado_em: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

async function logAudit(supabase: any, payload: Record<string, unknown>) {
  await supabase.from("auditoria_logs").insert({
    ...payload,
    tabela: "whatsapp_mensagens",
    criado_em: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const tipo = normalizeTipo(body?.tipo);
  const origem: MessageOrigem = body?.origem === "auto" ? "auto" : "manual";
  const agendamentoId = body?.agendamentoId ?? body?.agendamento_id ?? body?.id ?? null;
  const logTipo = tipoToLog[tipo];

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: authData } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    const authUser = authData?.user || null;

    let agendamento: any = null;
    let unidade: any = null;
    let cliente: any = null;
    let pet: any = null;
    let telefone = cleanPhone(body?.telefone);
    let mensagem = String(body?.mensagem || "").trim();
    let unidadeId = body?.unidadeId ?? body?.unidade_id ?? null;

    if (agendamentoId) {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(`
          id,
          unidade_id,
          cliente_id,
          pet_id,
          pacote_id,
          numero_sessao,
          data_agendamento,
          horario_inicio,
          status,
          tem_taxi,
          lembrete_enviado,
          pacotes ( id, qtd_sessoes ),
          pets (
            id,
            nome,
            clientes ( id, nome, telefone, telefone_adicional )
          ),
          clientes:clientes!agendamentos_cliente_id_fkey (
            id,
            nome,
            telefone,
            telefone_adicional
          ),
          unidades (
            id,
            nome,
            whatsapp_url_servidor,
            whatsapp_nome_instancia,
            whatsapp_token,
            whatsapp_ativo
          )
        `)
        .eq("id", agendamentoId)
        .single();

      if (error || !data) {
        throw new Error(`Agendamento ${agendamentoId} nao encontrado.`);
      }

      agendamento = data;
      unidade = firstRelated(agendamento.unidades);
      pet = firstRelated(agendamento.pets);
      cliente = firstRelated(agendamento.clientes) || firstRelated(pet?.clientes);
      unidadeId = agendamento.unidade_id;
      telefone = cleanPhone(cliente?.telefone || cliente?.telefone_adicional || telefone);

      if (tipo !== "manual" || !mensagem) {
        mensagem = buildMessage(agendamento, tipo);
      }

      if (tipo === "confirmacao") {
        const normalizedStatus = String(agendamento.status || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase();
        if (normalizedStatus === "CANCELADO" || normalizedStatus === "CANCELADA") {
          return jsonResponse({
            ok: false,
            erro: "Confirmacao nao enviada para agendamento cancelado.",
            agendamentoId,
            tipo,
          }, 409);
        }
      }

      if (origem === "auto" && (tipo === "confirmacao" || tipo === "pronto")) {
        const { data: existing, error: existingError } = await supabase
          .from("whatsapp_mensagens")
          .select("id")
          .eq("agendamento_id", agendamento.id)
          .eq("tipo_agendamento", logTipo)
          .eq("status", "SUCESSO")
          .limit(1);

        if (existingError) throw existingError;
        if (existing && existing.length > 0) {
          return jsonResponse({
            ok: true,
            tipo,
            agendamentoId,
            telefone,
            mensagemEnviada: false,
            duplicado: true,
            detalhe: "Mensagem automatica ja enviada para este agendamento.",
          });
        }
      }
    } else {
      if (!unidadeId) throw new Error("unidadeId e obrigatorio para envio manual sem agendamento.");
      if (!telefone) throw new Error("Telefone do cliente nao informado.");
      if (!mensagem) throw new Error("Mensagem de WhatsApp nao informada.");

      const { data, error } = await supabase
        .from("unidades")
        .select("id, nome, whatsapp_url_servidor, whatsapp_nome_instancia, whatsapp_token, whatsapp_ativo")
        .eq("id", unidadeId)
        .single();

      if (error || !data) throw new Error("Unidade nao encontrada para envio.");
      unidade = data;
    }

    if (!telefone) throw new Error("Telefone do cliente nao cadastrado.");
    if (!unidade) throw new Error("Configuracao da unidade nao encontrada.");

    const sendResult = await sendViaEvolution(unidade, telefone, mensagem);
    const status = sendResult.ok ? "SUCESSO" : "ERRO";
    const detalhe = compactDetail(sendResult.detalhe);

    await logWhatsapp(supabase, {
      unidade_id: Number(unidadeId),
      cliente_id: cliente?.id ?? agendamento?.cliente_id ?? null,
      pet_id: pet?.id ?? agendamento?.pet_id ?? null,
      agendamento_id: agendamento?.id ?? null,
      telefone,
      nome_cliente: cliente?.nome || "Manual",
      nome_pet: pet?.nome || "Manual",
      tipo,
      tipo_agendamento: logTipo,
      mensagem,
      status,
      provider_message_id: sendResult.providerMessageId,
      detalhe_erro: sendResult.ok ? null : detalhe,
      enviado_em: sendResult.ok ? new Date().toISOString() : null,
    });

    await logAudit(supabase, {
      unidade_id: Number(unidadeId),
      user_id: authUser?.id ?? null,
      usuario_email: authUser?.email ?? null,
      acao: tipoToAudit[tipo],
      registro_id: agendamento?.id ?? null,
      descricao: `${status}: WhatsApp ${logTipo} para ${cliente?.nome || "Manual"}${pet?.nome ? ` (Pet: ${pet.nome})` : ""}`,
      dados_depois: {
        tipo,
        origem,
        agendamentoId: agendamento?.id ?? null,
        telefone,
        status,
        providerStatus: sendResult.status,
        detalhe,
      },
    });

    if (!sendResult.ok) {
      return jsonResponse({
        ok: false,
        erro: "Mensagem nao enviada",
        detalhe,
        tipo,
        agendamentoId: agendamento?.id ?? agendamentoId ?? null,
        telefone,
        mensagemEnviada: false,
      }, 502);
    }

    return jsonResponse({
      ok: true,
      tipo,
      agendamentoId: agendamento?.id ?? agendamentoId ?? null,
      telefone,
      mensagemEnviada: true,
      providerStatus: sendResult.status,
    });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    console.error("[lembrete-24h] Falha no envio:", detalhe);

    try {
      const unidadeId = body?.unidadeId ?? body?.unidade_id ?? null;
      if (unidadeId) {
        await logWhatsapp(supabase, {
          unidade_id: Number(unidadeId),
          agendamento_id: agendamentoId ? Number(agendamentoId) : null,
          telefone: cleanPhone(body?.telefone) || null,
          nome_cliente: "Manual",
          nome_pet: "Manual",
          tipo,
          tipo_agendamento: logTipo,
          mensagem: body?.mensagem || null,
          status: "ERRO",
          detalhe_erro: detalhe,
        });
      }
    } catch (logError) {
      console.error("[lembrete-24h] Falha ao registrar erro:", logError);
    }

    return jsonResponse({
      ok: false,
      erro: "Nao foi possivel enviar a mensagem.",
      detalhe,
      tipo,
      agendamentoId: agendamentoId ?? null,
      mensagemEnviada: false,
    }, 400);
  }
});
