import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Turno = "manha" | "tarde";
const MAX_GOOGLE_INTERMEDIATES = 25;

const cleanPart = (value: unknown) => String(value || "").trim();

const parseAppointmentTime = (value: unknown) => {
  const raw = cleanPart(value);
  const match = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return {
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    minutes: hours * 60 + minutes,
    turno: hours * 60 + minutes < 12 * 60 ? "manha" as Turno : "tarde" as Turno,
  };
};

const normalizeStatus = (status: unknown) =>
  String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const normalizeAddressKey = (address: string) =>
  address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim()
    .toLowerCase();

const buildClientAddress = (client: any, directAddress?: unknown) => {
  const direct = cleanPart(directAddress || client?.endereco_completo);
  if (direct.length >= 10) return direct;

  const street = cleanPart(client?.logradouro || client?.endereco);
  const number = cleanPart(client?.numero);
  const complement = cleanPart(client?.complemento);
  const neighborhood = cleanPart(client?.bairro);
  const city = cleanPart(client?.cidade);
  const state = cleanPart(client?.estado || client?.uf);
  const cep = cleanPart(client?.cep);

  if (!street || !number || !neighborhood || !city || !state) return "";

  return [
    `${street}, ${number}`,
    complement,
    neighborhood,
    city,
    state,
    cep,
  ].filter(Boolean).join(", ");
};

