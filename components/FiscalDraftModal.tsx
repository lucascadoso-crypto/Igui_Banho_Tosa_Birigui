import React, { useEffect, useMemo, useState } from 'react';
import { Unit, UserProfile } from '../types';
import { avaliarChecklistFiscal, montarLinkCadastroWhatsapp } from '../services/fiscalValidation';

interface FiscalDraftModalProps {
  supabaseClient: any;
  unit: Unit;
  transaction: any;
  userProfile?: UserProfile;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_FISCAL_BASE_DESCRIPTION = 'Prestação de serviços de higiene, embelezamento e cuidados de animais domésticos.';
const DEFAULT_MUNICIPAL_SERVICE_CODE = '050801';
const DEFAULT_NBS_CODE = '11405600';

const FiscalDraftModal: React.FC<FiscalDraftModalProps> = ({ supabaseClient, unit, transaction, userProfile, onClose, onCreated }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceData, setSourceData] = useState<any>(null);
  const [description, setDescription] = useState('');
  const [competenceDate, setCompetenceDate] = useState('');
  const [fiscalServices, setFiscalServices] = useState<any[]>([]);
  const [configFiscal, setConfigFiscal] = useState<any>(null);
  const [error, setError] = useState('');

  const formatCurrency = (value: any) => `R$ ${Number(value || 0).toFixed(2)}`;

  useEffect(() => {
    loadSource();
  }, [transaction?.id]);

