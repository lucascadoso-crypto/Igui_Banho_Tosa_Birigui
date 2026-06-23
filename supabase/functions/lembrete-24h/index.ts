import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MessageTipo = "confirmacao" | "lembrete" | "pronto" | "manual";
type AutomaticJanela = "hoje" | "amanha";

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
    .trim()
    .toLowerCase();

  if (tipo.includes("confirmacao")) return "confirmacao";
  if (tipo.includes("aviso_pronto") || tipo.includes("pronto") || tipo.includes("concluido") || tipo.includes("finalizado")) {
    return "pronto";
  }
  if (tipo.includes("lembrete")) return "lembrete";
  if (tipo === "manual") return "manual";
  return "lembrete";
}

function normalizeToken(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeStatus(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function isCanceled(value: unknown) {
  const status = normalizeStatus(value);
  return status === "CANCELADO" || status === "CANCELADA";
}

function isAutomaticEligibleStatus(value: unknown) {
  const status = normalizeStatus(value);
  return status === "AGENDADO" || status === "PENDENTE" || status === "A REALIZAR" || status === "A_REALIZAR";
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

function getSaoPauloDate(offsetDays = 0) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function getLogTipo(
  tipo: MessageTipo,
  modo: "manual" | "automatico",
  janela?: AutomaticJanela,
  rawTipo?: unknown,
  origem?: unknown,
) {
  const token = normalizeToken(rawTipo);
  const origemToken = normalizeToken(origem);

  if (modo === "automatico") {
    if (token === "LEMBRETE_08H" || token === "LEMBRETE_18H") return token;
    return janela === "amanha" ? "LEMBRETE_18H" : "LEMBRETE_08H";
  }

  if (token === "AVISO_PRONTO_MANUAL" || token === "AVISO_PRONTO_AUTO") return token;
  if (token === "LEMBRETE_MANUAL") return token;
  if (token === "CONFIRMACAO" || token === "CONFIRMACAO_AGENDAMENTO") return "CONFIRMACAO";
  if (tipo === "pronto") return origemToken === "AUTO" ? "AVISO_PRONTO_AUTO" : "AVISO_PRONTO_MANUAL";
  if (tipo === "lembrete") return "LEMBRETE_MANUAL";
  if (tipo === "confirmacao") return "CONFIRMACAO";
  return "MANUAL";
}

function getAgendamentoParts(agendamento: any) {
  const pet = firstRelated(agendamento.pets);
  const clienteDireto = firstRelated(agendamento.clientes);
  const clienteDoPet = firstRelated(pet?.clientes);
  const cliente = clienteDireto || clienteDoPet || {};
  const pacote = firstRelated(agendamento.pacotes);

  return { pet, cliente, pacote };
}

function buildManualMessage(agendamento: any, tipo: MessageTipo) {
  const { pet, cliente, pacote } = getAgendamentoParts(agendamento);
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

  return buildAutomaticReminderMessage(agendamento, "hoje");
}

function buildAutomaticReminderMessage(agendamento: any, janela: AutomaticJanela) {
  const { pet, cliente, pacote } = getAgendamentoParts(agendamento);
  const nomeCliente = String(cliente.nome || "Cliente").trim();
  const nomePet = String(pet?.nome || "seu pet").trim();
  const horario = String(agendamento.horario_inicio || "").substring(0, 5);
  const hasTaxi = Boolean(agendamento.tem_taxi);
  const quando = janela === "amanha" ? "amanhã" : "hoje";

  const lines = [
    `Olá *${nomeCliente}*! 🐾`,
    "",
    `Passando para lembrar do banho do(a) *${nomePet}* ${quando} às *${horario}*.`,
    "",
    hasTaxi ? "🚕 Nosso motorista passará para buscar." : "🛁 Contamos com você!",
  ];

  if (agendamento.pacote_id) {
    lines.push("");
    lines.push(`✨ Sessão *${agendamento.numero_sessao || "?"}/${pacote?.qtd_sessoes || "?"}* do seu pacote.`);
  }

  return lines.join("\n");
}

function hasValidWhatsAppConfig(unidade: any) {
  return Boolean(
    unidade?.whatsapp_ativo !== false &&
    unidade?.whatsapp_url_servidor &&
    unidade?.whatsapp_nome_instancia &&
    unidade?.whatsapp_token,
  );
}

async function sendViaEvolution(unidade: any, telefone: string, mensagem: string) {
  if (!hasValidWhatsAppConfig(unidade)) {
    throw new Error("Configuracao de WhatsApp incompleta ou desativada para esta unidade.");
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

function appointmentSelect() {
  return `
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
  `;
}

async function alreadySent(supabase: any, agendamentoId: number, logTipo: string) {
  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("id")
    .eq("agendamento_id", agendamentoId)
    .eq("tipo_agendamento", logTipo)
    .eq("status", "SUCESSO")
    .limit(1);

  if (error) throw error;
  return Boolean(data && data.length > 0);
}

async function sendAndLogMessage(
  supabase: any,
  agendamento: any,
  mensagem: string,
  tipo: MessageTipo,
  logTipo: string,
  authUser: any = null,
) {
  const { pet, cliente } = getAgendamentoParts(agendamento);
  const unidade = firstRelated(agendamento.unidades);
  const telefone = cleanPhone(cliente?.telefone || cliente?.telefone_adicional);

  if (!telefone) {
    return { ok: false, ignored: true, reason: "Telefone do cliente nao cadastrado." };
  }

  if (!hasValidWhatsAppConfig(unidade)) {
    return { ok: false, ignored: true, reason: "Configuracao de WhatsApp incompleta ou desativada." };
  }

  const sendResult = await sendViaEvolution(unidade, telefone, mensagem);
  const status = sendResult.ok ? "SUCESSO" : "ERRO";
  const detalhe = compactDetail(sendResult.detalhe);

  await logWhatsapp(supabase, {
    unidade_id: Number(agendamento.unidade_id),
    cliente_id: cliente?.id ?? agendamento.cliente_id ?? null,
    pet_id: pet?.id ?? agendamento.pet_id ?? null,
    agendamento_id: agendamento.id,
    telefone,
    nome_cliente: cliente?.nome || "Cliente",
    nome_pet: pet?.nome || "Pet",
    tipo,
    tipo_agendamento: logTipo,
    mensagem,
    status,
    provider_message_id: sendResult.providerMessageId,
    detalhe_erro: sendResult.ok ? null : detalhe,
    enviado_em: sendResult.ok ? new Date().toISOString() : null,
  });

  await logAudit(supabase, {
    unidade_id: Number(agendamento.unidade_id),
    user_id: authUser?.id ?? null,
    usuario_email: authUser?.email ?? null,
    acao: tipoToAudit[tipo],
    registro_id: agendamento.id,
    descricao: `${status}: WhatsApp ${logTipo} para ${cliente?.nome || "Cliente"}${pet?.nome ? ` (Pet: ${pet.nome})` : ""}`,
    dados_depois: {
      tipo,
      agendamentoId: agendamento.id,
      telefone,
      status,
      providerStatus: sendResult.status,
      detalhe,
    },
  });

  if (!sendResult.ok) {
    return { ok: false, ignored: false, reason: detalhe || "Mensagem nao enviada.", providerStatus: sendResult.status };
  }

  return { ok: true, ignored: false, telefone, providerStatus: sendResult.status };
}

async function processAutomatic(supabase: any, janelaInput: unknown, origem: unknown, rawTipo: unknown) {
  const janela: AutomaticJanela = janelaInput === "amanha" ? "amanha" : "hoje";
  const targetDate = janela === "amanha" ? getSaoPauloDate(1) : getSaoPauloDate(0);
  const logTipo = getLogTipo("lembrete", "automatico", janela, rawTipo, origem);

  const { data: agendamentos, error } = await supabase
    .from("agendamentos")
    .select(appointmentSelect())
    .eq("data_agendamento", targetDate)
    .order("horario_inicio", { ascending: true });

  if (error) throw error;

  let enviados = 0;
  let ignorados = 0;
  let falhas = 0;

  for (const agendamento of agendamentos || []) {
    try {
      if (isCanceled(agendamento.status) || !isAutomaticEligibleStatus(agendamento.status)) {
        ignorados += 1;
        continue;
      }

      if (await alreadySent(supabase, Number(agendamento.id), logTipo)) {
        ignorados += 1;
        continue;
      }

      const mensagem = buildAutomaticReminderMessage(agendamento, janela);
      const result = await sendAndLogMessage(supabase, agendamento, mensagem, "lembrete", logTipo);

      if (result.ok) enviados += 1;
      else if (result.ignored) ignorados += 1;
      else falhas += 1;
    } catch (error) {
      falhas += 1;
      console.error("[lembrete-24h] Falha em agendamento automatico:", agendamento?.id, error);
    }
  }

  return jsonResponse({
    ok: true,
    modo: "automatico",
    janela,
    origem: origem || null,
    data: targetDate,
    enviados,
    ignorados,
    falhas,
  });
}

async function processManual(supabase: any, req: Request, body: any, agendamentoId: number | string) {
  const tipo = normalizeTipo(body?.tipo);
  const logTipo = getLogTipo(tipo, "manual", undefined, body?.tipo, body?.origem);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: authData } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
  const authUser = authData?.user || null;

  const { data: agendamento, error } = await supabase
    .from("agendamentos")
    .select(appointmentSelect())
    .eq("id", agendamentoId)
    .single();

  if (error || !agendamento) {
    throw new Error(`Agendamento ${agendamentoId} nao encontrado.`);
  }

  if (tipo === "confirmacao" && isCanceled(agendamento.status)) {
    return jsonResponse({
      ok: false,
      erro: "Confirmacao nao enviada para agendamento cancelado.",
      agendamentoId,
      tipo,
    }, 409);
  }

  const mensagem = String(body?.mensagem || "").trim() || buildManualMessage(agendamento, tipo);

  if (await alreadySent(supabase, Number(agendamento.id), logTipo)) {
    return jsonResponse({
      ok: true,
      tipo,
      agendamentoId: agendamento.id,
      mensagemEnviada: false,
      duplicado: true,
      detalhe: "Mensagem deste tipo ja enviada para este agendamento.",
    });
  }

  const result = await sendAndLogMessage(supabase, agendamento, mensagem, tipo, logTipo, authUser);

  if (!result.ok) {
    return jsonResponse({
      ok: false,
      erro: "Mensagem nao enviada",
      detalhe: result.reason,
      tipo,
      agendamentoId: agendamento.id,
      mensagemEnviada: false,
    }, result.ignored ? 400 : 502);
  }

  return jsonResponse({
    ok: true,
    tipo,
    agendamentoId: agendamento.id,
    telefone: result.telefone,
    mensagemEnviada: true,
    providerStatus: result.providerStatus,
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

  const modo = body?.modo;
  const janela = body?.janela;
  const agendamentoId = body?.agendamentoId || body?.agendamento_id || body?.id || null;

  try {
    if (modo === "automatico") {
      return await processAutomatic(supabase, janela, body?.origem, body?.tipo);
    }

    if (agendamentoId) {
      return await processManual(supabase, req, body, agendamentoId);
    }

    return jsonResponse({
      ok: false,
      erro: "Mensagem automatica nao processada",
      detalhe: "Payload invalido: informe modo automatico ou agendamentoId.",
    }, 400);
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    console.error("[lembrete-24h] Falha no envio:", detalhe);

    return jsonResponse({
      ok: false,
      erro: "Mensagem automatica nao processada",
      detalhe,
      modo: modo || null,
      janela: janela || null,
      agendamentoId: agendamentoId ?? null,
      mensagemEnviada: false,
    }, 400);
  }
});
