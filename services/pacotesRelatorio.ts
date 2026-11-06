import jsPDF from 'jspdf';
import { formatCurrencyBR } from './appointmentTotals';

// Relatorio de analise dos pacotes ativos da unidade: uma linha por pacote com
// valor, tipo (semanal/quinzenal), banhos, desconto, preco por banho, ciclos de
// renovacao e historico do cliente -- para estudar reajustes e adequacoes.
// Trabalha so com os dados que a tela de Pacotes ja carregou (nao consulta o banco).
// Autocontido de proposito: nao depende de componentes nem de outros relatorios.

export interface PacotesRelatorioEntrada {
  unidadeNome: string;
  /** Todos os pacotes da unidade (inclusive finalizados: servem para contar ciclos e tempo de casa). */
  pacotes: any[];
  /** Data de hoje (yyyy-mm-dd) no fuso de Sao Paulo. */
  hoje: string;
}

export interface LinhaPacoteRel {
  pet: string;
  tutor: string;
  telefone: string;
  raca: string;
  porte: string;
  tipo: string;
  banhosPacote: number;
  banhosFeitos: number;
  banhosRestantes: number;
  valorPacote: number;
  valorTransporte: number;
  valorBanhos: number;
  precoPorBanho: number;
  descontoValor: number;
  descontoPct: number | null;
  cicloAtual: number;
  pacotesContratados: number;
  clienteDesde: string; // yyyy-mm-dd ou ''
  mesesComoCliente: number | null;
  inicioCicloAtual: string;
  ultimoBanho: string;
  proximoBanho: string;
  pagamento: string;
  formaPagamento: string;
  servicos: string;
  petTaxi: string;
  status: string;
  renovacaoAutomatica: string;
  diaPreferido: string;
}

// ---------------------------------------------------------------------------
// Regras (espelham as da tela de Pacotes)
// ---------------------------------------------------------------------------

const norm = (v: any) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (v: any) => Number.parseFloat(String(v ?? 0)) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

const finalizado = (s: any) => ['finalizado', 'finalizada', 'concluido', 'concluida'].includes(norm(s));
const cancelado = (s: any) => ['cancelado', 'cancelada'].includes(norm(s));

const ordenarAgenda = (p: any): any[] =>
  [...(p.agendamentos || [])].sort((a, b) =>
    `${a.data_agendamento || ''} ${a.horario_inicio || ''}`.localeCompare(`${b.data_agendamento || ''} ${b.horario_inicio || ''}`)
  );

const feitos = (p: any) => ordenarAgenda(p).filter((a) => finalizado(a.status)).length;
const restantes = (p: any) => Math.max(0, (p.qtd_sessoes || 0) - feitos(p));

const statusPacote = (p: any): 'Ativo' | 'A vencer' | 'Finalizado' | 'Cancelado' => {
  const s = norm(p.status);
  const rest = restantes(p);
  if (s.includes('cancel')) return 'Cancelado';
  if (s.includes('final') || s.includes('conclu') || rest === 0) return 'Finalizado';
  if (rest <= 2 && p.ativo !== false) return 'A vencer';
  return p.ativo === false ? 'Finalizado' : 'Ativo';
};

const ativo = (p: any) => {
  const s = statusPacote(p);
  return s === 'Ativo' || s === 'A vencer';
};

const tipoPacote = (p: any): string => {
  const nome = norm(p.nome_pacote || p.nome);
  if (nome.includes('mensal')) return 'Mensal';
  const intervalo = Number(p.intervalo_dias) || 0;
  if (intervalo === 7) return 'Semanal';
  if (intervalo === 14) return 'Quinzenal';
  if (nome.includes('semanal')) return 'Semanal';
  if (nome.includes('quinzenal')) return 'Quinzenal';
  if (p.qtd_sessoes === 4) return 'Semanal';
  if (p.qtd_sessoes === 2) return 'Quinzenal';
  return `${p.qtd_sessoes || 0} sessões`;
};