  const loadSource = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: configData } = await supabaseClient
        .from('config_fiscal_unidade')
        .select('*')
        .eq('unidade_id', unit.id)
        .maybeSingle();
      setConfigFiscal(configData || null);

      if (transaction.sourceTable === 'agendamentos') {
        const { data, error: fetchError } = await supabaseClient
          .from('agendamentos')
          .select(`
            *,
            clientes(*),
            pets(*),
            financeiro_movimentos(id, descricao, valor_total, status, origem, financeiro_pagamentos(id, valor, pago_em)),
            agendamento_itens(id, servico_id, valor_cobrado, servicos(id, nome, preco_base))
          `)
          .eq('id', transaction.originalData.id)
          .single();

        if (fetchError) throw fetchError;
        setSourceData(data);
        setCompetenceDate(data.data_agendamento || new Date().toISOString().slice(0, 10));
        setDescription(buildAppointmentDescription(data));
        await loadFiscalServices((data.agendamento_itens || []).map((item: any) => item.servico_id || item.servicos?.id).filter(Boolean));
      } else if (transaction.sourceTable === 'pacotes') {
        const { data, error: fetchError } = await supabaseClient
          .from('pacotes')
          .select('*, clientes(*), pets(*), servicos(id, nome, preco_base), financeiro_movimentos(id, descricao, valor_total, status, origem, financeiro_pagamentos(id, valor, pago_em))')
          .eq('id', transaction.originalData.id)
          .single();

        if (fetchError) throw fetchError;
        setSourceData(data);
        setCompetenceDate('');
        setDescription(buildPackageDescription(data));
        await loadFiscalServices([data.servico_id || data.servicos?.id].filter(Boolean));
      } else {
        throw new Error('Origem nao suportada para rascunho fiscal nesta fase.');
      }
    } catch (err: any) {
      console.error('Erro ao carregar origem fiscal:', err);
      setError(err.message || 'Falha ao carregar dados fiscais.');
    } finally {
      setLoading(false);
    }
  };

  const loadFiscalServices = async (serviceIds: number[]) => {
    if (!serviceIds.length) {
      setFiscalServices([]);
      return;
    }

    const { data, error: fiscalError } = await supabaseClient
      .from('servicos_fiscais')
      .select('*')
      .eq('unidade_id', unit.id)
      .in('servico_id', serviceIds);

    if (fiscalError) throw fiscalError;
    setFiscalServices(data || []);
  };

  const fiscalForService = (serviceId?: number) => {
    if (!serviceId) return null;
    return fiscalServices.find(item => Number(item.servico_id) === Number(serviceId));
  };

  const buildAppointmentDescription = (appt: any) => {
    const services = (appt.agendamento_itens || [])
      .map((item: any) => item.servicos?.nome || item.descricao)
      .filter(Boolean)
      .join(', ');
    return `${DEFAULT_FISCAL_BASE_DESCRIPTION}${services ? `\nServiços realizados: ${services}.` : ''}`;
  };

  const buildPackageDescription = (pack: any) => {
    const serviceName = pack.servicos?.nome;
    return `${DEFAULT_FISCAL_BASE_DESCRIPTION}${serviceName ? `\nServiços realizados: ${serviceName}.` : ''}`;
  };

  const client = sourceData?.clientes || transaction?.originalData?.clientes;
  const pet = sourceData?.pets || transaction?.originalData?.pets;

  const totalValue = useMemo(() => {
    if (!sourceData) return Number(transaction?.valor || 0);
    const movement = Array.isArray(sourceData.financeiro_movimentos)
      ? sourceData.financeiro_movimentos.find((mov: any) => mov?.origem !== 'extras_agendamento')
      : null;
    return Number(movement?.valor_total || transaction?.valor || 0);
  }, [sourceData, transaction]);

  const taxItems = useMemo(() => {
    if (!sourceData) return [];

    if (transaction.sourceTable === 'agendamentos') {
      const items = (sourceData.agendamento_itens || []).map((item: any) => ({
        servico_id: item.servico_id || item.servicos?.id || null,
        descricao: item.servicos?.nome || item.descricao || 'Servico de banho e tosa',
        quantidade: 1,
        valor_unitario: Number(item.valor_cobrado || item.servicos?.preco_base || 0),
        valor_desconto: 0,
        valor_total: Number(item.valor_cobrado || item.servicos?.preco_base || 0),
        fiscal: fiscalForService(item.servico_id || item.servicos?.id)
      }));

      if (items.length > 0) return items;
    }

    return [{
      servico_id: sourceData.servico_id || sourceData.servicos?.id || null,
      descricao: transaction.sourceTable === 'pacotes' ? 'Pacote de fidelidade banho e tosa' : 'Servico de banho e tosa',
      quantidade: 1,
      valor_unitario: totalValue,
      valor_desconto: 0,
      valor_total: totalValue,
      fiscal: fiscalForService(sourceData.servico_id || sourceData.servicos?.id)
    }];
  }, [sourceData, transaction, totalValue, fiscalServices]);

  const buildAddress = (c: any) => {
    if (!c) return null;
    return [
      [c.logradouro, c.numero].filter(Boolean).join(', '),
      c.complemento,
      c.bairro,
      [c.cidade, c.estado].filter(Boolean).join('/'),
      c.cep
    ].filter(Boolean).join(' - ') || null;
  };

  const serviceValue = useMemo(() => {
    const sum = taxItems.reduce((total: number, item: any) => total + Number(item.valor_total || 0), 0);
    return Number(sum || totalValue || 0);
  }, [taxItems, totalValue]);

  const checklist = useMemo(() => avaliarChecklistFiscal({
    configFiscal,
    servicosFiscais: taxItems.map((item: any) => item.fiscal).filter(Boolean),
    cliente: client
  }), [configFiscal, taxItems, client]);

  const handleEnviarLinkCadastro = () => {
    const { whatsappUrl } = montarLinkCadastroWhatsapp(unit.id, client?.telefone, client?.nome);
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const createDraft = async () => {
    if (!sourceData || !checklist.podeEmitir) return;
    setSaving(true);
    setError('');
    try {
      const financialMovement = Array.isArray(sourceData.financeiro_movimentos)
        ? sourceData.financeiro_movimentos.find((mov: any) => mov?.origem !== 'extras_agendamento')
        : null;

      if (!financialMovement?.id) {
        throw new Error('Movimento financeiro confirmado nao encontrado. Crie o rascunho somente apos existir movimento financeiro quitado.');
      }

      if (financialMovement.status !== 'pago') {
        throw new Error('Rascunho fiscal so pode ser criado quando o movimento financeiro estiver quitado.');
      }

      const { error: rpcError } = await supabaseClient.rpc('criar_rascunho_fiscal_por_movimento', {
        p_movimento_id: financialMovement.id
      });

      if (rpcError) throw rpcError;

      alert('Rascunho fiscal criado. A emissao oficial ainda nao esta configurada.');
      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Erro ao criar rascunho fiscal:', err);
      setError(`Falha ao criar rascunho fiscal: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="app-modal-panel w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl max-h-[calc(100dvh-24px)] overflow-y-auto">
        <header className="sticky top-0 bg-white p-5 md:p-7 border-b border-slate-100 rounded-t-[2rem] flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em]">Previa fiscal interna</p>
            <h3 className="text-xl md:text-2xl font-black text-slate-900">Criar rascunho fiscal</h3>
            <p className="text-xs font-bold text-slate-400 mt-1">Sem emissao real, sem API externa e sem numero fiscal.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 shrink-0">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        {loading ? (
          <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest">
            <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Preparando previa...
          </div>
        ) : error ? (
          <div className="p-7">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-5 text-rose-700 font-bold">{error}</div>
          </div>
        ) : (
          <div className="p-5 md:p-7 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</p>
                <p className="text-sm font-black text-slate-900 mt-1">{client?.nome || 'Cliente nao informado'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pet / Origem</p>
                <p className="text-sm font-black text-slate-900 mt-1">{pet?.nome || transaction.descricao}</p>
              </div>
              <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4">
                <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Valor fiscal</p>
                <p className="text-lg font-black text-slate-900 mt-1">{formatCurrency(serviceValue)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de competencia</label>
                <input type="date" value={competenceDate} onChange={(e) => setCompetenceDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
                {transaction.sourceTable === 'pacotes' && (
                  <p className="text-[10px] font-bold text-slate-400">Para pacote pago antes das sessoes, deixe vazio ate haver competencia real.</p>
                )}
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descricao fiscal revisavel</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none resize-none" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens que serao copiados para o rascunho</p>
              {taxItems.map((item: any, index: number) => (
                <div key={`${item.servico_id || index}-${index}`} className="flex justify-between gap-4 rounded-2xl border border-slate-100 p-4">
                  <div>
                    <p className="text-sm font-black text-slate-800">{item.descricao}</p>
                    <p className="text-[10px] font-bold text-slate-400">Quantidade {item.quantidade}</p>
                  </div>
                  <p className="font-black text-slate-900">{formatCurrency(item.valor_total)}</p>
                </div>
              ))}
            </div>

            {!checklist.podeEmitir ? (
              <div className="rounded-2xl bg-rose-50 border border-rose-100 p-5 space-y-3">
                <p className="text-sm font-black text-rose-700">
                  <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                  Não é possível criar o rascunho fiscal ainda:
                </p>
                <ul className="text-xs font-bold text-rose-600 list-disc list-inside space-y-1">
                  {checklist.pendencias.map(pendencia => <li key={pendencia}>{pendencia}</li>)}
                </ul>
                {(!checklist.clienteCpfOk || !checklist.clienteEnderecoOk) && (
                  <button
                    onClick={handleEnviarLinkCadastro}
                    className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2"
                  >
                    <i className="fa-brands fa-whatsapp"></i> Enviar link de cadastro para o cliente
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm font-bold text-amber-800">
                Rascunho fiscal criado. A emissao oficial ainda nao esta configurada.
              </div>
            )}

            <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
              <button onClick={onClose} className="w-full md:flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest">
                Cancelar
              </button>
              <button onClick={createDraft} disabled={saving || !checklist.podeEmitir} className="w-full md:flex-[2] py-4 rounded-2xl bg-teal-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-500/20 disabled:opacity-50">
                {saving ? 'Criando...' : 'Criar rascunho fiscal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FiscalDraftModal;
