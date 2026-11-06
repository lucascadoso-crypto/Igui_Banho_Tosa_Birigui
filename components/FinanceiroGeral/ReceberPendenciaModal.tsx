import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { ContaReceberPendencia } from '../../services/financeiroGeral';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { registrarPagamentoPacote, registrarRecebimentoAvulso, registrarRecebimentoExtra } from '../../services/pacotePayments';

interface ReceberPendenciaModalProps {
  pendencia: ContaReceberPendencia;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
  onReceived: () => void;
}

const FORMAS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Outro'];

const ReceberPendenciaModal: React.FC<ReceberPendenciaModalProps> = ({ pendencia, supabaseClient, userProfile, onClose, onReceived }) => {
  const [metodo1, setMetodo1] = useState('Pix');
  const [valor1, setValor1] = useState(pendencia.valor);
  const [dividir, setDividir] = useState(false);
  const [metodo2, setMetodo2] = useState('Dinheiro');
  const [valor2, setValor2] = useState(0);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const permiteDivisao = pendencia.origem !== 'adicional';

  const confirmar = async () => {
    if (valor1 <= 0) { setErro('Informe um valor principal maior que zero.'); return; }
    setSaving(true);
    setErro(null);
    try {
      if (pendencia.origem === 'pacote') {
        await registrarPagamentoPacote({
          supabaseClient,
          unitId: pendencia.unidadeId,
          pacoteId: pendencia.referenciaId,
          nomePacote: pendencia.descricao,
          petNome: pendencia.petNome || undefined,
          metodo1,
          valor1,
          dividirPagamento: dividir,
          metodo2: dividir ? metodo2 : undefined,
          valor2: dividir ? valor2 : undefined,
          userEmail: userProfile?.email,
          userNome: userProfile?.nome,
          userCargo: userProfile?.cargo
        });
      } else if (pendencia.origem === 'avulso') {
        await registrarRecebimentoAvulso({
          supabaseClient,
          unitId: pendencia.unidadeId,
          agendamentoId: pendencia.referenciaId,
          clienteId: pendencia.clienteId,
          petId: pendencia.petId,
          petNome: pendencia.petNome || undefined,
          dataAgendamento: pendencia.vencimento,
          metodo1,
          valor1,
          metodo2: dividir ? metodo2 : undefined,
          valor2: dividir ? valor2 : undefined,
          userEmail: userProfile?.email,
          userNome: userProfile?.nome,
          userCargo: userProfile?.cargo
        });
      } else {
        await registrarRecebimentoExtra({
          supabaseClient,
          unitId: pendencia.unidadeId,
          agendamentoId: pendencia.referenciaId,
          petNome: pendencia.petNome || undefined,
          metodo: metodo1,
          valor: valor1,
          userEmail: userProfile?.email,
          userNome: userProfile?.nome,
          userCargo: userProfile?.cargo
        });
      }

      onReceived();
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao registrar o recebimento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden">
        <header className="bg-[#00BFA5] p-6 text-white">
          <h3 className="text-lg font-black">Receber pendência</h3>
          <p className="text-white/80 text-xs font-bold truncate">{pendencia.clienteNome} — {pendencia.descricao}</p>
          <p className="text-white text-2xl font-black tracking-tighter mt-2">{formatCurrencyBR(pendencia.valor)}</p>
        </header>

        <div className="p-6 space-y-4">
          {erro && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl">{erro}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</label>
              <input
                type="number" step="0.01" value={valor1}
                onChange={(e) => setValor1(Number.parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de pagamento</label>
              <select value={metodo1} onChange={(e) => setMetodo1(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
                {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {permiteDivisao && (
            <>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <input type="checkbox" checked={dividir} onChange={(e) => setDividir(e.target.checked)} />
                Dividir pagamento em duas formas
              </label>

              {dividir && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor 2</label>
                    <input
                      type="number" step="0.01" value={valor2}
                      onChange={(e) => setValor2(Number.parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma 2</label>
                    <select value={metodo2} onChange={(e) => setMetodo2(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none">
                      {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase text-slate-500">Cancelar</button>
          <button onClick={confirmar} disabled={saving} className="px-8 py-3 bg-[#00BFA5] text-white rounded-xl font-black text-[11px] uppercase disabled:opacity-50">
            {saving ? '...' : 'Confirmar Recebimento'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ReceberPendenciaModal;
