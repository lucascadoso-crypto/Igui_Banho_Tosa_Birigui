
import React, { useMemo, useState } from 'react';
import { ReportColumn, exportReportToCsv, exportReportToPdf } from '../../services/reportExport';
import CardSkeleton from '../Dashboard/CardSkeleton';

export interface ReportTotalColumn {
  key: string;
  format?: (value: number) => string;
}

interface ReportTableProps {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  loading?: boolean;
  emptyMessage?: string;
  /** Colunas numéricas somadas no rodapé (ex: ['qtd', 'faturamento']). */
  totals?: ReportTotalColumn[];
  filenameBase: string;
}

type SortDir = 'asc' | 'desc';

const ReportTable: React.FC<ReportTableProps> = ({ title, subtitle, columns, rows, loading, emptyMessage, totals, filenameBase }) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const totaisCalculados = useMemo(() => {
    if (!totals) return null;
    const resultado: Record<string, number> = {};
    totals.forEach((t) => {
      resultado[t.key] = rows.reduce((s, r) => s + (Number(r[t.key]) || 0), 0);
    });
    return resultado;
  }, [rows, totals]);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-lg font-black text-slate-800">{title}</h3>
          {subtitle && <p className="text-slate-400 text-xs font-bold mt-1">{subtitle}</p>}
        </div>
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => exportReportToCsv(filenameBase, columns, sortedRows)}
              className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 hover:text-emerald-600 text-[10px] font-black uppercase tracking-widest"
            >
              <i className="fa-solid fa-file-csv mr-1.5"></i> CSV
            </button>
            <button
              onClick={() => exportReportToPdf(filenameBase, title, subtitle || '', columns, sortedRows)}
              className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest"
            >
              <i className="fa-solid fa-file-pdf mr-1.5"></i> PDF
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <CardSkeleton height={240} />
      ) : rows.length === 0 ? (
        <p className="text-center text-slate-300 font-bold italic py-12">{emptyMessage || 'Nenhum dado encontrado no período.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`py-3 ${c.align === 'right' ? 'text-right pl-4' : 'text-left pr-4'} text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer select-none hover:text-slate-600`}
                  >
                    {c.label}
                    {sortKey === c.key && <i className={`fa-solid fa-caret-${sortDir === 'asc' ? 'up' : 'down'} ml-1.5`}></i>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-3 ${c.align === 'right' ? 'text-right pl-4 font-black text-slate-800' : 'text-left pr-4 font-bold text-slate-700'}`}>
                      {c.format ? c.format(row[c.key]) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totaisCalculados && (
              <tfoot>
                <tr>
                  {columns.map((c, idx) => (
                    <td key={c.key} className={`py-3 ${c.align === 'right' ? 'text-right pl-4' : 'text-left pr-4'} font-black text-slate-900 uppercase text-xs`}>
                      {idx === 0 ? 'Total' : totaisCalculados[c.key] !== undefined ? (totals?.find((t) => t.key === c.key)?.format || c.format || String)(totaisCalculados[c.key]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportTable;
