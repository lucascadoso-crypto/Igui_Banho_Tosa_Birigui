// FERRAMENTA DE DIAGNOSTICO (Fase 3 - nao usar em fluxo real ainda).
//
// Testa se e possivel assinar XML (XMLDSig, enveloped signature) dentro do
// runtime Deno das Supabase Edge Functions usando a lib npm:xml-crypto.
// Nao monta uma DPS de verdade, so um XML de exemplo minimo com a mesma
// forma (elemento com atributo Id, assinatura como irmã).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @deno-types="npm:@types/xml-crypto"
import { SignedXml } from "npm:xml-crypto@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const keyPem = Deno.env.get("NFSE_KEY_PEM_B64");
    const certPem = Deno.env.get("NFSE_CERT_PEM_B64");

    if (!keyPem || !certPem) {
      return new Response(JSON.stringify({ ok: false, erro: "Secrets nao configurados." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const privateKey = atob(keyPem);
    const certificate = atob(certPem);

    const xmlExemplo = `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="DPS35065082540296000001010000070000000000003"><tpAmb>2</tpAmb></infDPS></DPS>`;

    const sig = new SignedXml({
      privateKey,
      publicCert: certificate,
    });

    sig.addReference({
      xpath: "//*[local-name(.)='infDPS']",
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      ],
    });

    sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
    sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

    sig.computeSignature(xmlExemplo, {
      location: { reference: "//*[local-name(.)='infDPS']", action: "after" },
    });

    const xmlAssinado = sig.getSignedXml();

    return new Response(JSON.stringify({
      ok: true,
      contemSignature: xmlAssinado.includes("<Signature"),
      tamanho: xmlAssinado.length,
      trecho: xmlAssinado.slice(0, 400),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const detalhe = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    return new Response(JSON.stringify({ ok: false, erro: "Falha ao assinar XML.", detalhe }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
