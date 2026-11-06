import jsPDF from 'jspdf';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Formata o valor cru da linha para exibição/exportação (ex: moeda). */
  format?: (value: any) => string;
}

const valorExportavel = (col: ReportColumn, row: Record<string, any>): string => {
  const raw = row[col.key];
  if (col.format) return col.format(raw);
  if (raw === null || raw === undefined) return '';
  return String(raw);
};

const escapeCsvCell = (value: string): string => {
  if (/[",;\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

export const exportReportToCsv = (
  filename: string,
  columns: ReportColumn[],
  rows: Record<string, any>[]
) => {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(';');
  const linhas = rows.map((row) => columns.map((c) => escapeCsvCell(valorExportavel(c, row))).join(';'));
  const csv = [header, ...linhas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** PDF simples em grade de texto (sem plugin autotable), seguindo o mesmo padrão de jsPDF já usado em PacoteDetalhesModal.tsx. */
export const exportReportToPdf = (
  filename: string,
  titulo: string,
  subtitulo: string,
  columns: ReportColumn[],
  rows: Record<string, any>[]
) => {
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 12;
  const marginBottom = 14;
  let y = 16;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(titulo, marginX, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(subtitulo, marginX, y);
  y += 8;

  const colWidth = (pageWidth - marginX * 2) / columns.length;

  const drawHeader = () => {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    columns.forEach((c, idx) => {
      const x = marginX + idx * colWidth;
      pdf.text(c.label, c.align === 'right' ? x + colWidth - 2 : x + 1, y, c.align === 'right' ? { align: 'right' } : undefined);
    });
    y += 5;
    pdf.setDrawColor(200);
    pdf.line(marginX, y - 3, pageWidth - marginX, y - 3);
    pdf.setFont('helvetica', 'normal');
  };

  drawHeader();

  rows.forEach((row) => {
    if (y > pageHeight - marginBottom) {
      pdf.addPage();
      y = 16;
      drawHeader();
    }
    columns.forEach((c, idx) => {
      const x = marginX + idx * colWidth;
      const texto = valorExportavel(c, row).slice(0, 40);
      pdf.text(texto, c.align === 'right' ? x + colWidth - 2 : x + 1, y, c.align === 'right' ? { align: 'right' } : undefined);
    });
    y += 5.5;
  });

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
};
