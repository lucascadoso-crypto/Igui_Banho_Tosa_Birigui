import React, { useEffect, useState } from 'react';
import { Unit, UserProfile } from '../types';

interface CapacidadeUnidadesProps {
  supabaseClient: any;
  units: Unit[];
  userProfile?: UserProfile;
}

const DIAS = [
  { dow: 0, label: 'Dom' },
  { dow: 1, label: 'Seg' },
  { dow: 2, label: 'Ter' },
  { dow: 3, label: 'Qua' },
  { dow: 4, label: 'Qui' },
  { dow: 5, label: 'Sex' },
  { dow: 6, label: 'Sáb' }
];

type CapacidadePorUnidade = Record<string, Record<number, number>>;

const CapacidadeUnidades: React.FC<CapacidadeUnidadesProps> = ({ supabaseClient, units, userProfile }) => {
  const isReadOnly = userProfile?.cargo !== 'master';
  const [capacidades, setCapacidades] = useState<CapacidadePorUnidade>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const carregar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient.from('unidade_capacidade').select('unidade_id, dia_semana, capacidade');
      if (error) throw error;
      const porUnidade: CapacidadePorUnidade = {};
      (data || []).forEach((row: any) => {
        const key = String(row.unidade_id);
        if (!porUnidade[key]) porUnidade[key] = {};
        porUnidade[key][row.dia_semana] = row.capacidade;
      });
      setCapacidades(porUnidade);
    } catch (err: any) {
      console.error('Erro ao carregar capacidades:', err);
      showMsg('Falha ao carregar capacidades: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valorDe = (unidadeId: number | string, dow: number): number => capacidades[String(unidadeId)]?.[dow] ?? 0;

  const alterarValor = (unidadeId: number | string, dow: number, valor: number) => {
    setCapacidades((prev) => ({
      ...prev,
      [String(unidadeId)]: { ...(prev[String(unidadeId)] || {}), [dow]: valor }
    }));
  };

  const salvarUnidade = async (unidadeId: number | string) => {
    setSaving(String(unidadeId));
    try {
      const linhas = DIAS.map((d) => ({
        unidade_id: unidadeId,
        dia_semana: d.dow,
        capacidade: valorDe(unidadeId, d.dow)
      }));
      const { error } = await supabaseClient.from('unidade_capacidade').upsert(linhas, { onConflict: 'unidade_id,dia_semana' });
      if (error) throw error;
      showMsg('Capacidade atualizada!');
    } catch (err: any) {
      console.error('Erro ao salvar capacidade:', err);
      showMsg('Erro ao salvar capacidade: ' + (err.message || ''), 'error');
    } finally {
      setSaving(null);
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

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <header className="mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <i className="fa-solid fa-calendar-week mr-3 text-indigo-500"></i>
            Capacidade de Atendimentos por Dia da Semana
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Quantidade máxima de atendimentos por dia, usada no cálculo de ocupação do Dashboard Gerencial e no indicador da Agenda.
          </p>
        </header>

        {loading ? (
          <div className="py-12 text-center text-slate-300 font-bold italic">Carregando...</div>
        ) : units.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
            <p className="text-slate-400 font-medium">Nenhuma unidade cadastrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {units.map((unit) => (
              <div key={unit.id} className="bg-slate-50 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-bold text-slate-800">{unit.name}</p>
                  {!isReadOnly && (
                    <button
                      onClick={() => salvarUnidade(unit.id)}
                      disabled={saving === String(unit.id)}
                      className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving === String(unit.id) ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Salvar'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {DIAS.map((d) => (
                    <div key={d.dow}>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">{d.label}</label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        disabled={isReadOnly}
                        value={valorDe(unit.id, d.dow)}
                        onChange={(e) => alterarValor(unit.id, d.dow, Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-2.5 bg-white border border-slate-100 rounded-xl outline-none font-bold text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CapacidadeUnidades;
