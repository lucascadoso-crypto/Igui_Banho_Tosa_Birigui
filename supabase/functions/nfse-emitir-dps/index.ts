// Emissao real de NFS-e via API do Sistema Nacional (Fase 4).
//
// Pega um rascunho fiscal real (public.notas_fiscais), monta a DPS completa
// seguindo o XSD oficial do Sistema Nacional NFS-e, assina (XMLDSig
// enveloped), comprime em gzip + base64 e repassa para uma function Node
// (Vercel) que faz o POST final via mTLS para o endpoint de producao
// restrita (homologacao) - sefin.producaorestrita.nfse.gov.br exige
// renegociacao de TLS, que o Deno (rustls) nao suporta, entao esse ultimo
// salto nao pode ser feito aqui.
//
// Em caso de sucesso, grava chave_acesso/xml_documento/resposta_integracao
// e marca a nota como EMITIDA via marcar_nota_fiscal_emitida (RPC). Em caso
// de erro de validacao da Sefin Nacional, nao altera o banco - so devolve o
// erro para quem chamou decidir o que fazer.
//
// Ambiente ainda fixo em homologacao (tpAmb=2) - trocar para producao real
// (tpAmb=1, host sefin.nfse.gov.br) e decisao separada, so depois de validar
// bem o fluxo aqui.
//
// Autenticacao: usa o JWT de quem chama (nao service role) para ler os
// dados, respeitando as mesmas policies de RLS do resto do app
// (fiscal_can_view_note / fiscal_can_view_config). Sem isso, qualquer
// portador da anon key (publica no front-end) poderia emitir NFS-e real de
// qualquer unidade so sabendo o notaFiscalId.
//
// Uso: POST { "notaFiscalId": 123, "serie"?: "00001", "numeroDps"?: "7" }
// com header Authorization: Bearer <access_token do usuario logado>.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// @deno-types="npm:@types/xml-crypto"
import { SignedXml } from "npm:xml-crypto@6";
import { montarDpsXml, type DpsInput } from "../_shared/dps.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NODE_PROXY_URL = "https://iguibanhotosabirigui.vercel.app/api/nfse-enviar-dps";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function gzipBase64(texto: string): Promise<string> {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return base64Encode(new Uint8Array(buffer));
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzipBase64(b64: string): Promise<string> {
  const stream = new Blob([base64Decode(b64)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

// Incrementa numero_rps_atual de forma atomica (compare-and-swap via
// PostgREST, sem depender de uma function Postgres nova - o historico de
// migrations deste projeto no remoto nao bate com os arquivos locais, entao
// evitamos "db push"). config_fiscal_unidade so aceita UPDATE de "master"
// via RLS (nao de "financeiro"), entao esse passo usa a service role - mas
// so depois que a leitura da nota/config, feita com o client do proprio
// usuario, ja confirmou que ele tem acesso a unidade.
// numero_rps_atual comeca null -> tratado como 3, entao o primeiro numero
// real emitido por aqui e o 4 (continuando depois dos 3 ja emitidos
// manualmente pelo portal).
async function proximoNumeroDps(
  supabaseUrl: string,
  serviceRoleKey: string,
  unidadeId: number,
): Promise<{ serie: string; numero: number }> {
  const supabaseService = createClient(supabaseUrl, serviceRoleKey);

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: atual, error: erroLeitura } = await supabaseService
      .from("config_fiscal_unidade")
      .select("serie_rps, numero_rps_atual")
      .eq("unidade_id", unidadeId)
      .single();

    if (erroLeitura || !atual) {
      throw new Error(`Falha ao ler contador de numero DPS: ${erroLeitura?.message}`);
    }

    const serie = atual.serie_rps || "00001";
    const numeroAtual = atual.numero_rps_atual ?? 3;
    const proximoNumero = numeroAtual + 1;

    let query = supabaseService
      .from("config_fiscal_unidade")
      .update({ numero_rps_atual: proximoNumero, serie_rps: serie })
      .eq("unidade_id", unidadeId);
    query = atual.numero_rps_atual == null
      ? query.is("numero_rps_atual", null)
      : query.eq("numero_rps_atual", atual.numero_rps_atual);

    const { data: atualizado, error: erroUpdate } = await query.select("numero_rps_atual");

    if (!erroUpdate && atualizado && atualizado.length === 1) {
      return { serie, numero: proximoNumero };
    }
    // Colisao (outra emissao concorrente incrementou primeiro) - tenta de novo.
  }

  throw new Error("Nao foi possivel obter o proximo numero de DPS (muitas tentativas concorrentes).");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ ok: false, erro: "Requisicao sem Authorization (usuario nao autenticado)." }, 401);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ ok: false, erro: "Supabase nao configurado." }, 500);
    }
    // Cliente autenticado como o proprio usuario (nao service role) - as
    // queries abaixo passam pela RLS normalmente, entao um usuario sem
    // permissao sobre a unidade simplesmente nao ve a nota/config (mesmo
    // comportamento de "nao encontrado" do resto do app).
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const notaFiscalId = body?.notaFiscalId;
    if (!notaFiscalId) {
      return jsonResponse({ ok: false, erro: "Informe notaFiscalId no corpo da requisicao." }, 400);
    }

    const { data: nota, error: notaError } = await supabase
      .from("notas_fiscais")
      .select("*, clientes(nome, cpf, telefone, email), nota_fiscal_itens(*)")
      .eq("id", notaFiscalId)
      .single();

    if (notaError || !nota) {
      return jsonResponse(
        { ok: false, erro: "Rascunho fiscal nao encontrado.", detalhe: notaError?.message },
        404,
      );
    }

    const { data: config, error: configError } = await supabase
      .from("config_fiscal_unidade")
      .select("*")
      .eq("unidade_id", nota.unidade_id)
      .single();

    if (configError || !config) {
      return jsonResponse(
        { ok: false, erro: "Configuracao fiscal da unidade nao encontrada.", detalhe: configError?.message },
        404,
      );
    }

    if (!config.cnpj || !config.codigo_municipio_ibge || !config.razao_social) {
      return jsonResponse(
        { ok: false, erro: "Configuracao fiscal incompleta (CNPJ, razao social ou codigo IBGE do municipio ausente)." },
        422,
      );
    }

    const itensBrutos = (nota.nota_fiscal_itens ?? []) as Array<Record<string, unknown>>;
    if (itensBrutos.length === 0) {
      return jsonResponse({ ok: false, erro: "Rascunho fiscal nao possui itens." }, 422);
    }

    // nota_fiscal_itens guarda uma copia congelada dos codigos fiscais (tirada
    // de servicos_fiscais no momento da criacao do rascunho). Para notas ja
    // EMITIDAS o trigger de protecao nao deixa mais editar essa copia, entao
    // buscamos o valor atual em servicos_fiscais (por servico_id) e preferimos
    // ele quando disponivel - sem escrever nada em nota_fiscal_itens.
    const servicoIds = itensBrutos.map((item) => item.servico_id).filter((v) => v != null);
    const { data: servicosFiscaisAtuais } = servicoIds.length
      ? await supabase
          .from("servicos_fiscais")
          .select("servico_id, codigo_servico_municipal, codigo_tributacao_nacional, codigo_nbs")
          .eq("unidade_id", nota.unidade_id)
          .in("servico_id", servicoIds)
      : { data: [] as Array<Record<string, unknown>> };

    const servicoFiscalPorId = new Map(
      (servicosFiscaisAtuais ?? []).map((sf) => [sf.servico_id, sf]),
    );

    // Achado ao investigar dados reais: em servicos_fiscais,
    // codigo_tributacao_nacional esta sempre null e o valor que deveria estar
    // la (ex.: "050801", que bate com o "Codigo de Tributacao Nacional:
    // 05.08.01" do DANFSe real) foi gravado em codigo_servico_municipal por
    // engano. Aplicamos o fallback aqui (sem mexer no banco) para nao ficar
    // bloqueado por causa de um bug de cadastro que nao e desta fase.
    const itens = itensBrutos.map((item) => {
      const atual = servicoFiscalPorId.get(item.servico_id as number);
      const codigoNbs = (atual?.codigo_nbs as string | null) ?? (item.codigo_nbs as string | null);
      const codigoTribNacBruto = (atual?.codigo_tributacao_nacional as string | null) ??
        (item.codigo_tributacao_nacional as string | null);
      const codigoServicoMunicipalBruto = (atual?.codigo_servico_municipal as string | null) ??
        (item.codigo_servico_municipal as string | null);

      const cTribNac = codigoTribNacBruto ??
        (/^\d{6}$/.test(String(codigoServicoMunicipalBruto ?? "")) ? codigoServicoMunicipalBruto : null);
      const cTribMun = codigoTribNacBruto ? codigoServicoMunicipalBruto : null;

      return { ...item, codigo_tributacao_nacional: cTribNac, codigo_servico_municipal: cTribMun, codigo_nbs: codigoNbs };
    });

    const codigosTribNac = new Set(itens.map((item) => item.codigo_tributacao_nacional));
    const codigosNbs = new Set(itens.map((item) => item.codigo_nbs));
    if (codigosTribNac.size > 1 || codigosNbs.size > 1) {
      return jsonResponse(
        {
          ok: false,
          erro:
            "Rascunho tem itens com codigos fiscais diferentes; o leiaute da DPS nacional so suporta um servico por envio. Emissao manual necessaria para este caso.",
        },
        422,
      );
    }

    const primeiroItem = itens[0];
    if (!primeiroItem.codigo_tributacao_nacional) {
      return jsonResponse(
        { ok: false, erro: "Item fiscal sem codigo de tributacao nacional (nem no fallback codigo_servico_municipal)." },
        422,
      );
    }
    const nbsBruto = String(primeiroItem.codigo_nbs ?? "");
    if (!/^\d{9}$/.test(nbsBruto)) {
      return jsonResponse(
        {
          ok: false,
          erro:
            `Codigo NBS invalido para a DPS: precisa ter exatamente 9 digitos, mas o valor cadastrado em servicos_fiscais e "${nbsBruto}" (${nbsBruto.length} digitos). Confirme o codigo NBS correto (ex.: verificar contra a tabela oficial NBS) antes de enviar.`,
          nbsCadastrado: nbsBruto,
        },
        422,
      );
    }

    const descricaoServico =
      (nota.descricao_servico as string) ||
      itens.map((item) => item.descricao as string).filter(Boolean).join("; ");

    let serie: string;
    let numeroDps: string;
    if (body?.serie != null && body?.numeroDps != null) {
      serie = String(body.serie);
      numeroDps = String(body.numeroDps);
    } else {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) {
        return jsonResponse({ ok: false, erro: "Service role nao configurada (necessaria para o contador de numero DPS)." }, 500);
      }
      const proximo = await proximoNumeroDps(supabaseUrl, serviceRoleKey, nota.unidade_id as number);
      serie = proximo.serie;
      numeroDps = String(proximo.numero);
    }

    // NFSE_AMBIENTE controla producao real (sefin.nfse.gov.br, tpAmb=1) vs
    // homologacao/producao restrita (sefin.producaorestrita.nfse.gov.br,
    // tpAmb=2). Default e homologacao - producao exige a env var explicita,
    // pra nao acontecer por engano.
    const ambiente = (Deno.env.get("NFSE_AMBIENTE") ?? "HOMOLOGACAO").toUpperCase();
    const tpAmb: 1 | 2 = ambiente === "PRODUCAO" ? 1 : 2;

    const dpsInput: DpsInput = {
      tpAmb,
      serie,
      numeroDps,
      dataCompetencia: (nota.data_competencia as string) ?? new Date().toISOString().slice(0, 10),
      dataHoraEmissao: new Date(),
      verAplic: "IguiBT1.0",
      prestador: {
        cnpj: config.cnpj,
        // Confirmado por regra de negocio real da Sefin Nacional (erro
        // E0120): Birigui nao tem cadastro complementar no CNC NFS-e para
        // este prestador, entao a IM nao pode ser enviada mesmo estando
        // preenchida em config_fiscal_unidade.
        inscricaoMunicipal: null,
        razaoSocial: config.razao_social,
        nomeFantasia: config.nome_fantasia,
        codigoMunicipioIbge: config.codigo_municipio_ibge,
        cep: config.cep,
        logradouro: config.logradouro,
        numero: config.numero,
        complemento: config.complemento,
        bairro: config.bairro,
        telefone: config.telefone_fiscal,
        email: config.email_fiscal,
      },
      tomador: {
        cpf: (nota.tomador_cpf_cnpj as string) ?? nota.clientes?.cpf ?? null,
        nome: (nota.tomador_nome as string) ?? nota.clientes?.nome ?? "",
        telefone: (nota.tomador_telefone as string) ?? nota.clientes?.telefone ?? null,
        email: (nota.tomador_email as string) ?? nota.clientes?.email ?? null,
      },
      servico: {
        codigoTribNac: primeiroItem.codigo_tributacao_nacional as string,
        codigoTribMun: primeiroItem.codigo_servico_municipal as string | null,
        descricao: descricaoServico || (primeiroItem.descricao as string),
        codigoNbs: primeiroItem.codigo_nbs as string,
      },
      valores: {
        valorServico: Number(nota.valor_servicos),
        valorDescontoIncondicionado: Number(nota.valor_desconto ?? 0),
      },
    };

    const { xml: xmlSemAssinatura, idInfDps } = montarDpsXml(dpsInput);

    const keyPemB64 = Deno.env.get("NFSE_KEY_PEM_B64");
    const certPemB64 = Deno.env.get("NFSE_CERT_PEM_B64");
    if (!keyPemB64 || !certPemB64) {
      return jsonResponse({ ok: false, erro: "Secrets do certificado nao configurados.", idInfDps, xmlSemAssinatura }, 500);
    }
    const privateKey = atob(keyPemB64);
    const certificate = atob(certPemB64);

    const sig = new SignedXml({ privateKey, publicCert: certificate });
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
    sig.computeSignature(xmlSemAssinatura, {
      location: { reference: "//*[local-name(.)='infDPS']", action: "after" },
    });
    const xmlAssinado = sig.getSignedXml();

    const dpsXmlGZipB64 = await gzipBase64(xmlAssinado);

    // sefin.producaorestrita.nfse.gov.br roda IIS e pede renegociacao de TLS
    // no meio da conexao para exigir o certificado do cliente. O Deno usa
    // rustls, que nao suporta renegociacao (limitacao deliberada de
    // seguranca da lib) - a conexao e sempre resetada
    // ("connection reset by peer"), mesmo com HTTP/1.1 forcado. Por isso o
    // envio final e delegado para uma function Node (Vercel, OpenSSL
    // suporta renegociacao) que so repassa o payload ja pronto.
    const internalProxySecret = Deno.env.get("INTERNAL_PROXY_SECRET");
    if (!internalProxySecret) {
      return jsonResponse({ ok: false, erro: "INTERNAL_PROXY_SECRET nao configurado.", idInfDps }, 500);
    }
    const respostaProxy = await fetch(NODE_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": internalProxySecret },
      body: JSON.stringify({ dpsXmlGZipB64, ambiente }),
    });
    const proxyJson = await respostaProxy.json().catch(() => null);
    const emissaoOk = proxyJson?.ok ?? false;

    let notaAtualizada: unknown = null;
    let erroGravacao: string | undefined;

    if (emissaoOk && proxyJson?.resposta?.nfseXmlGZipB64) {
      const nfseXml = await gunzipBase64(proxyJson.resposta.nfseXmlGZipB64 as string);
      const numeroNota = nfseXml.match(/<nNFSe>([^<]+)<\/nNFSe>/)?.[1] ?? null;

      if (!numeroNota) {
        erroGravacao = "NFS-e emitida, mas nNFSe nao encontrado no XML retornado - nao foi possivel gravar no banco.";
      } else {
        const { data, error: rpcError } = await supabase.rpc("marcar_nota_fiscal_emitida", {
          p_nota_fiscal_id: notaFiscalId,
          p_numero_nota: numeroNota,
          p_data_emissao: new Date().toISOString(),
          p_chave_acesso: proxyJson.resposta.chaveAcesso ?? null,
          p_xml_documento: nfseXml,
          p_resposta_integracao: proxyJson.resposta,
        });
        if (rpcError) {
          erroGravacao = rpcError.message;
        } else {
          notaAtualizada = data;
        }
      }
    }

    return jsonResponse(
      {
        ok: emissaoOk,
        idInfDps,
        httpStatus: proxyJson?.httpStatus ?? respostaProxy.status,
        resposta: proxyJson?.resposta ?? proxyJson,
        notaAtualizada,
        erroGravacao,
        xmlAssinadoTrecho: xmlAssinado.slice(0, 600),
      },
      200,
    );
  } catch (error) {
    const detalhe = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    return jsonResponse({ ok: false, erro: "Falha ao montar/assinar/enviar DPS.", detalhe }, 500);
  }
});
