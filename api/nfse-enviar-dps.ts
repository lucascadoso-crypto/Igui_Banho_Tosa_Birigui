// Recebe a DPS ja montada, assinada, comprimida (gzip) e em base64 (mesmo
// payload que a Supabase Edge Function nfse-emitir-dps monta) e faz o POST
// final para a Sefin Nacional. O campo "ambiente" no corpo ("PRODUCAO" ou
// qualquer outro valor = homologacao/producao restrita) escolhe o host -
// controlado do lado do chamador (NFSE_AMBIENTE na Edge Function), pra ter
// um unico lugar decidindo producao real vs teste.
//
// Existe como function separada (Node, nao Deno) porque
// sefin.producaorestrita.nfse.gov.br roda IIS e pede renegociacao de TLS no
// meio da conexao para exigir o certificado do cliente. O Deno das Supabase
// Edge Functions usa rustls, que nao suporta renegociacao de TLS (limitacao
// deliberada de seguranca da biblioteca) - a conexao e sempre resetada. O
// runtime Node da Vercel usa OpenSSL, que suporta renegociacao normalmente.
//
// So aceita chamadas com o header X-Internal-Secret batendo com
// INTERNAL_PROXY_SECRET - sem isso, qualquer um na internet que soubesse a
// URL conseguiria usar o certificado A1 configurado aqui pra mandar
// documentos pra Sefin Nacional.
//
// Uso: POST { "dpsXmlGZipB64": "..." } com header
// X-Internal-Secret: <INTERNAL_PROXY_SECRET>

import https from "node:https";
import { timingSafeEqual } from "node:crypto";

// Tipagem minima local (sem depender de @vercel/node instalado no projeto).
interface MinimalVercelRequest {
  method?: string;
  body?: unknown;
}
interface MinimalVercelResponse {
  status(code: number): MinimalVercelResponse;
  json(body: unknown): void;
  end(): void;
}
interface MinimalVercelRequestWithHeaders extends MinimalVercelRequest {
  headers?: Record<string, string | string[] | undefined>;
}

function segredoValido(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const SEFIN_HOMOLOGACAO_HOST = "sefin.producaorestrita.nfse.gov.br";
const SEFIN_PRODUCAO_HOST = "sefin.nfse.gov.br";
const SEFIN_PATH = "/SefinNacional/nfse";

function enviarParaSefin(
  dpsXmlGZipB64: string,
  cert: string,
  key: string,
  host: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ dpsXmlGZipB64 });

    const req = https.request(
      {
        host,
        path: SEFIN_PATH,
        method: "POST",
        cert,
        key,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export default async function handler(req: MinimalVercelRequestWithHeaders, res: MinimalVercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Use POST." });
    return;
  }

  const segredoEsperado = process.env.INTERNAL_PROXY_SECRET;
  if (!segredoEsperado) {
    res.status(500).json({ ok: false, erro: "INTERNAL_PROXY_SECRET nao configurado nesta function." });
    return;
  }
  const segredoRecebido = req.headers?.["x-internal-secret"];
  const segredoRecebidoStr = Array.isArray(segredoRecebido) ? segredoRecebido[0] : segredoRecebido;
  if (!segredoValido(segredoRecebidoStr, segredoEsperado)) {
    res.status(401).json({ ok: false, erro: "Nao autorizado." });
    return;
  }

  const { dpsXmlGZipB64, ambiente } = (req.body ?? {}) as { dpsXmlGZipB64?: string; ambiente?: string };
  if (!dpsXmlGZipB64) {
    res.status(400).json({ ok: false, erro: "Informe dpsXmlGZipB64 no corpo da requisicao." });
    return;
  }
  const host = ambiente === "PRODUCAO" ? SEFIN_PRODUCAO_HOST : SEFIN_HOMOLOGACAO_HOST;

  const certPemB64 = process.env.NFSE_CERT_PEM_B64;
  const keyPemB64 = process.env.NFSE_KEY_PEM_B64;
  if (!certPemB64 || !keyPemB64) {
    res.status(500).json({ ok: false, erro: "NFSE_CERT_PEM_B64/NFSE_KEY_PEM_B64 nao configurados nesta function." });
    return;
  }

  try {
    const cert = Buffer.from(certPemB64, "base64").toString("utf-8");
    const key = Buffer.from(keyPemB64, "base64").toString("utf-8");

    const resposta = await enviarParaSefin(dpsXmlGZipB64, cert, key, host);

    let respostaJson: unknown = null;
    try {
      respostaJson = JSON.parse(resposta.body);
    } catch {
      // resposta nao veio em JSON
    }

    res.status(200).json({
      ok: resposta.status >= 200 && resposta.status < 300,
      httpStatus: resposta.status,
      resposta: respostaJson ?? resposta.body,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      erro: "Falha ao enviar DPS para a Sefin Nacional.",
      detalhe: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}