const pagamento = (p: any): string => {
  if (p.pago === true || p.pago === 'true') return 'Pago';
  if (num(p.valor_pagamento_2) > 0 || num(p.valor_pago) > 0) return 'Parcial';
  return 'Pendente';
};

const dataBanho = (a: any) => (a.data_fim_real ? String(a.data_fim_real).substring(0, 10) : String(a.data_agendamento || ''));

const servicosDoPacote = (p: any): string[] => {
  const nomes = new Set<string>();
  (p.agendamentos || []).forEach((a: any) => {
    (a.agendamento_itens || []).forEach((item: any) => {
      const nome = item?.servicos?.nome || item?.descricao;
      if (nome && !item.eh_extra && norm(item.tipo) !== 'adicional') nomes.add(String(nome));
    });
  });
  return Array.from(nomes);
};

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const mesesEntre = (de: string, ate: string): number | null => {
  if (!de || !ate) return null;
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = ate.split('-').map(Number);
  if (!y1 || !y2) return null;
  let meses = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  return Math.max(0, meses);
};

const menorData = (datas: string[]): string => {
  const validas = datas.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return validas[0] || '';
};

export const montarLinhasPacotes = (entrada: PacotesRelatorioEntrada): LinhaPacoteRel[] => {
  const { pacotes, hoje } = entrada;

  // Historico por pet (ciclos e tempo de casa) olhando todos os pacotes nao cancelados.
  const porPet = new Map<string, any[]>();
  pacotes.forEach((p) => {
    if (statusPacote(p) === 'Cancelado') return;
    const chave = String(p.pet_id ?? p.pets?.id ?? '');
    if (!chave) return;
    if (!porPet.has(chave)) porPet.set(chave, []);
    porPet.get(chave)!.push(p);
  });

  return pacotes
    .filter(ativo)
    .map((p): LinhaPacoteRel => {
      const agenda = ordenarAgenda(p);
      const total = p.qtd_sessoes || 0;
      const valorPacote = r2(num(p.valor_total));
      const transporte = r2(num(p.valor_transporte));
      const valorBanhos = r2(Math.max(0, valorPacote - transporte));
      const desconto = r2(num(p.valor_desconto));
      const cheio = valorBanhos + desconto;

      const historico = porPet.get(String(p.pet_id ?? p.pets?.id ?? '')) || [p];
      const datasHistorico: string[] = [];
      historico.forEach((h) => {
        if (h.data_inicio) datasHistorico.push(String(h.data_inicio).substring(0, 10));
        ordenarAgenda(h).forEach((a) => datasHistorico.push(String(a.data_agendamento || '')));
        if (h.created_at) datasHistorico.push(String(h.created_at).substring(0, 10));
      });
      const clienteDesde = menorData(datasHistorico);

      const feitosLista = agenda.filter((a) => finalizado(a.status));
      const ultimo = feitosLista.map(dataBanho).sort().pop() || '';
      const proximo = agenda.find((a) => !finalizado(a.status) && !cancelado(a.status) && String(a.data_agendamento) >= hoje);
      const inicioCiclo = menorData([p.data_inicio ? String(p.data_inicio).substring(0, 10) : '', ...agenda.map((a) => String(a.data_agendamento || ''))]);

      const forma = [p.forma_pagamento, num(p.valor_pagamento_2) > 0 ? p.forma_pagamento_2 : '']
        .filter(Boolean)
        .join(' + ');

      const dia = p.dia_semana_preferido;

      return {
        pet: p.pets?.nome || 'Pet sem nome',
        tutor: p.clientes?.nome || 'Não informado',
        telefone: p.clientes?.telefone || '',
        raca: p.pets?.raca || '',
        porte: p.pets?.porte || '',
        tipo: tipoPacote(p),
        banhosPacote: total,
        banhosFeitos: feitos(p),
        banhosRestantes: restantes(p),
        valorPacote,
        valorTransporte: transporte,
        valorBanhos,
        precoPorBanho: total > 0 ? r2(valorBanhos / total) : 0,
        descontoValor: desconto,
        descontoPct: desconto > 0 && cheio > 0 ? Math.round((desconto / cheio) * 1000) / 10 : desconto > 0 ? null : 0,
        cicloAtual: Number(p.ciclo_renovacao) || 1,
        pacotesContratados: historico.length,
        clienteDesde,
        mesesComoCliente: mesesEntre(clienteDesde, hoje),
        inicioCicloAtual: inicioCiclo,
        ultimoBanho: ultimo,
        proximoBanho: proximo ? String(proximo.data_agendamento) : '',
        pagamento: pagamento(p),
        formaPagamento: forma,
        servicos: servicosDoPacote(p).join(', '),
        petTaxi: transporte > 0 || agenda.some((a) => a.tem_taxi) ? 'Sim' : 'Não',
        status: statusPacote(p),
        renovacaoAutomatica: p.renovacao_automatica ? 'Sim' : 'Não',
        diaPreferido: dia === null || dia === undefined || dia === '' ? '' : DIAS[Number(dia)] || ''
      };
    })
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.pet.localeCompare(b.pet, 'pt-BR'));
};

