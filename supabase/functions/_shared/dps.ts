// Monta o XML da DPS (Declaracao de Prestacao de Servico) do Sistema Nacional
// NFS-e a partir dos dados de um rascunho fiscal real.
//
// Segue a ordem exata dos elementos do XSD oficial (TInfDPS / TPrestador /
// TTomador / TServico / TValores), baixado de
// https://nota-eletronica.betha.cloud/dps/ws/schemas/nfse_dps_v01.xsd
// (mesmo leiaute nacional usado pelo Sefin Nacional). Ordem errada de
// elementos e um motivo comum de rejeicao no ambiente nacional.
//
// So cobre o caso de uma DPS com um unico servico (nao ha lista de itens no
// leiaute nacional - <serv> so tem um <cServ>), prestador optante pelo
// Simples Nacional como ME/EPP sem regime especial (confirmado batendo com
// uma NFS-e real ja emitida para o mesmo CNPJ, ver DANFSe da chave
// 35065082254029600000101000000000000326074633390201) e tomador pessoa
// fisica sem endereco estruturado (toma/end e opcional no XSD).

export interface DpsPrestador {
  cnpj: string;
  inscricaoMunicipal?: string | null;
  razaoSocial: string;
  nomeFantasia?: string | null;
  codigoMunicipioIbge: string;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface DpsTomador {
  cpf?: string | null;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

export interface DpsServico {
  codigoTribNac: string;
  codigoTribMun?: string | null;
  descricao: string;
  codigoNbs: string;
}

export interface DpsValores {
  valorServico: number;
  valorDescontoIncondicionado?: number;
}

export interface DpsInput {
  tpAmb: 1 | 2;
  serie: string;
  numeroDps: string;
  dataCompetencia: string;
  dataHoraEmissao: Date;
  verAplic: string;
  prestador: DpsPrestador;
  tomador?: DpsTomador | null;
  servico: DpsServico;
  valores: DpsValores;
}

export interface DpsMontada {
  xml: string;
  idInfDps: string;
}

function apenasDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatarValor(valor: number): string {
  return valor.toFixed(2);
}

function formatarSerie(serie: string): string {
  const limpa = serie.trim() || "00001";
  return /^\d+$/.test(limpa) ? limpa.padStart(5, "0").slice(-5) : limpa.slice(0, 5);
}

function formatarNumeroDps(numero: string): string {
  // TSNumDPS (leiaute oficial) nao aceita zero a esquerda - sem padding,
  // so limita a 15 digitos e remove zeros iniciais.
  const limpo = (apenasDigitos(numero) || "1").replace(/^0+(?=\d)/, "").slice(-15);
  return limpo || "1";
}

// Horario de Brasilia e fixo em -03:00 (sem horario de verao desde 2019).
function formatarDataHoraBrasil(data: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const comOffset = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return (
    `${comOffset.getUTCFullYear()}-${pad(comOffset.getUTCMonth() + 1)}-${pad(comOffset.getUTCDate())}` +
    `T${pad(comOffset.getUTCHours())}:${pad(comOffset.getUTCMinutes())}:${pad(comOffset.getUTCSeconds())}-03:00`
  );
}

// Id do infDPS = "DPS" + cMunEmi(7) + tpInsc(1) + inscricaoFederal(14, CPF
// completa com zeros a esquerda) + serieDPS(5) + numeroDPS(15 - com zeros a
// esquerda dentro do Id, mesmo que o elemento <nDPS> em si nao aceite zero a
// esquerda), conforme descrito no Manual dos Contribuintes do Sistema
// Nacional NFS-e (secao "API DPS") e confirmado por tentativa/erro contra o
// leiaute oficial (TSIdDPS exige largura fixa, TSNumDPS nao aceita zero a
// esquerda no elemento).
export function montarIdInfDps(input: DpsInput): string {
  const cLocEmi = apenasDigitos(input.prestador.codigoMunicipioIbge).padStart(7, "0").slice(-7);
  const cnpj = apenasDigitos(input.prestador.cnpj).padStart(14, "0").slice(-14);
  const tpInsc = "2"; // 1 = CPF, 2 = CNPJ - prestador desta unidade emite por CNPJ.
  const numeroDpsComZeros = formatarNumeroDps(input.numeroDps).padStart(15, "0");
  return `DPS${cLocEmi}${tpInsc}${cnpj}${formatarSerie(input.serie)}${numeroDpsComZeros}`;
}

export function montarDpsXml(input: DpsInput): DpsMontada {
  const cLocEmi = apenasDigitos(input.prestador.codigoMunicipioIbge).padStart(7, "0").slice(-7);
  const cnpjPrestador = apenasDigitos(input.prestador.cnpj).padStart(14, "0").slice(-14);
  const idInfDps = montarIdInfDps(input);

  // Erro real de regra de negocio (E0128): o endereco do prestador nao deve
  // ser informado quando o proprio prestador e o emitente da DPS (tpEmit=1)
  // - o sistema ja usa o endereco do Cadastro Nacional de Contribuintes.
  const enderecoPrestador = "";

  const prest =
    `<prest><CNPJ>${cnpjPrestador}</CNPJ>` +
    (input.prestador.inscricaoMunicipal
      ? `<IM>${escaparXml(input.prestador.inscricaoMunicipal)}</IM>`
      : "") +
    // xNome (e xFant, que nem existe no leiaute oficial) nao devem ser
    // informados quando o proprio prestador e o emitente da DPS (erro real
    // de regra de negocio E0121) - mesmo raciocinio do endereco (E0128).
    enderecoPrestador +
    (input.prestador.telefone ? `<fone>${apenasDigitos(input.prestador.telefone)}</fone>` : "") +
    (input.prestador.email ? `<email>${escaparXml(input.prestador.email)}</email>` : "") +
    // ME/EPP optante pelo Simples Nacional, apuracao federal e municipal pelo
    // SN, sem regime especial - confirmado contra NFS-e real ja emitida para
    // este CNPJ (mesma combinacao aparece no DANFSe correspondente).
    `<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>` +
    `</prest>`;

  let toma = "";
  if (input.tomador?.nome) {
    const cpf = apenasDigitos(input.tomador.cpf);
    // Erro real de schema (E1235): sem CNPJ/CPF/NIF, o elemento cNaoNIF e
    // obrigatorio antes de xNome (o choice nao pode simplesmente ser
    // omitido). cNaoNIF=2 = "Outros" - usado sempre que o cliente nao tem
    // CPF cadastrado, sem limite de valor (nao ha exigencia legal disso).
    toma =
      `<toma>` +
      (cpf ? `<CPF>${cpf.padStart(11, "0").slice(-11)}</CPF>` : `<cNaoNIF>2</cNaoNIF>`) +
      `<xNome>${escaparXml(input.tomador.nome)}</xNome>` +
      (input.tomador.telefone ? `<fone>${apenasDigitos(input.tomador.telefone)}</fone>` : "") +
      (input.tomador.email ? `<email>${escaparXml(input.tomador.email)}</email>` : "") +
      `</toma>`;
  }

  const serv =
    `<serv><locPrest><cLocPrestacao>${cLocEmi}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${input.servico.codigoTribNac}</cTribNac>` +
    (input.servico.codigoTribMun ? `<cTribMun>${escaparXml(input.servico.codigoTribMun)}</cTribMun>` : "") +
    `<xDescServ>${escaparXml(input.servico.descricao)}</xDescServ>` +
    `<cNBS>${input.servico.codigoNbs}</cNBS>` +
    `</cServ></serv>`;

  const descontos = input.valores.valorDescontoIncondicionado
    ? `<vDescCondIncond><vDescIncond>${formatarValor(input.valores.valorDescontoIncondicionado)}</vDescIncond></vDescCondIncond>`
    : "";

  // tribISSQN=1 (operacao tributavel) e tpRetISSQN=1 (nao retido) batem com
  // o DANFSe real usado como referencia. totTrib exige pelo menos um filho
  // preenchido (erro real de schema: "incomplete content") - usamos
  // pTotTribSN=6.00 (aliquota aproximada do Simples Nacional, 1a faixa do
  // Anexo III) como valor informativo de transparencia; nao e uma apuracao
  // exata (depende do faturamento acumulado dos ultimos 12 meses).
  const valores =
    `<valores><vServPrest><vServ>${formatarValor(input.valores.valorServico)}</vServ></vServPrest>` +
    descontos +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib>` +
    `</valores>`;

  const infDps =
    `<infDPS Id="${idInfDps}">` +
    `<tpAmb>${input.tpAmb}</tpAmb>` +
    `<dhEmi>${formatarDataHoraBrasil(input.dataHoraEmissao)}</dhEmi>` +
    `<verAplic>${escaparXml(input.verAplic)}</verAplic>` +
    `<serie>${formatarSerie(input.serie)}</serie>` +
    `<nDPS>${formatarNumeroDps(input.numeroDps)}</nDPS>` +
    `<dCompet>${input.dataCompetencia}</dCompet>` +
    `<tpEmit>1</tpEmit>` +
    `<cLocEmi>${cLocEmi}</cLocEmi>` +
    prest +
    toma +
    serv +
    valores +
    `</infDPS>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDps}</DPS>`;

  return { xml, idInfDps };
}