const buildMapsUrl = (origin: string, destination: string, waypoints: string[]) => {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const splitRouteSegments = (unitAddress: string, orderedStops: any[]) => {
  const maxStopsPerSegment = 8;
  const addresses = orderedStops.map((stop) => stop.endereco);

  if (addresses.length <= maxStopsPerSegment) {
    return [{
      titulo: "Rota completa",
      origem: unitAddress,
      destino: unitAddress,
      paradas: addresses,
      mapsUrl: buildMapsUrl(unitAddress, unitAddress, addresses),
    }];
  }

  const segments: any[] = [];
  let origin = unitAddress;
  for (let start = 0; start < addresses.length; start += maxStopsPerSegment) {
    const chunk = addresses.slice(start, start + maxStopsPerSegment);
    const isLast = start + maxStopsPerSegment >= addresses.length;
    const destination = isLast ? unitAddress : chunk[chunk.length - 1];
    const waypoints = isLast ? chunk : chunk.slice(0, -1);

    segments.push({
      titulo: `Trecho ${segments.length + 1}`,
      origem: origin,
      destino: destination,
      paradas: chunk,
      mapsUrl: buildMapsUrl(origin, destination, waypoints),
    });

    origin = destination;
  }

  return segments;
};

const optimizeStopBatch = async (googleKey: string, unitAddress: string, stops: any[]) => {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
    },
    body: JSON.stringify({
      origin: { address: unitAddress },
      destination: { address: unitAddress },
      intermediates: stops.map((stop) => ({ address: stop.endereco })),
      travelMode: "DRIVE",
      optimizeWaypointOrder: true,
    }),
  });

  const routesData = await response.json();
  if (!response.ok) {
    throw new Error(routesData?.error?.message || "Falha ao calcular rota otimizada.");
  }

  const route = routesData?.routes?.[0] || {};
  const order = Array.isArray(route.optimizedIntermediateWaypointIndex)
    ? route.optimizedIntermediateWaypointIndex
    : stops.map((_, index) => index);

  return {
    orderedStops: order.map((index: number) => stops[index]).filter(Boolean),
    distanceMeters: Number(route.distanceMeters || 0) || 0,
    durationSeconds: Number(String(route.duration || "0s").replace("s", "")) || 0,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const googleKey = Deno.env.get("GOOGLE_MAPS_ROUTES_API_KEY");
    const { unidadeId, data, turno } = await req.json() as {
      unidadeId?: number | string;
      data?: string;
      turno?: Turno;
    };

    if (!unidadeId || !data || !["manha", "tarde"].includes(String(turno))) {
      throw new Error("Informe unidadeId, data e turno para gerar a rota.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: authData } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    const authUser = authData?.user;
    if (!authUser?.id) throw new Error("Sessao invalida para gerar rota.");

    const { data: funcionarios, error: funcionarioError } = await supabase
      .from("funcionarios")
      .select("id, unidade_id, cargo, ativo")
      .eq("user_id", authUser.id)
      .eq("ativo", true);

    if (funcionarioError) throw funcionarioError;
    const canAccessUnit = (funcionarios || []).some((funcionario: any) =>
      funcionario.cargo === "master" || String(funcionario.unidade_id) === String(unidadeId)
    );

    if (!canAccessUnit) throw new Error("Usuario sem permissao para gerar rota desta unidade.");

    const { data: unidade, error: unidadeError } = await supabase
      .from("unidades")
      .select("id, nome, endereco_completo")
      .eq("id", unidadeId)
      .single();

    if (unidadeError || !unidade) throw new Error("Unidade nao encontrada.");

    const unitAddress = cleanPart(unidade.endereco_completo);
    if (unitAddress.length < 10) {
      throw new Error("Endereco da unidade nao cadastrado ou incompleto.");
    }

    const { data: appointments, error: appointmentsError } = await supabase
      .from("agendamentos")
      .select(`
        id,
        unidade_id,
        cliente_id,
        pet_id,
        data_agendamento,
        horario_inicio,
        status,
        tem_taxi,
        endereco_busca,
        pets (
          id,
          nome,
          clientes (
            id,
            nome,
            logradouro,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep
          )
        ),
        clientes (
          id,
          nome,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          estado,
          cep
        )
      `)
      .eq("unidade_id", unidadeId)
      .eq("data_agendamento", data)
      .eq("tem_taxi", true)
      .order("horario_inicio", { ascending: true });

    if (appointmentsError) throw appointmentsError;

    const ignored: any[] = [];
    const diagnostico: any[] = [];
    const grouped = new Map<string, any>();

    for (const appt of appointments || []) {
      const status = normalizeStatus(appt.status);
      const timeInfo = parseAppointmentTime(appt.horario_inicio);
      const client = appt.clientes || appt.pets?.clientes;
      const pet = appt.pets;
      const baseDiagnostic = {
        agendamentoId: appt.id,
        dataAgendamento: appt.data_agendamento,
        horario: cleanPart(appt.horario_inicio),
        status: appt.status,
        cliente: client?.nome || "Cliente nao vinculado",
        pet: pet?.nome || "Pet nao vinculado",
        temTaxi: Boolean(appt.tem_taxi),
        endereco: "",
        turnoCalculado: timeInfo?.turno || null,
      };

      if (status === "CANCELADO" || status === "CANCELADA") {
        diagnostico.push({ ...baseDiagnostic, motivoExclusao: "Agendamento cancelado" });
        continue;
      }

      if (!timeInfo) {
        ignored.push({ agendamentoId: appt.id, cliente: client?.nome || "Cliente nao vinculado", pet: pet?.nome || "Pet nao vinculado", motivo: "Horario ausente ou invalido" });
        diagnostico.push({ ...baseDiagnostic, motivoExclusao: "Horario ausente ou invalido" });
        continue;
      }

      if (timeInfo.turno !== turno) {
        diagnostico.push({ ...baseDiagnostic, motivoExclusao: `Pertence ao turno ${timeInfo.turno}` });
        continue;
      }

      if (!client?.id || !pet?.id) {
        ignored.push({ agendamentoId: appt.id, cliente: client?.nome || "Cliente nao vinculado", pet: pet?.nome || "Pet nao vinculado", motivo: "Cliente ou pet ausente" });
        diagnostico.push({ ...baseDiagnostic, motivoExclusao: "Cliente ou pet ausente" });
        continue;
      }

      const address = buildClientAddress(client, appt.endereco_busca);
      if (!address) {
        ignored.push({ agendamentoId: appt.id, cliente: client.nome, pet: pet.nome, horario: timeInfo.label, motivo: "Endereco ausente ou incompleto" });
        diagnostico.push({ ...baseDiagnostic, motivoExclusao: "Endereco ausente ou incompleto" });
        continue;
      }

      const key = normalizeAddressKey(address);
      if (!grouped.has(key)) {
        grouped.set(key, { endereco: address, clientes: new Set<string>(), pets: [], horarios: [], agendamentos: [], sortMinutes: timeInfo.minutes, sortName: client.nome });
      }

      const stop = grouped.get(key);
      stop.clientes.add(client.nome);
      stop.pets.push(pet.nome);
      stop.horarios.push(timeInfo.label);
      stop.sortMinutes = Math.min(stop.sortMinutes, timeInfo.minutes);
      stop.sortName = [stop.sortName, client.nome, pet.nome].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"))[0];
      stop.agendamentos.push({ id: appt.id, cliente: client.nome, pet: pet.nome, horario: timeInfo.label });
      diagnostico.push({ ...baseDiagnostic, endereco: address, turnoCalculado: timeInfo.turno, motivoExclusao: null });
    }

    const stops = Array.from(grouped.values())
      .map((stop) => ({
        ...stop,
        clientes: Array.from(stop.clientes),
        agendamentos: [...stop.agendamentos].sort((a: any, b: any) =>
          String(a.horario || "").localeCompare(String(b.horario || "")) ||
          String(a.cliente || "").localeCompare(String(b.cliente || ""), "pt-BR") ||
          String(a.pet || "").localeCompare(String(b.pet || ""), "pt-BR")
        ),
      }))
      .sort((a, b) =>
        Number(a.sortMinutes || 0) - Number(b.sortMinutes || 0) ||
        String(a.sortName || "").localeCompare(String(b.sortName || ""), "pt-BR") ||
        String(a.endereco || "").localeCompare(String(b.endereco || ""), "pt-BR")
      );

    if (stops.length === 0) {
      return new Response(JSON.stringify({
        unidade: { id: unidade.id, nome: unidade.nome, endereco: unitAddress },
        turno,
        data,
        paradas: [],
        ignorados: ignored,
        quantidadeParadas: 0,
        quantidadePets: 0,
        distanciaMetros: 0,
        duracaoSegundos: 0,
        mapsUrl: null,
        trechos: [],
        modoOrdenacao: "ordem_por_horario",
        otimizacaoDisponivel: Boolean(googleKey),
        aviso: googleKey ? null : "Otimizacao automatica indisponivel. Exibindo paradas por horario.",
        diagnostico,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    let orderedStops: any[] = stops;
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let optimized = false;
    let optimizationError: string | null = null;

    if (googleKey) {
      try {
        const optimizedStops: any[] = [];
        for (let start = 0; start < stops.length; start += MAX_GOOGLE_INTERMEDIATES) {
          const batch = stops.slice(start, start + MAX_GOOGLE_INTERMEDIATES);
          const batchResult = await optimizeStopBatch(googleKey, unitAddress, batch);
          optimizedStops.push(...batchResult.orderedStops);
          totalDistanceMeters += batchResult.distanceMeters;
          totalDurationSeconds += batchResult.durationSeconds;
        }
        orderedStops = optimizedStops;
        optimized = true;
      } catch (error) {
        optimizationError = error instanceof Error ? error.message : "Falha ao otimizar rota.";
        orderedStops = stops;
        totalDistanceMeters = 0;
        totalDurationSeconds = 0;
      }
    }

    const segments = splitRouteSegments(unitAddress, orderedStops);
    const mapsUrl = orderedStops.length <= 8 ? segments[0]?.mapsUrl : null;

    return new Response(JSON.stringify({
      unidade: { id: unidade.id, nome: unidade.nome, endereco: unitAddress },
      turno,
      data,
      paradas: orderedStops,
      ignorados: ignored,
      quantidadeParadas: orderedStops.length,
      quantidadePets: orderedStops.reduce((acc: number, stop: any) => acc + stop.pets.length, 0),
      distanciaMetros: totalDistanceMeters || null,
      duracaoSegundos: totalDurationSeconds || null,
      mapsUrl,
      trechos: segments,
      modoOrdenacao: optimized ? "rota_otimizada" : "ordem_por_horario",
      otimizacaoDisponivel: Boolean(googleKey),
      aviso: optimized ? null : (optimizationError || "Otimizacao automatica indisponivel. Exibindo paradas por horario."),
      diagnostico,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    console.error("[gerar-rota-taxi] erro:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro ao gerar rota do taxi." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
