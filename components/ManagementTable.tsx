
import React from 'react';

interface ManagementTableProps {
  title: string;
  columns: { key: string; label: string }[];
  data: any[];
  onAdd?: () => void;
}

const ManagementTable: React.FC<ManagementTableProps> = ({ title, columns, data, onAdd }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
        {onAdd && (
          <button
            onClick={onAdd}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
          >
            <span className="mr-2">+</span> Adicionar Novo
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className="px-6 py-4 text-sm text-slate-700 whitespace-nowrap">
                        {item[col.key]}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-right text-sm space-x-3">
                      <button className="text-indigo-600 hover:text-indigo-900 font-medium">Editar</button>
                      <button className="text-rose-600 hover:text-rose-900 font-medium">Excluir</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-8 text-center text-slate-400">
                    Nenhum registro encontrado para esta unidade.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ManagementTable;
