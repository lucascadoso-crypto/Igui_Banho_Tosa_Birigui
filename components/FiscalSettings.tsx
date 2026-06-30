import React, { useEffect, useMemo, useState } from 'react';
import { Unit, UserProfile } from '../types';
import { registrarAtividade } from '../services/logger';

interface FiscalSettingsProps {
  supabaseClient: any;
  units: Unit[];
  userProfile?: UserProfile;
}

const emptyConfig = {
  ativo: false,
  ambiente_fiscal: 'NAO_CONFIGURADO',
  regime_tributario: '',
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_municipal: '',
  codigo_municipio_ibge: '',
  municipio: '',
  uf: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  complemento: '',
  email_fiscal: '',
  telefone_fiscal: '',
  emitir_nota_automaticamente: false
};

const DEFAULT_FISCAL_DESCRIPTION = 'Prestação de serviços de higiene, embelezamento e cuidados de animais domésticos, incluindo banho, tosa e serviços complementares.';
const DEFAULT_MUNICIPAL_SERVICE_CODE = '050801';
const DEFAULT_NBS_CODE = '11405600';

const FiscalSettings: React.FC<FiscalSettingsProps> = ({ supabaseClient, units, userProfile }) => {
  const canEdit = userProfile?.cargo === 'master';
  const canEditFiscalServices = userProfile?.cargo === 'master';
  const [selectedUnitId, setSelectedUnitId] = useState<number | ''>(units[0]?.id || '');
  const [config, setConfig] = useState<any>(emptyConfig);
  const [services, setServices] = useState<any[]>([]);
  const [fiscalServices, setFiscalServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const selectedUnit = useMemo(
    () => units.find(unit => Number(unit.id) === Number(selectedUnitId)),
    [units, selectedUnitId]
  );

  useEffect(() => {
    if (!selectedUnitId && units[0]?.id) setSelectedUnitId(units[0].id);
  }, [units, selectedUnitId]);

  useEffect(() => {
    if (selectedUnitId) fetchFiscalData();
  }, [selectedUnitId]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchFiscalData = async () => {
    if (!supabaseClient || !selectedUnitId) return;
    setLoading(true);
    try {
      const [configResult, servicesResult, fiscalServicesResult] = await Promise.all([
        supabaseClient
          .from('config_fiscal_unidade')
          .select('*')
          .eq('unidade_id', selectedUnitId)
          .maybeSingle(),
        supabaseClient
          .from('servicos')
          .select('id, nome, preco_base, ativo')
          .eq('ativo', true)
          .order('nome'),
        supabaseClient
          .from('servicos_fiscais')
          .select('*')
          .eq('unidade_id', selectedUnitId)
      ]);

      if (configResult.error && configResult.error.code !== 'PGRST116') throw configResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (fiscalServicesResult.error) throw fiscalServicesResult.error;

      setConfig(configResult.data || {
        ...emptyConfig,
        unidade_id: selectedUnitId,
        nome_fantasia: selectedUnit?.name || '',
        telefone_fiscal: selectedUnit?.phone || ''
      });
      setServices(servicesResult.data || []);
      setFiscalServices(fiscalServicesResult.data || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados fiscais:', err);
      showMsg(`Falha ao carregar fiscal: ${err.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!selectedUnitId || !canEdit) return;
    setSaving(true);
    try {
      const payload = {
        ...config,
        unidade_id: Number(selectedUnitId),
        ambiente_fiscal: config.ambiente_fiscal || 'NAO_CONFIGURADO',
        emitir_nota_automaticamente: false
      };

      const { error } = await supabaseClient
        .from('config_fiscal_unidade')
        .upsert(payload, { onConflict: 'unidade_id' });

      if (error) throw error;

      await registrarAtividade(
        selectedUnitId,
        userProfile?.email || 'sistema',
        config?.id ? 'EDITAR_CONFIG_FISCAL' : 'CRIAR_CONFIG_FISCAL',
        `Atualizou a configuracao fiscal da unidade ${selectedUnit?.name || selectedUnitId}.`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Configuracao fiscal salva como rascunho interno.');
      fetchFiscalData();
    } catch (err: any) {
      console.error('Erro ao salvar configuracao fiscal:', err);
      showMsg(`Falha ao salvar configuracao fiscal: ${err.message || err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const fiscalForService = (serviceId: number) => fiscalServices.find(item => Number(item.servico_id) === Number(serviceId));

  const updateFiscalService = (serviceId: number, field: string, value: any) => {
    const existing = fiscalForService(serviceId);
    const next = existing
      ? fiscalServices.map(item => Number(item.servico_id) === Number(serviceId) ? { ...item, [field]: value } : item)
      : [...fiscalServices, {
          unidade_id: Number(selectedUnitId),
        servico_id: serviceId,
        ativo: true,
        descricao_fiscal: DEFAULT_FISCAL_DESCRIPTION,
        codigo_servico_municipal: DEFAULT_MUNICIPAL_SERVICE_CODE,
        codigo_tributacao_nacional: '',
        codigo_nbs: DEFAULT_NBS_CODE,
          aliquota_iss: null,
          incidencia_iss: '',
          observacoes_fiscais: '',
          [field]: value
        }];

    setFiscalServices(next);
  };

  const saveFiscalService = async (service: any) => {
    if (!selectedUnitId || !canEditFiscalServices) return;
    const fiscal = fiscalForService(service.id) || {};
    setSaving(true);
    try {
      const payload = {
        unidade_id: Number(selectedUnitId),
        servico_id: Number(service.id),
        ativo: fiscal.ativo ?? true,
        descricao_fiscal: fiscal.descricao_fiscal || DEFAULT_FISCAL_DESCRIPTION,
        codigo_servico_municipal: fiscal.codigo_servico_municipal || DEFAULT_MUNICIPAL_SERVICE_CODE,
        codigo_tributacao_nacional: fiscal.codigo_tributacao_nacional || null,
        codigo_nbs: fiscal.codigo_nbs || DEFAULT_NBS_CODE,
        aliquota_iss: fiscal.aliquota_iss === '' || fiscal.aliquota_iss == null ? null : Number(fiscal.aliquota_iss),
        incidencia_iss: fiscal.incidencia_iss || null,
        observacoes_fiscais: fiscal.observacoes_fiscais || null
      };

      const { error } = await supabaseClient
        .from('servicos_fiscais')
        .upsert(payload, { onConflict: 'unidade_id,servico_id' });

      if (error) throw error;

      await registrarAtividade(
        selectedUnitId,
        userProfile?.email || 'sistema',
        'EDITAR_SERVICO_FISCAL',
        `Atualizou o mapeamento fiscal do servico ${service.nome}.`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Servico fiscal salvo.');
      fetchFiscalData();
    } catch (err: any) {
      console.error('Erro ao salvar servico fiscal:', err);
      showMsg(`Falha ao salvar servico fiscal: ${err.message || err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (label: string, keyName: string, placeholder = '') => (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        value={config[keyName] || ''}
        onChange={(e) => setConfig({ ...config, [keyName]: e.target.value })}
        disabled={!canEdit}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 font-bold text-slate-700 disabled:opacity-60"
      />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {message && (
        <div className={`fixed top-24 right-10 z-50 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {message.text}
        </div>
      )}

      <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em]">Configuracoes &gt; Fiscal</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">Controle Fiscal Interno</h3>
            <p className="text-sm font-bold text-slate-400 mt-1">Fase 1: rascunho e preparacao. Nenhuma NFS-e real sera emitida.</p>
          </div>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(Number(e.target.value))}
            className="px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 outline-none"
          >
            {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest">
          <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Carregando fiscal...
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8 space-y-5">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                <i className="fa-solid fa-building mr-3 text-teal-600"></i> Dados da empresa
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderField('Razao social', 'razao_social')}
                {renderField('Nome fantasia', 'nome_fantasia')}
                {renderField('CNPJ', 'cnpj')}
                {renderField('Inscricao municipal', 'inscricao_municipal')}
                {renderField('E-mail fiscal', 'email_fiscal')}
                {renderField('Telefone fiscal', 'telefone_fiscal')}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8 space-y-5">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                <i className="fa-solid fa-map-location-dot mr-3 text-teal-600"></i> Endereco fiscal
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderField('CEP', 'cep')}
                {renderField('Logradouro', 'logradouro')}
                {renderField('Numero', 'numero')}
                {renderField('Complemento', 'complemento')}
                {renderField('Bairro', 'bairro')}
                {renderField('Municipio', 'municipio')}
                {renderField('UF', 'uf')}
                {renderField('Codigo IBGE', 'codigo_municipio_ibge')}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Integracao NFS-e</h4>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                    <p className="text-sm font-black text-slate-800">Nao configurada</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ambiente</p>
                    <p className="text-sm font-black text-slate-800">{config.ambiente_fiscal || 'NAO_CONFIGURADO'}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showMsg('A integracao com a NFS-e sera configurada apos validacao fiscal e credenciamento oficial.', 'success')}
                className="px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest shadow-lg"
              >
                Configurar integracao
              </button>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving}
                className="mt-6 w-full md:w-auto px-8 py-4 rounded-2xl bg-teal-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-teal-500/20 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar configuracao fiscal'}
              </button>
            )}
          </section>

          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8">
            <header className="mb-6">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Servicos fiscais</h4>
              <p className="text-sm font-bold text-slate-400 mt-1">
                Mapeamento interno para futura NFS-e. Código municipal: 050801 • NBS: 11405600.
              </p>
              {!canEditFiscalServices && (
                <p className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
                  Configurações fiscais são gerenciadas pelo administrador do sistema.
                </p>
              )}
            </header>

            <div className="space-y-4">
              {services.map(service => {
                const fiscal = fiscalForService(service.id) || {};
                const isPending = !fiscal.descricao_fiscal && !fiscal.codigo_servico_municipal && !fiscal.codigo_tributacao_nacional;
                return (
                  <article key={service.id} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-4 md:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="font-black text-slate-900">{service.nome}</h5>
                        <p className="text-xs font-bold text-teal-600 mt-1">R$ {Number(service.preco_base || 0).toFixed(2)}</p>
                        <span className={`inline-flex mt-3 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${isPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {isPending ? 'Pendente de configuracao fiscal' : 'Configurado parcialmente'}
                        </span>
                      </div>
                      {canEditFiscalServices && (
                        <button
                          type="button"
                          onClick={() => saveFiscalService(service)}
                          disabled={saving}
                          className="px-4 py-3 rounded-2xl bg-white text-teal-700 border border-teal-100 font-black text-[10px] uppercase tracking-widest hover:bg-teal-50"
                        >
                          Salvar servico
                        </button>
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <input disabled={!canEditFiscalServices} value={fiscal.descricao_fiscal || DEFAULT_FISCAL_DESCRIPTION} onChange={(e) => updateFiscalService(service.id, 'descricao_fiscal', e.target.value)} placeholder="Descricao fiscal" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.codigo_servico_municipal || DEFAULT_MUNICIPAL_SERVICE_CODE} onChange={(e) => updateFiscalService(service.id, 'codigo_servico_municipal', e.target.value)} placeholder="Código municipal" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.codigo_tributacao_nacional || ''} onChange={(e) => updateFiscalService(service.id, 'codigo_tributacao_nacional', e.target.value)} placeholder="Codigo tributacao nacional" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.codigo_nbs || DEFAULT_NBS_CODE} onChange={(e) => updateFiscalService(service.id, 'codigo_nbs', e.target.value)} placeholder="NBS" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.aliquota_iss ?? ''} onChange={(e) => updateFiscalService(service.id, 'aliquota_iss', e.target.value)} placeholder="Aliquota ISS (%)" type="number" step="0.01" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.incidencia_iss || ''} onChange={(e) => updateFiscalService(service.id, 'incidencia_iss', e.target.value)} placeholder="Incidencia ISS" className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                      <input disabled={!canEditFiscalServices} value={fiscal.observacoes_fiscais || ''} onChange={(e) => updateFiscalService(service.id, 'observacoes_fiscais', e.target.value)} placeholder="Observacoes fiscais" className="md:col-span-2 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold outline-none disabled:opacity-60" />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default FiscalSettings;
