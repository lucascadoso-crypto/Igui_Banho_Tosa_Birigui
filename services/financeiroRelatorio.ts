import jsPDF from 'jspdf';
import { formatCurrencyBR } from './appointmentTotals';
import {
  FinanceiroFiltros,
  FinanceiroKpis,
  FluxoDiarioPonto,
  LinhaServicoValor,
  FormaPagamentoValor,
  Fidelidade,
  getPeriodoAnterior
} from './financeiroGeral';

// Relatorio do Financeiro Geral (aba Visao Geral): monta, a partir dos dados
// que a tela ja carregou para os filtros atuais (unidade + periodo), um
// relatorio em PDF (para ler/compartilhar) ou em CSV (para abrir no Excel e
// analisar). Nao faz nenhuma consulta nova ao banco.

export interface RelatorioFinanceiroEntrada {
  unidadeNome: string;
  filtros: Pick<FinanceiroFiltros, 'dataInicio' | 'dataFim' | 'formaPagamento' | 'linhaServico' | 'transporte'>;
  kpis: FinanceiroKpis;
  fluxoDiario: FluxoDiarioPonto[];
  porLinha: LinhaServicoValor[];
  formasPagamento: FormaPagamentoValor[];
  fidelidade: Fidelidade | null;
}

type Cel =
  | { k: 'txt'; v: string }
  | { k: 'moeda'; v: number }
  | { k: 'pct'; v: number }
  | { k: 'num'; v: number };

interface LinhaRel {
  cels: Cel[];
  negrito?: boolean;
}

interface SecaoRel {
  titulo: string;
  cabecalho: string[];
  linhas: LinhaRel[];
}

export interface RelatorioMontado {
  titulo: string;
  meta: string[];
  secoes: SecaoRel[];
}

const txt = (v: string): Cel => ({ k: 'txt', v });
const moeda = (v: number): Cel => ({ k: 'moeda', v });
const pct = (v: number): Cel => ({ k: 'pct', v });
const num = (v: number): Cel => ({ k: 'num', v });