// ---------------------------------------------------------------------------
// Resumo por tipo (usado no PDF e para contexto de analise)
// ---------------------------------------------------------------------------

export interface ResumoTipo {
  tipo: string;
  pacotes: number;
  banhosPorPacote: number;
  ticketMedio: number;
  precoBanhoMin: number;
  precoBanhoMedio: number;
  precoBanhoMax: number;
  descontoMedioPct: number;
  comDesconto: number;
  cicloMedio: number;
  abaixoDaMedia: number;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const resumirPorTipo = (linhas: LinhaPacoteRel[]): ResumoTipo[] => {
  const tipos = Array.from(new Set(linhas.map((l) => l.tipo))).sort();
  return tipos.map((tipo) => {
    const grupo = linhas.filter((l) => l.tipo === tipo);
    const precos = grupo.map((l) => l.precoPorBanho);
    const precoMedio = media(precos);
    const pcts = grupo.map((l) => l.descontoPct).filter((v): v is number => v !== null);
    return {
      tipo,
      pacotes: grupo.length,
      banhosPorPacote: r2(media(grupo.map((l) => l.banhosPacote))),
      ticketMedio: r2(media(grupo.map((l) => l.valorPacote))),
      precoBanhoMin: r2(Math.min(...precos)),
      precoBanhoMedio: r2(precoMedio),
      precoBanhoMax: r2(Math.max(...precos)),
      descontoMedioPct: Math.round(media(pcts) * 10) / 10,
      comDesconto: grupo.filter((l) => l.descontoValor > 0).length,
      cicloMedio: Math.round(media(grupo.map((l) => l.cicloAtual)) * 10) / 10,
      abaixoDaMedia: grupo.filter((l) => l.precoPorBanho < precoMedio - 0.005).length
    };
  });
};

// ---------------------------------------------------------------------------
// Formatacao
// ---------------------------------------------------------------------------

const fmtData = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const moedaCsv = (v: number) => v.toFixed(2).replace('.', ',');
const decimalCsv = (v: number) => String(v).replace('.', ',');

const geradoEmTexto = () =>
  new Date()
    .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(', ', ' às ');

const nomeArquivo = (hoje: string, ext: 'pdf' | 'csv') => `relatorio-pacotes-ativos_${hoje}.${ext}`;

// ---------------------------------------------------------------------------
// CSV (planilha completa para analise no Excel)
// ---------------------------------------------------------------------------

const COLUNAS_CSV: { titulo: string; valor: (l: LinhaPacoteRel) => string }[] = [
  { titulo: 'Pet', valor: (l) => l.pet },
  { titulo: 'Tutor', valor: (l) => l.tutor },
  { titulo: 'Telefone', valor: (l) => l.telefone },
  { titulo: 'Raça', valor: (l) => l.raca },
  { titulo: 'Porte', valor: (l) => l.porte },
  { titulo: 'Tipo do pacote', valor: (l) => l.tipo },
  { titulo: 'Banhos no pacote', valor: (l) => String(l.banhosPacote) },
  { titulo: 'Banhos realizados', valor: (l) => String(l.banhosFeitos) },
  { titulo: 'Banhos restantes', valor: (l) => String(l.banhosRestantes) },
  { titulo: 'Valor do pacote (R$)', valor: (l) => moedaCsv(l.valorPacote) },
  { titulo: 'Transporte incluso (R$)', valor: (l) => moedaCsv(l.valorTransporte) },
  { titulo: 'Valor só dos banhos (R$)', valor: (l) => moedaCsv(l.valorBanhos) },
  { titulo: 'Preço por banho (R$)', valor: (l) => moedaCsv(l.precoPorBanho) },
  { titulo: 'Desconto concedido (R$)', valor: (l) => moedaCsv(l.descontoValor) },
  { titulo: 'Desconto (%)', valor: (l) => (l.descontoPct === null ? '' : decimalCsv(l.descontoPct)) },
  { titulo: 'Ciclo atual', valor: (l) => String(l.cicloAtual) },
  { titulo: 'Pacotes já contratados', valor: (l) => String(l.pacotesContratados) },
  { titulo: 'Cliente de pacote desde', valor: (l) => fmtData(l.clienteDesde) },
  { titulo: 'Meses como cliente', valor: (l) => (l.mesesComoCliente === null ? '' : String(l.mesesComoCliente)) },
  { titulo: 'Início do ciclo atual', valor: (l) => fmtData(l.inicioCicloAtual) },
  { titulo: 'Último banho', valor: (l) => fmtData(l.ultimoBanho) },
  { titulo: 'Próximo banho', valor: (l) => fmtData(l.proximoBanho) },
  { titulo: 'Dia preferido', valor: (l) => l.diaPreferido },
  { titulo: 'Serviços', valor: (l) => l.servicos },
  { titulo: 'Pet táxi', valor: (l) => l.petTaxi },
  { titulo: 'Pagamento', valor: (l) => l.pagamento },
  { titulo: 'Forma de pagamento', valor: (l) => l.formaPagamento },
  { titulo: 'Renovação automática', valor: (l) => l.renovacaoAutomatica },
  { titulo: 'Situação', valor: (l) => l.status }
];

const celCsv = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const pacotesParaCsv = (entrada: PacotesRelatorioEntrada): string => {
  const linhas = montarLinhasPacotes(entrada);
  const cab = COLUNAS_CSV.map((c) => celCsv(c.titulo)).join(';');
  const corpo = linhas.map((l) => COLUNAS_CSV.map((c) => celCsv(c.valor(l))).join(';'));
  return [cab, ...corpo].join('\r\n');
};

const baixarBlob = (blob: Blob, nome: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const baixarPacotesCsv = (entrada: PacotesRelatorioEntrada) => {
  const csv = pacotesParaCsv(entrada);
  baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), nomeArquivo(entrada.hoje, 'csv'));
};

