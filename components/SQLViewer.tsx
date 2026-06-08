
import React, { useState } from 'react';
import { generateSupabaseSQL } from '../services/sqlGenerator';

const SQLViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const sql = generateSupabaseSQL();

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Script SQL para Supabase</h2>
          <p className="text-slate-500">Estrutura completa do banco de dados PostgreSQL.</p>
        </div>
        <button
          onClick={handleCopy}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {copied ? 'Copiado!' : 'Copiar Script SQL'}
        </button>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 overflow-auto max-h-[600px] border border-slate-700">
        <pre className="text-indigo-300 font-mono text-sm leading-relaxed">
          {sql}
        </pre>
      </div>

      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-amber-400">⚠️</span>
          </div>
          <div className="ml-3">
            <p className="text-sm text-amber-700">
              <span className="font-bold">Regra de Ouro Implementada:</span> Todas as tabelas de movimentação (Agendamentos e Financeiro) possuem a coluna <code className="bg-amber-100 px-1 rounded font-bold">unidade_id</code> vinculada à tabela de Unidades para filtros eficientes por loja.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SQLViewer;
