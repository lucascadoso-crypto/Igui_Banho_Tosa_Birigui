// FERRAMENTA DE DIAGNOSTICO (Fase 3 - nao usar em fluxo real ainda).
//
// Testa apenas se o handshake mTLS com o certificado A1 (secrets
// NFSE_CERT_PEM / NFSE_KEY_PEM) funciona contra o ambiente de homologacao
// (producao restrita) do Sistema Nacional NFS-e. Nao monta, nao assina e
// nao envia nenhuma DPS - so confirma que a conexao autenticada abre.
//
// Uso: POST com body { "path": "/contribuintes/docs/index.html" } (ou
// outro path para testar), ou sem body para usar o padrao.
// A resposta devolve status HTTP + um trecho do corpo, para diagnostico.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOMOLOGACAO_HOST = "https://adn.producaorestrita.nfse.gov.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Secrets guardados em base64 (uma linha so) porque o valor multi-linha do
  // PEM estava sendo truncado na primeira quebra de linha ao subir via CLI.
  const certPemB64 = Deno.env.get("NFSE_CERT_PEM_B64") ?? "";
  const keyPemB64 = Deno.env.get("NFSE_KEY_PEM_B64") ?? "";
  const certPem = certPemB64 ? atob(certPemB64) : "";
  const keyPem = keyPemB64 ? atob(keyPemB64) : "";

  const diagnostico = {
    certLen: certPem.length,
    certInicio: certPem.slice(0, 35),
    certFim: certPem.slice(-35),
    keyLen: keyPem.length,
    keyInicio: keyPem.slice(0, 35),
    keyFim: keyPem.slice(-35),
    denoVersion: Deno.version,
  };

  if (!certPem || !keyPem) {
    return new Response(JSON.stringify({ ok: false, erro: "Secrets NFSE_CERT_PEM_B64/NFSE_KEY_PEM_B64 nao configurados.", diagnostico }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let path = "/contribuintes/docs/index.html";
  try {
    const body = await req.json();
    if (body?.path) path = body.path;
  } catch (_) {
    // sem body, usa o padrao
  }

  try {
    const client = Deno.createHttpClient({
      cert: certPem,
      key: keyPem,
    });

    const url = `${HOMOLOGACAO_HOST}${path}`;
    const resp = await fetch(url, { client });
    const text = await resp.text();

    client.close();

    return new Response(JSON.stringify({
      ok: true,
      url,
      status: resp.status,
      statusText: resp.statusText,
      corpoParcial: text.slice(0, 1500),
      diagnostico,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const detalhe = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return new Response(JSON.stringify({ ok: false, erro: "Falha no teste de conexao mTLS.", detalhe, diagnostico }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