// ---------------------------------------------------------------------------
// PDF (visao geral + lista, A4 paisagem)
// ---------------------------------------------------------------------------

const TEAL: [number, number, number] = [0, 137, 123];
const CINZA_TXT: [number, number, number] = [71, 85, 105];
const ZEBRA: [number, number, number] = [245, 248, 250];

export const pacotesParaPdf = (entrada: PacotesRelatorioEntrada): jsPDF => {
  const linhas = montarLinhasPacotes(entrada);
  const resumo = resumirPorTipo(linhas);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const M = 10;
  const util = W - M * 2;
  let y = M + 6;

  const cortar = (texto: string, largura: number) => {
    let t = texto;
    if (doc.getTextWidth(t) <= largura) return t;
    while (t.length > 1 && doc.getTextWidth(t + '…') > largura) t = t.slice(0, -1);
    return t + '…';
  };

  const titulo = (txt: string) => {
    if (y > H - 30) { doc.addPage(); y = M + 6; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(txt, M, y);
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.5);
    doc.line(M, y + 1.6, M + util, y + 1.6);
    y += 7;
  };

  type Col = { t: string; w: number; a?: 'left' | 'right' };
  const tabela = (cols: Col[], dados: string[][], opcoes?: { negritoUltima?: boolean; largura?: number }) => {
    const larguraTab = opcoes?.largura ?? util;
    const soma = cols.reduce((s, c) => s + c.w, 0);
    const esc = larguraTab / soma;
    const larg = cols.map((c) => c.w * esc);
    const xs: number[] = [];
    larg.reduce((acc, w, i) => { xs[i] = M + acc; return acc + w; }, 0);
    const alt = 5.6;

    const cabecalho = () => {
      doc.setFillColor(...TEAL);
      doc.rect(M, y - 4, larguraTab, alt, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      cols.forEach((c, i) => {
        const txt = cortar(c.t, larg[i] - 3);
        if (c.a === 'right') doc.text(txt, xs[i] + larg[i] - 1.5, y, { align: 'right' });
        else doc.text(txt, xs[i] + 1.5, y);
      });
      y += alt;
    };

    cabecalho();
    dados.forEach((linha, idx) => {
      if (y > H - 14) { doc.addPage(); y = M + 6; cabecalho(); }
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(M, y - 4, larguraTab, alt, 'F');
      }
      const ultima = opcoes?.negritoUltima && idx === dados.length - 1;
      doc.setFont('helvetica', ultima ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      cols.forEach((c, i) => {
        const txt = cortar(linha[i] ?? '', larg[i] - 3);
        if (c.a === 'right') doc.text(txt, xs[i] + larg[i] - 1.5, y, { align: 'right' });
        else doc.text(txt, xs[i] + 1.5, y);
      });
      y += alt;
    });
    y += 4;
  };

  // --- Cabecalho ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(30, 41, 59);
  doc.text('Relatório de Pacotes Ativos', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_TXT);
  doc.text(`Unidade: ${entrada.unidadeNome}   |   Posição em ${fmtData(entrada.hoje)}   |   Gerado em ${geradoEmTexto()}`, M, y);
  y += 5;
  doc.text('Considera os pacotes ativos e a vencer. Preço por banho = valor do pacote sem o transporte, dividido pelo nº de banhos.', M, y);
  y += 9;

  // --- Panorama geral ---
  const totalPacotes = linhas.length;
  const valorTotal = linhas.reduce((s, l) => s + l.valorPacote, 0);
  const banhosRest = linhas.reduce((s, l) => s + l.banhosRestantes, 0);
  const comDesc = linhas.filter((l) => l.descontoValor > 0).length;
  const descTotal = linhas.reduce((s, l) => s + l.descontoValor, 0);
  const pendentes = linhas.filter((l) => l.pagamento !== 'Pago').length;
  const aVencer = linhas.filter((l) => l.status === 'A vencer').length;

  titulo('Panorama geral');
  tabela(
    [{ t: 'Indicador', w: 5 }, { t: 'Valor', w: 3, a: 'right' }],
    [
      ['Pacotes ativos', String(totalPacotes)],
      ['Valor total dos pacotes ativos', formatCurrencyBR(valorTotal)],
      ['Ticket médio por pacote', formatCurrencyBR(totalPacotes ? valorTotal / totalPacotes : 0)],
      ['Banhos ainda a realizar', String(banhosRest)],
      ['Pacotes para renovar (2 banhos ou menos)', String(aVencer)],
      ['Pacotes com desconto', `${comDesc} (${formatCurrencyBR(descTotal)} em descontos)`],
      ['Pagamentos em aberto (pendente ou parcial)', String(pendentes)]
    ],
    { largura: 150 }
  );

  // --- Por tipo ---
  titulo('Análise por tipo de pacote');
  tabela(
    [
      { t: 'Tipo', w: 2.2 },
      { t: 'Pacotes', w: 1.4, a: 'right' },
      { t: 'Banhos/pacote', w: 1.8, a: 'right' },
      { t: 'Ticket médio', w: 2, a: 'right' },
      { t: 'R$/banho mín.', w: 2, a: 'right' },
      { t: 'R$/banho médio', w: 2, a: 'right' },
      { t: 'R$/banho máx.', w: 2, a: 'right' },
      { t: 'Abaixo da média', w: 2, a: 'right' },
      { t: 'Com desconto', w: 1.8, a: 'right' },
      { t: 'Desc. médio', w: 1.6, a: 'right' },
      { t: 'Ciclo médio', w: 1.6, a: 'right' }
    ],
    resumo.length
      ? resumo.map((r) => [
          r.tipo,
          String(r.pacotes),
          String(r.banhosPorPacote).replace('.', ','),
          formatCurrencyBR(r.ticketMedio),
          formatCurrencyBR(r.precoBanhoMin),
          formatCurrencyBR(r.precoBanhoMedio),
          formatCurrencyBR(r.precoBanhoMax),
          String(r.abaixoDaMedia),
          String(r.comDesconto),
          `${String(r.descontoMedioPct).replace('.', ',')}%`,
          String(r.cicloMedio).replace('.', ',')
        ])
      : [['Sem pacotes ativos', '', '', '', '', '', '', '', '', '', '']]
  );

  // --- Lista ---
  doc.addPage();
  y = M + 6;
  titulo(`Pacotes ativos (${totalPacotes})`);
  tabela(
    [
      { t: 'Pet', w: 2.4 },
      { t: 'Tutor', w: 3 },
      { t: 'Tipo', w: 1.5 },
      { t: 'Banhos', w: 1.1, a: 'right' },
      { t: 'Feitos', w: 1.1, a: 'right' },
      { t: 'Valor pacote', w: 1.9, a: 'right' },
      { t: 'R$/banho', w: 1.7, a: 'right' },
      { t: 'Desc.', w: 1.5, a: 'right' },
      { t: 'Ciclo', w: 1, a: 'right' },
      { t: 'Pacotes', w: 1.2, a: 'right' },
      { t: 'Cliente desde', w: 1.9, a: 'right' },
      { t: 'Próx. banho', w: 1.9, a: 'right' },
      { t: 'Pagamento', w: 1.6 },
      { t: 'Táxi', w: 1 }
    ],
    linhas.length
      ? linhas.map((l) => [
          l.pet,
          l.tutor,
          l.tipo,
          String(l.banhosPacote),
          String(l.banhosFeitos),
          formatCurrencyBR(l.valorPacote),
          formatCurrencyBR(l.precoPorBanho),
          l.descontoValor > 0 ? formatCurrencyBR(l.descontoValor) : '-',
          String(l.cicloAtual),
          String(l.pacotesContratados),
          fmtData(l.clienteDesde) || '-',
          fmtData(l.proximoBanho) || 'Sem agenda',
          l.pagamento,
          l.petTaxi
        ])
      : [['Sem pacotes ativos', '', '', '', '', '', '', '', '', '', '', '', '', '']]
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TXT);
  doc.text('Para a análise completa (raça, porte, forma de pagamento, serviços etc.), baixe a planilha em Excel (CSV).', M, y);

  // --- Rodape ---
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Igui Banho e Tosa - Relatório de Pacotes', M, H - 6);
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 6, { align: 'right' });
  }

  return doc;
};

export const baixarPacotesPdf = (entrada: PacotesRelatorioEntrada) => {
  pacotesParaPdf(entrada).save(nomeArquivo(entrada.hoje, 'pdf'));
};