const fmtNumBR = (n: number, casas: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const soma = (valores: number[]) => valores.reduce((total, v) => total + v, 0);

const LINHA_LABEL: Record<string, string> = {
  banho: 'Banho',
  tosa: 'Tosa',
  pacote: 'Pacote',
  adicional: 'Serviços adicionais',
  outro: 'Outros'
};

const rotuloLinha = (linha: string) =>
  LINHA_LABEL[linha] || (linha ? linha.charAt(0).toUpperCase() + linha.slice(1) : 'Outros');

/** Variacao percentual atual x anterior. null quando nao ha base de comparacao (anterior = 0). */
const variacaoPct = (atual: number, anterior: number): number | null => {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
};

const celVariacao = (atual: number, anterior: number): Cel => {
  const v = variacaoPct(atual, anterior);
  if (v === null) return txt('-');
  return txt(`${v > 0 ? '+' : ''}${fmtNumBR(v, 1)}%`);
};

const margem = (resultado: number, entradas: number): number | null =>
  entradas > 0 ? (resultado / entradas) * 100 : null;

const percentualDe = (parte: number, total: number): Cel => (total > 0 ? pct((parte / total) * 100) : txt('-'));

const linhasOuVazio = (linhas: LinhaRel[], colunas: number): LinhaRel[] =>
  linhas.length > 0
    ? linhas
    : [{ cels: [txt('Sem dados no período'), ...Array.from({ length: colunas - 1 }, () => txt(''))] }];

export const montarRelatorioFinanceiro = (entrada: RelatorioFinanceiroEntrada): RelatorioMontado => {
  const { unidadeNome, filtros, kpis, fluxoDiario, porLinha, formasPagamento, fidelidade } = entrada;
  const anterior = getPeriodoAnterior(filtros.dataInicio, filtros.dataFim);

  const entradas = kpis.recebidoAtual;
  const saidas = kpis.custosAtual;
  const resultado = kpis.lucroAtual;
  const margemAtual = margem(resultado, entradas);
  const margemAnterior = margem(kpis.lucroAnterior, kpis.recebidoAnterior);

  // --- Cabecalho / metadados -------------------------------------------------
  const filtrosAplicados: string[] = [];
  if (filtros.formaPagamento && filtros.formaPagamento !== 'todas') {
    filtrosAplicados.push(`Forma de pagamento: ${filtros.formaPagamento}`);
  }
  if (filtros.linhaServico && filtros.linhaServico !== 'todos') {
    filtrosAplicados.push(`Tipo de serviço: ${rotuloLinha(filtros.linhaServico)}`);
  }
  if (filtros.transporte && filtros.transporte !== 'todos') {
    filtrosAplicados.push(`Transporte: ${filtros.transporte === 'com' ? 'com transporte' : 'sem transporte'}`);
  }

  const geradoEm = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(', ', ' às ');

  const meta = [
    `Unidade: ${unidadeNome}`,
    `Período: ${fmtData(filtros.dataInicio)} a ${fmtData(filtros.dataFim)}`,
    `Comparado com: ${fmtData(anterior.dataInicioAnterior)} a ${fmtData(anterior.dataFimAnterior)}`,
    ...(filtrosAplicados.length > 0 ? [`Filtros aplicados: ${filtrosAplicados.join(' | ')}`] : []),
    'Regime de caixa: considera o que entrou e saiu de fato no período.',
    `Gerado em: ${geradoEm}`
  ];

  // --- 1. Resumo -------------------------------------------------------------
  const resumo: SecaoRel = {
    titulo: 'Resumo do período',
    cabecalho: ['Indicador', 'Período atual', 'Período anterior', 'Variação'],
    linhas: [
      { cels: [txt('Entradas'), moeda(entradas), moeda(kpis.recebidoAnterior), celVariacao(entradas, kpis.recebidoAnterior)] },
      { cels: [txt('Saídas (despesas)'), moeda(saidas), moeda(kpis.custosAnterior), celVariacao(saidas, kpis.custosAnterior)] },
      {
        cels: [txt('Resultado (entradas - saídas)'), moeda(resultado), moeda(kpis.lucroAnterior), celVariacao(resultado, kpis.lucroAnterior)],
        negrito: true
      },
      {
        cels: [
          txt('Margem (resultado / entradas)'),
          margemAtual === null ? txt('-') : pct(margemAtual),
          margemAnterior === null ? txt('-') : pct(margemAnterior),
          margemAtual !== null && margemAnterior !== null
            ? txt(`${margemAtual - margemAnterior > 0 ? '+' : ''}${fmtNumBR(margemAtual - margemAnterior, 1)} p.p.`)
            : txt('-')
        ]
      }
    ]
  };

  // --- 2. Destaques (a partir do fluxo diario) --------------------------------
  const dias = fluxoDiario.length;
  const diasComEntrada = fluxoDiario.filter((d) => d.receita > 0).length;
  const mediaPorDiaComMovimento = diasComEntrada > 0 ? soma(fluxoDiario.map((d) => d.receita)) / diasComEntrada : 0;
  const melhorDia = fluxoDiario.reduce<FluxoDiarioPonto | null>(
    (melhor, d) => (d.receita > (melhor?.receita ?? 0) ? d : melhor),
    null
  );
  const maiorSaida = fluxoDiario.reduce<FluxoDiarioPonto | null>(
    (maior, d) => (d.custo > (maior?.custo ?? 0) ? d : maior),
    null
  );
  const diasNegativos = fluxoDiario.filter((d) => d.lucro < 0).length;

  const destaques: SecaoRel = {
    titulo: 'Destaques',
    cabecalho: ['Indicador', 'Valor'],
    linhas: [
      { cels: [txt('Dias no período'), num(dias)] },
      { cels: [txt('Dias com entradas'), num(diasComEntrada)] },
      { cels: [txt('Média de entradas por dia com movimento'), moeda(mediaPorDiaComMovimento)] },
      {
        cels: [
          txt('Melhor dia de entradas'),
          txt(melhorDia ? `${fmtData(melhorDia.bucket)} - ${formatCurrencyBR(melhorDia.receita)}` : '-')
        ]
      },
      {
        cels: [
          txt('Maior saída em um dia'),
          txt(maiorSaida ? `${fmtData(maiorSaida.bucket)} - ${formatCurrencyBR(maiorSaida.custo)}` : '-')
        ]
      },
      { cels: [txt('Dias com resultado negativo'), num(diasNegativos)] }
    ]
  };

  // --- 3. Faturamento por tipo de servico -------------------------------------
  const totalLinhas = soma(porLinha.map((l) => l.valor));
  const linhasServico: LinhaRel[] = porLinha.map((l) => ({
    cels: [txt(rotuloLinha(l.linha)), moeda(l.valor), percentualDe(l.valor, totalLinhas)]
  }));
  if (porLinha.length > 0) {
    linhasServico.push({ cels: [txt('Total'), moeda(totalLinhas), totalLinhas > 0 ? pct(100) : txt('-')], negrito: true });
  }
  const faturamentoPorServico: SecaoRel = {
    titulo: 'Faturamento por tipo de serviço',
    cabecalho: ['Tipo de serviço', 'Valor', '% do total'],
    linhas: linhasOuVazio(linhasServico, 3)
  };

  // --- 4. Formas de pagamento -------------------------------------------------
  const totalFormas = soma(formasPagamento.map((f) => f.valor));
  const linhasFormas: LinhaRel[] = formasPagamento.map((f) => ({
    cels: [txt(f.forma), moeda(f.valor), percentualDe(f.valor, totalFormas)]
  }));
  if (formasPagamento.length > 0) {
    linhasFormas.push({ cels: [txt('Total recebido'), moeda(totalFormas), totalFormas > 0 ? pct(100) : txt('-')], negrito: true });
  }
  const formas: SecaoRel = {
    titulo: 'Formas de pagamento',
    cabecalho: ['Forma de pagamento', 'Valor recebido', '% do total'],
    linhas: linhasOuVazio(linhasFormas, 3)
  };

  // --- 5. Pacotes x avulsos ---------------------------------------------------
  const secoes: SecaoRel[] = [resumo, destaques, faturamentoPorServico, formas];
  if (fidelidade) {
    const totalFidelidade = fidelidade.pacotesValor + fidelidade.avulsosValor;
    const medio = (valor: number, qtd: number) => (qtd > 0 ? moeda(valor / qtd) : txt('-'));
    secoes.push({
      titulo: 'Pacotes x avulsos',
      cabecalho: ['Tipo', 'Valor', '% do total', 'Quantidade', 'Valor médio'],
      linhas: [
        {
          cels: [
            txt('Pacotes (contratos)'),
            moeda(fidelidade.pacotesValor),
            percentualDe(fidelidade.pacotesValor, totalFidelidade),
            num(fidelidade.pacotesContratos),
            medio(fidelidade.pacotesValor, fidelidade.pacotesContratos)
          ]
        },
        {
          cels: [
            txt('Avulsos (atendimentos)'),
            moeda(fidelidade.avulsosValor),
            percentualDe(fidelidade.avulsosValor, totalFidelidade),
            num(fidelidade.avulsosAtendimentos),
            medio(fidelidade.avulsosValor, fidelidade.avulsosAtendimentos)
          ]
        },
        {
          cels: [
            txt('Total'),
            moeda(totalFidelidade),
            totalFidelidade > 0 ? pct(100) : txt('-'),
            num(fidelidade.pacotesContratos + fidelidade.avulsosAtendimentos),
            txt('')
          ],
          negrito: true
        }
      ]
    });
  }

  // --- 6. Fluxo diario --------------------------------------------------------
  let acumulado = 0;
  const linhasFluxo: LinhaRel[] = fluxoDiario.map((d) => {
    acumulado += d.lucro;
    return { cels: [txt(fmtData(d.bucket)), moeda(d.receita), moeda(d.custo), moeda(d.lucro), moeda(acumulado)] };
  });
  if (fluxoDiario.length > 0) {
    linhasFluxo.push({
      cels: [
        txt('Total'),
        moeda(soma(fluxoDiario.map((d) => d.receita))),
        moeda(soma(fluxoDiario.map((d) => d.custo))),
        moeda(soma(fluxoDiario.map((d) => d.lucro))),
        txt('')
      ],
      negrito: true
    });
  }
  secoes.push({
    titulo: 'Fluxo financeiro diário',
    cabecalho: ['Data', 'Entradas', 'Saídas', 'Resultado', 'Resultado acumulado'],
    linhas: linhasOuVazio(linhasFluxo, 5)
  });

  return { titulo: 'Relatório Financeiro', meta, secoes };
};

// ---------------------------------------------------------------------------
// Saida: CSV (abre direto no Excel em pt-BR: separador ";", decimal ",", BOM)
// ---------------------------------------------------------------------------

const fmtCsv = (c: Cel): string => {
  switch (c.k) {
    case 'txt':
      return c.v;
    case 'moeda':
      return c.v.toFixed(2).replace('.', ',');
    case 'pct':
      return `${fmtNumBR(c.v, 1)}%`;
    case 'num':
      return String(c.v);
  }
};

const escCsv = (s: string) => (/[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const baixarBlob = (blob: Blob, nomeArquivo: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const nomeBaseArquivo = (filtros: RelatorioFinanceiroEntrada['filtros']) =>
  `relatorio-financeiro_${filtros.dataInicio}_a_${filtros.dataFim}`;

export const relatorioParaCsv = (rel: RelatorioMontado): string => {
  const linhas: string[] = [escCsv(rel.titulo), ...rel.meta.map(escCsv), ''];
  rel.secoes.forEach((secao) => {
    linhas.push(escCsv(secao.titulo));
    linhas.push(secao.cabecalho.map(escCsv).join(';'));
    secao.linhas.forEach((l) => linhas.push(l.cels.map((c) => escCsv(fmtCsv(c))).join(';')));
    linhas.push('');
  });
  return linhas.join('\r\n');
};

export const baixarRelatorioFinanceiroCsv = (entrada: RelatorioFinanceiroEntrada) => {
  const csv = relatorioParaCsv(montarRelatorioFinanceiro(entrada));
  baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${nomeBaseArquivo(entrada.filtros)}.csv`);
};

// ---------------------------------------------------------------------------
// Saida: PDF (A4 retrato, tabelas por secao, paginacao automatica)
// ---------------------------------------------------------------------------

const fmtPdf = (c: Cel): string => {
  switch (c.k) {
    case 'txt':
      return c.v;
    case 'moeda':
      return formatCurrencyBR(c.v);
    case 'pct':
      return `${fmtNumBR(c.v, 1)}%`;
    case 'num':
      return fmtNumBR(c.v, 0);
  }
};

const fracaoPrimeiraColuna = (colunas: number) => (colunas <= 2 ? 0.62 : colunas === 3 ? 0.46 : colunas === 4 ? 0.34 : 0.26);

export const relatorioParaPdf = (rel: RelatorioMontado): jsPDF => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const margemX = 14;
  const topo = 16;
  const rodape = 16;
  const larguraUtil = largura - margemX * 2;
  const alturaLinha = 6;
  let y = topo;

  const novaPagina = () => {
    pdf.addPage();
    y = topo;
  };

  const cortar = (texto: string, larguraMax: number) => {
    if (pdf.getTextWidth(texto) <= larguraMax) return texto;
    let t = texto;
    while (t.length > 1 && pdf.getTextWidth(`${t}...`) > larguraMax) t = t.slice(0, -1);
    return `${t}...`;
  };

  // Titulo + metadados
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(15, 23, 42);
  pdf.text(rel.titulo, margemX, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  rel.meta.forEach((linha) => {
    pdf.splitTextToSize(linha, larguraUtil).forEach((parte: string) => {
      pdf.text(parte, margemX, y);
      y += 4.5;
    });
  });
  y += 4;

  rel.secoes.forEach((secao) => {
    const colunas = secao.cabecalho.length;
    const primeira = larguraUtil * fracaoPrimeiraColuna(colunas);
    const demais = colunas > 1 ? (larguraUtil - primeira) / (colunas - 1) : 0;
    const larguras = secao.cabecalho.map((_, i) => (i === 0 ? primeira : demais));
    const xColuna = (i: number) => margemX + larguras.slice(0, i).reduce((a, b) => a + b, 0);

    const desenharCabecalho = () => {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margemX, y - 4.2, larguraUtil, alturaLinha + 0.6, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      secao.cabecalho.forEach((rotulo, i) => {
        if (i === 0) pdf.text(cortar(rotulo, larguras[i] - 4), xColuna(i) + 2, y);
        else pdf.text(cortar(rotulo, larguras[i] - 4), xColuna(i) + larguras[i] - 2, y, { align: 'right' });
      });
      y += alturaLinha;
    };

    // Nao deixa o titulo da secao sozinho no fim da pagina
    if (y + 10 + alturaLinha * 3 > altura - rodape) novaPagina();

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(secao.titulo, margemX, y);
    pdf.setDrawColor(0, 191, 165);
    pdf.setLineWidth(0.6);
    pdf.line(margemX, y + 1.6, margemX + 12, y + 1.6);
    y += 8;
    desenharCabecalho();

    secao.linhas.forEach((linha, idx) => {
      if (y + alturaLinha > altura - rodape) {
        novaPagina();
        desenharCabecalho();
      }
      if (idx % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(margemX, y - 4.2, larguraUtil, alturaLinha, 'F');
      }
      if (linha.negrito) {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.3);
        pdf.line(margemX, y - 4.2, margemX + larguraUtil, y - 4.2);
      }
      pdf.setFont('helvetica', linha.negrito ? 'bold' : 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      linha.cels.forEach((cel, i) => {
        const texto = cortar(fmtPdf(cel), larguras[i] - 4);
        if (i === 0) pdf.text(texto, xColuna(i) + 2, y);
        else pdf.text(texto, xColuna(i) + larguras[i] - 2, y, { align: 'right' });
      });
      y += alturaLinha;
    });

    y += 6;
  });

  // Rodape com numero de pagina em todas as paginas
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Igui Banho e Tosa - Relatório Financeiro', margemX, altura - 8);
    pdf.text(`Página ${p} de ${totalPaginas}`, largura - margemX, altura - 8, { align: 'right' });
  }

  return pdf;
};

export const baixarRelatorioFinanceiroPdf = (entrada: RelatorioFinanceiroEntrada) => {
  relatorioParaPdf(montarRelatorioFinanceiro(entrada)).save(`${nomeBaseArquivo(entrada.filtros)}.pdf`);
};
