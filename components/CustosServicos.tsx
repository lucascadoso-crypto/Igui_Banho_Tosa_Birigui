import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { registrarAtividade } from '../services/logger';
import { formatCurrencyBR, formatDecimalBR } from '../services/appointmentTotals';
import {
  ServicoComCusto,
  CustoServicoHistoricoItem,
  CustoTransporteAtual,
  RentabilidadeThresholds,
  fetchServicosComCustoAtual,
  fetchHistoricoCustoServico,
  salvarCustoServico,
  fetchCustoTransporteAtual,
  salvarCustoTransporte,
  fetchRentabilidadeThresholds,
  saveRentabilidadeThresholds
} from '../services/rentabilidade';

interface CustosServicosProps {
  supabaseClient: any;
  userProfile?: UserProfile;
}

interface EditingCusto {
  servicoId: number;
  nome: string;
  custoInsumos: string;
  custoMaoObra: string;
  custoOutros: string;
  custoTotal: string;
  usarDecomposicao: boolean;
}

const CustosServicos: React.FC<CustosServicosProps> = ({ supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo !== 'master';

  const [servicos, setServicos] = useState<ServicoComCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [editing, setEditing] = useState<EditingCusto | null>(null);
  const [saving, setSaving] = useState(false);

  const [historico, setHistorico] = useState<CustoServicoHistoricoItem[]>([]);
  const [historicoServicoNome, setHistoricoServicoNome] = useState<string | null>(null);

  const [transporte, setTransporte] = useState<CustoTransporteAtual | null>(null);
  const [editingTransporte, setEditingTransporte] = useState(false);
  const [transporteForm, setTransporteForm] = useState({ custoCombustivel: '', custoTempo: '', custoTotal: '', usarDecomposicao: false });

  const [thresholds, setThresholds] = useState<RentabilidadeThresholds>({ margemVerdeMin: 60, margemAmarelaMin: 30 });
  const [savingThresholds, setSavingThresholds] = useState(false);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const carregarTudo = async () => {
    setLoading(true);
    try {
      const [servicosData, transporteData, thresholdsData] = await Promise.all([
        fetchServicosComCustoAtual(supabaseClient),
        fetchCustoTransporteAtual(supabaseClient),
        fetchRentabilidadeThresholds(supabaseClient)
      ]);
      setServicos(servicosData);
      setTransporte(transporteData);
      setThresholds(thresholdsData);
    } catch (err: any) {
      console.error('Erro ao carregar custos:', err);
      showMsg('Falha ao carregar custos: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirEdicao = (s: ServicoComCusto) => {
    setEditing({
      servicoId: s.id,
      nome: s.nome,
      custoInsumos: '',
      custoMaoObra: '',
      custoOutros: '',
      custoTotal: String(s.custoAtual || ''),
      usarDecomposicao: false
    });
  };

  const somaDecomposicao = (edit: EditingCusto) =>
    (Number(edit.custoInsumos) || 0) + (Number(edit.custoMaoObra) || 0) + (Number(edit.custoOutros) || 0);

  const salvarEdicao = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const custoTotal = editing.usarDecomposicao ? somaDecomposicao(editing) : Number(editing.custoTotal) || 0;
      await salvarCustoServico(supabaseClient, {
        servicoId: editing.servicoId,
        custoInsumos: editing.usarDecomposicao ? Number(editing.custoInsumos) || 0 : null,
        custoMaoObra: editing.usarDecomposicao ? Number(editing.custoMaoObra) || 0 : null,
        custoOutros: editing.usarDecomposicao ? Number(editing.custoOutros) || 0 : null,
        custoTotal
      });

      registrarAtividade(
        null,
        userProfile?.email || 'sistema',
        'EDICAO_CUSTO_SERVICO',
        `Atualizou o custo de "${editing.nome}" para ${formatCurrencyBR(custoTotal)}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Custo atualizado!');
      setEditing(null);
      await carregarTudo();
    } catch (err: any) {
      console.error('Erro ao salvar custo:', err);
      showMsg('Erro ao salvar custo: ' + (err.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const verHistorico = async (s: ServicoComCusto) => {
    try {
      const data = await fetchHistoricoCustoServico(supabaseClient, s.id);
      setHistorico(data);
      setHistoricoServicoNome(s.nome);
    } catch (err: any) {
      console.error('Erro ao carregar histórico:', err);
      showMsg('Erro ao carregar histórico: ' + (err.message || ''), 'error');
    }
  };

  const abrirEdicaoTransporte = () => {
    setTransporteForm({
      custoCombustivel: transporte?.custoCombustivel != null ? String(transporte.custoCombustivel) : '',
      custoTempo: transporte?.custoTempo != null ? String(transporte.custoTempo) : '',
      custoTotal: transporte ? String(transporte.custoTotal) : '',
      usarDecomposicao: false
    });
    setEditingTransporte(true);
  };

  const salvarTransporte = async () => {
    setSaving(true);
    try {
      const custoTotal = transporteForm.usarDecomposicao
        ? (Number(transporteForm.custoCombustivel) || 0) + (Number(transporteForm.custoTempo) || 0)
        : Number(transporteForm.custoTotal) || 0;

      await salvarCustoTransporte(supabaseClient, {
        custoCombustivel: transporteForm.usarDecomposicao ? Number(transporteForm.custoCombustivel) || 0 : null,
        custoTempo: transporteForm.usarDecomposicao ? Number(transporteForm.custoTempo) || 0 : null,
        custoTotal
      });

      registrarAtividade(
        null,
        userProfile?.email || 'sistema',
        'EDICAO_CUSTO_TRANSPORTE',
        `Atualizou o custo de transporte/viagem para ${formatCurrencyBR(custoTotal)}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Custo de transporte atualizado!');
      setEditingTransporte(false);
      await carregarTudo();
    } catch (err: any) {
      console.error('Erro ao salvar custo de transporte:', err);
      showMsg('Erro ao salvar custo de transporte: ' + (err.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const salvarThresholds = async () => {
    setSavingThresholds(true);
    try {
      await saveRentabilidadeThresholds(supabaseClient, thresholds);
      showMsg('Thresholds de margem atualizados!');
    } catch (err: any) {
      console.error('Erro ao salvar thresholds:', err);
      showMsg('Erro ao salvar thresholds: ' + (err.message || ''), 'error');
    } finally {
      setSavingThresholds(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {message && (
        <div className={`fixed top-24 right-10 z-50 px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 text-white font-bold flex items-center space-x-2 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${message.type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}`}></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* Custo por serviço */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <header className="mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <i className="fa-solid fa-coins mr-3 text-indigo-500"></i>
            Custo Unitário por Serviço
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Custo estimado (insumos + mão de obra + outros) usado no módulo de Rentabilidade e no Dashboard. Alterar aqui não muda relatórios de períodos passados — o custo vigente na data de cada atendimento é preservado no histórico.
          </p>
        </header>

        {loading ? (
          <div className="py-12 text-center text-slate-300 font-bold italic">Carregando...</div>
        ) : servicos.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
            <p className="text-slate-400 font-medium">Nenhum serviço cadastrado ainda. Cadastre em Configurações → Serviços.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {servicos.map((s) => (
              <div key={s.id} className="bg-slate-50 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{s.nome}</p>
                  <p className="text-xs text-rose-600 font-bold">Custo atual: {formatCurrencyBR(s.custoAtual)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => verHistorico(s)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 text-xs font-black uppercase"
                  >
                    <i className="fa-solid fa-clock-rotate-left mr-1.5"></i> Histórico
                  </button>
                  {!isReadOnly && (
                    <button
                      onClick={() => abrirEdicao(s)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase hover:bg-indigo-700"
                    >
                      <i className="fa-solid fa-pen mr-1.5"></i> Editar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custo de transporte por viagem */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center">
              <i className="fa-solid fa-taxi mr-3 text-indigo-500"></i>
              Custo do Transporte (Táxi Dog) por Viagem
            </h3>
            <p className="text-slate-400 text-sm mt-1">Combustível + tempo, usado no cálculo de pacotes/serviços com transporte incluído.</p>
          </div>
          {!isReadOnly && (
            <button
              onClick={abrirEdicaoTransporte}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase hover:bg-indigo-700 shrink-0"
            >
              <i className="fa-solid fa-pen mr-1.5"></i> Editar
            </button>
          )}
        </header>
        <div className="bg-slate-50 p-5 rounded-2xl inline-block">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo atual por viagem</p>
          <p className="text-xl font-black text-rose-600">{loading ? '—' : formatCurrencyBR(transporte?.custoTotal ?? 0)}</p>
        </div>
      </div>

      {/* Thresholds de margem */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <header className="mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <i className="fa-solid fa-traffic-light mr-3 text-indigo-500"></i>
            Semáforo de Margem
          </h3>
          <p className="text-slate-400 text-sm mt-1">Define os limites usados na tela de Rentabilidade para colorir serviços e pacotes.</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
          <div className="space-y-2">
            <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Margem verde a partir de (%)</label>
            <input
              type="number" min={0} max={100} step="1"
              disabled={isReadOnly}
              value={thresholds.margemVerdeMin}
              onChange={(e) => setThresholds({ ...thresholds, margemVerdeMin: Number(e.target.value) })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-amber-600 uppercase tracking-wider">Margem amarela a partir de (%)</label>
            <input
              type="number" min={0} max={100} step="1"
              disabled={isReadOnly}
              value={thresholds.margemAmarelaMin}
              onChange={(e) => setThresholds({ ...thresholds, margemAmarelaMin: Number(e.target.value) })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 font-bold mt-3">Abaixo de {formatDecimalBR(thresholds.margemAmarelaMin, 0)}% é vermelho (margem baixa/prejuízo).</p>
        {!isReadOnly && (
          <button
            onClick={salvarThresholds}
            disabled={savingThresholds}
            className="mt-6 px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {savingThresholds ? 'Salvando...' : 'Salvar Thresholds'}
          </button>
        )}
      </div>

      {/* Modal: editar custo do serviço */}
      {editing && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden">
            <header className="bg-indigo-600 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black">Custo: {editing.nome}</h3>
                <p className="text-indigo-100 text-xs font-medium">Vale a partir de hoje. Histórico anterior é preservado.</p>
              </div>
              <button onClick={() => setEditing(null)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.usarDecomposicao}
                  onChange={(e) => setEditing({ ...editing, usarDecomposicao: e.target.checked })}
                />
                Detalhar por insumos / mão de obra / outros
              </label>

              {editing.usarDecomposicao ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Insumos / produtos</label>
                    <input type="number" min={0} step="0.01" value={editing.custoInsumos}
                      onChange={(e) => setEditing({ ...editing, custoInsumos: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Mão de obra proporcional</label>
                    <input type="number" min={0} step="0.01" value={editing.custoMaoObra}
                      onChange={(e) => setEditing({ ...editing, custoMaoObra: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Outros custos</label>
                    <input type="number" min={0} step="0.01" value={editing.custoOutros}
                      onChange={(e) => setEditing({ ...editing, custoOutros: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                  </div>
                  <p className="text-sm font-black text-slate-700">Total: {formatCurrencyBR(somaDecomposicao(editing))}</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">Custo total (R$)</label>
                  <input type="number" min={0} step="0.01" value={editing.custoTotal}
                    onChange={(e) => setEditing({ ...editing, custoTotal: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                </div>
              )}
            </div>
            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={saving} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase shadow-lg">
                {saving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal: editar custo de transporte */}
      {editingTransporte && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden">
            <header className="bg-indigo-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-lg font-black">Custo de transporte por viagem</h3>
              <button onClick={() => setEditingTransporte(false)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transporteForm.usarDecomposicao}
                  onChange={(e) => setTransporteForm({ ...transporteForm, usarDecomposicao: e.target.checked })}
                />
                Detalhar por combustível / tempo
              </label>
              {transporteForm.usarDecomposicao ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Combustível (R$)</label>
                    <input type="number" min={0} step="0.01" value={transporteForm.custoCombustivel}
                      onChange={(e) => setTransporteForm({ ...transporteForm, custoCombustivel: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Tempo (R$)</label>
                    <input type="number" min={0} step="0.01" value={transporteForm.custoTempo}
                      onChange={(e) => setTransporteForm({ ...transporteForm, custoTempo: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase">Custo total por viagem (R$)</label>
                  <input type="number" min={0} step="0.01" value={transporteForm.custoTotal}
                    onChange={(e) => setTransporteForm({ ...transporteForm, custoTotal: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold" />
                </div>
              )}
            </div>
            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEditingTransporte(false)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">
                Cancelar
              </button>
              <button onClick={salvarTransporte} disabled={saving} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase shadow-lg">
                {saving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal: histórico de custo */}
      {historicoServicoNome && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <header className="bg-slate-800 p-6 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black">Histórico de custo: {historicoServicoNome}</h3>
              <button onClick={() => setHistoricoServicoNome(null)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              {historico.length === 0 ? (
                <p className="text-center text-slate-300 font-bold italic py-8">Nenhum histórico encontrado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-2 pr-4 text-[10px] font-black text-slate-400 uppercase text-left">Vigente desde</th>
                      <th className="py-2 pr-4 text-[10px] font-black text-slate-400 uppercase text-right">Custo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h) => (
                      <tr key={h.id} className="border-b border-slate-50">
                        <td className="py-3 pr-4 font-bold text-slate-700">{h.vigenteDesde.split('-').reverse().join('/')}</td>
                        <td className="py-3 text-right font-black text-slate-800">{formatCurrencyBR(h.custoTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustosServicos;
