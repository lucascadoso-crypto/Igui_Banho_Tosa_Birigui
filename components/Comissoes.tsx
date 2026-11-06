import React, { useCallback, useEffect, useState } from 'react';
import { Unit, UserProfile } from '../types';
import { formatCurrencyBR } from '../services/appointmentTotals';
import {
  ComissaoFiltros,
  ComissaoAtendimento,
  ComissaoPorProfissional,
  ComissaoRegra,
  getFiltrosDefault,
  fetchComissoesPeriodo,
  agruparComissaoPorProfissional,
  exportarComissoesCsv,
  fetchComissaoRegras,
  excluirComissaoRegra
} from '../services/comissoes';
import { fetchFuncionariosAtivos, fetchCategorias, salvarLancamentoFolha, FuncionarioOpcao, CategoriaDespesa } from '../services/gastos';
import SectionTitle from './Dashboard/SectionTitle';
import CardSkeleton from './Dashboard/CardSkeleton';
import ComissaoRegraModal from './Comissoes/ComissaoRegraModal';

interface ComissoesProps {
  units: Unit[];
  supabaseClient: any;
  userProfile?: UserProfile;
}

const Comissoes: React.FC<ComissoesProps> = ({ units, supabaseClient, userProfile }) => {
  const [filtros, setFiltros] = useState<ComissaoFiltros>(() => getFiltrosDefault(units.length === 1 ? units[0].id : null));
  const [itens, setItens] = useState<ComissaoAtendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [profissionalExpandido, setProfissionalExpandido] = useState<number | null>(null);

  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [regras, setRegras] = useState<ComissaoRegra[]>([]);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [editandoRegra, setEditandoRegra] = useState<Partial<ComissaoRegra> | null | undefined>(undefined);
  const [lancandoDespesa, setLancandoDespesa] = useState<ComissaoPorProfissional | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetchComissoesPeriodo(supabaseClient, filtros)
      .then(setItens)
      .catch((err) => { console.error('Erro ao carregar comissões:', err); setErro(err?.message || 'Falha ao carregar comissões.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    fetchFuncionariosAtivos(supabaseClient, filtros.unidadeId).then(setFuncionarios).catch((err) => console.error('Erro ao carregar funcionários:', err));
  }, [supabaseClient, filtros.unidadeId]);

  useEffect(() => {
    fetchCategorias(supabaseClient).then(setCategorias).catch((err) => console.error('Erro ao carregar categorias:', err));
  }, [supabaseClient]);

  const carregarRegras = useCallback(() => {
    fetchComissaoRegras(supabaseClient, filtros.unidadeId).then(setRegras).catch((err) => console.error('Erro ao carregar regras de comissão:', err));
  }, [supabaseClient, filtros.unidadeId]);

  useEffect(() => { carregarRegras(); }, [carregarRegras]);

  const porProfissional = agruparComissaoPorProfissional(itens);
  const totalComissoes = itens.reduce((acc, i) => acc + i.valorComissao, 0);
  const totalServicos = itens.reduce((acc, i) => acc + i.valorServico, 0);

  const exportarCsv = () => {
    const csv = exportarComissoesCsv(itens);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes_${filtros.dataInicio}_a_${filtros.dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmarLancamentoDespesa = async () => {
    if (!lancandoDespesa || filtros.unidadeId === null) return;
    const categoriaFolha = categorias.find((c) => c.nome === 'Folha de pagamento');
    if (!categoriaFolha) { alert('Categoria "Folha de pagamento" não encontrada.'); return; }
    try {
      await salvarLancamentoFolha(supabaseClient, {
        funcionarioId: lancandoDespesa.funcionarioId,
        unidadeId: filtros.unidadeId,
        competencia: `${filtros.dataInicio.slice(0, 7)}-01`,
        salario: 0,
        adiantamento: 0,
        encargos: lancandoDespesa.totalComissao,
        categoriaId: categoriaFolha.id,
        status: 'pendente',
        funcionarioNome: lancandoDespesa.funcionarioNome
      });
      alert('Comissão lançada como despesa (Folha de pagamento) com sucesso.');
      setLancandoDespesa(null);
    } catch (err: any) {
      alert('Erro ao lançar despesa: ' + (err.message || ''));
    }
  };

  const unidadeSelecionadaNome = filtros.unidadeId !== null ? (units.find((u) => u.id === filtros.unidadeId)?.name ?? '') : 'Todas as unidades';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-5">
          <div className="w-14 h-14 bg-[#00BFA5]/10 text-[#00BFA5] rounded-2xl flex items-center justify-center text-2xl shrink-0">
            <i className="fa-solid fa-hand-holding-dollar"></i>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Comissões</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Apuração por profissional — {unidadeSelecionadaNome}</p>
          </div>
        </div>
        <button onClick={() => setRegrasAbertas(true)} className="bg-[#1E1E1E] hover:bg-black text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95">
          <i className="fa-solid fa-gear mr-2"></i> Gerenciar regras
        </button>
      </header>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</span>
            <select value={filtros.unidadeId ?? 'todas'} onChange={(e) => setFiltros((f) => ({ ...f, unidadeId: e.target.value === 'todas' ? null : Number(e.target.value) }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none">
              <option value="todas">Todas</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início</span>
            <input type="date" value={filtros.dataInicio} onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fim</span>
            <input type="date" value={filtros.dataFim} onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none" />
          </label>
        </div>
      </div>

      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de comissões</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatCurrencyBR(totalComissoes)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Base de serviços</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatCurrencyBR(totalServicos)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Profissionais com comissão</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : porProfissional.length}</p>
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle title="Total por profissional" subtitle="Clique para ver o detalhamento por atendimento" />
          <button onClick={exportarCsv} disabled={itens.length === 0} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40">
            <i className="fa-solid fa-file-csv mr-1.5"></i> Exportar CSV
          </button>
        </div>

        {loading ? <CardSkeleton height={220} /> : porProfissional.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-10">Nenhuma comissão apurada no período (verifique se há regras cadastradas e atendimentos finalizados com profissional).</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {porProfissional.map((p) => {
              const aberto = profissionalExpandido === p.funcionarioId;
              const detalhes = itens.filter((i) => i.funcionarioId === p.funcionarioId);
              return (
                <div key={p.funcionarioId} className="py-4">
                  <button onClick={() => setProfissionalExpandido(aberto ? null : p.funcionarioId)} className="w-full flex items-center justify-between gap-4 text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <i className={`fa-solid fa-chevron-${aberto ? 'down' : 'right'} text-slate-300 text-xs`}></i>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 truncate">{p.funcionarioNome}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{p.qtdAtendimentos} atendimento(s) · base {formatCurrencyBR(p.totalServicos)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-black text-[#00BFA5]">{formatCurrencyBR(p.totalComissao)}</span>
                      {userProfile?.cargo !== 'financeiro' && (
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); setLancandoDespesa(p); }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-black text-[10px] uppercase tracking-wide"
                        >
                          Lançar como despesa
                        </span>
                      )}
                    </div>
                  </button>

                  {aberto && (
                    <div className="mt-3 pl-7 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 font-black uppercase text-[9px] tracking-widest">
                            <th className="py-2">Data</th>
                            <th className="py-2">Pet</th>
                            <th className="py-2">Categoria</th>
                            <th className="py-2 text-right">Valor serviço</th>
                            <th className="py-2 text-right">Comissão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalhes.map((d) => (
                            <tr key={d.agendamentoId} className="border-t border-slate-50">
                              <td className="py-2 font-bold text-slate-500">{d.dataAtendimento.split('-').reverse().join('/')}</td>
                              <td className="py-2 font-bold text-slate-700">{d.petNome || '—'}</td>
                              <td className="py-2 font-bold text-slate-500 capitalize">{d.categoria}</td>
                              <td className="py-2 text-right font-bold text-slate-700">{formatCurrencyBR(d.valorServico)}</td>
                              <td className="py-2 text-right font-black text-[#00BFA5]">{formatCurrencyBR(d.valorComissao)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {regrasAbertas && (
        <div className="app-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <header className="bg-[#1E1E1E] p-6 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black">Regras de Comissão</h3>
              <button onClick={() => setRegrasAbertas(false)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-4 overflow-y-auto">
              <button
                onClick={() => setEditandoRegra(null)}
                disabled={filtros.unidadeId === null}
                className="text-[10px] font-black text-[#00BFA5] hover:text-emerald-800 uppercase tracking-widest disabled:opacity-40"
                title={filtros.unidadeId === null ? 'Selecione uma unidade específica para cadastrar uma regra' : ''}
              >
                <i className="fa-solid fa-plus mr-1.5"></i> Nova regra
              </button>

              {regras.length === 0 ? (
                <p className="text-center text-slate-300 font-bold italic py-8">Nenhuma regra cadastrada.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {regras.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700">
                          {r.funcionarioId ? funcionarios.find((f) => f.id === r.funcionarioId)?.nome || `Funcionário #${r.funcionarioId}` : 'Padrão da unidade'}
                          {' · '}{r.categoriaServico === 'todas' ? 'Todas as categorias' : r.categoriaServico}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
                          {r.tipo === 'percentual' ? `${r.valor}%` : formatCurrencyBR(r.valor)} · vigente desde {r.vigenteDesde.split('-').reverse().join('/')} {!r.ativo && '· inativa'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setEditandoRegra(r)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center">
                          <i className="fa-solid fa-pen text-xs"></i>
                        </button>
                        <button
                          onClick={() => { if (confirm('Excluir esta regra?')) excluirComissaoRegra(supabaseClient, r.id).then(carregarRegras); }}
                          className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editandoRegra !== undefined && filtros.unidadeId !== null && (
        <ComissaoRegraModal
          unidadeId={filtros.unidadeId}
          funcionarios={funcionarios}
          regra={editandoRegra}
          supabaseClient={supabaseClient}
          onClose={() => setEditandoRegra(undefined)}
          onSaved={carregarRegras}
        />
      )}

      {lancandoDespesa && (
        <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 space-y-4">
            <h3 className="text-lg font-black text-slate-800">Lançar como despesa?</h3>
            <p className="text-sm font-bold text-slate-500">
              Vai lançar <span className="text-slate-800">{formatCurrencyBR(lancandoDespesa.totalComissao)}</span> como despesa pendente (categoria Folha de pagamento) para <span className="text-slate-800">{lancandoDespesa.funcionarioNome}</span>, competência {filtros.dataInicio.slice(0, 7)}.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setLancandoDespesa(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase">Cancelar</button>
              <button onClick={confirmarLancamentoDespesa} className="flex-1 py-3 bg-[#00BFA5] text-white rounded-xl font-black text-xs uppercase">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Comissoes;
