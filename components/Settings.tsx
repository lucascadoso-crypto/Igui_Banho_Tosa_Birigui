
import React, { useState, useEffect, useRef } from 'react';
import { Service, SystemConfig, Unit, UserProfile } from '../types';
import { getLastImgBBUploadError, uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { formatarErroWhatsApp } from '../lib/errorParser';
import FiscalSettings from './FiscalSettings';
import CustosServicos from './CustosServicos';
import { compareNomePtBr } from '../services/sorting';

type SettingsTab = 'identity' | 'units' | 'services' | 'packages' | 'custos' | 'fiscal' | 'whatsapp_logs';

interface SettingsProps {
  supabaseClient: any;
  units: Unit[];
  refreshUnits: () => void;
  userProfile?: UserProfile;
  initialTab?: string;
}

const Settings: React.FC<SettingsProps> = ({ supabaseClient, units, refreshUnits, userProfile, initialTab }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [activeTab, setActiveTab] = useState<SettingsTab>((initialTab as SettingsTab) || 'identity');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as SettingsTab);
  }, [initialTab]);
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Tab 1: Identity
  const [sysConfig, setSysConfig] = useState<SystemConfig>({ id: 1, nome_fantasia: 'iG Banho e Tosa', logo_url: '' });

  // Tab 2: Unit Management
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [isNewUnitModalOpen, setIsNewUnitModalOpen] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ 
    nome: '', 
    endereco_completo: '', 
    telefone: '',
    whatsapp_nome_instancia: '',
    whatsapp_token: '',
    whatsapp_url_servidor: '',
    whatsapp_ativo: true
  });

  // Tab 3: Service Catalog
  const [services, setServices] = useState<Service[]>([]);
  const [serviceAvailabilities, setServiceAvailabilities] = useState<any[]>([]); // servicos_unidade
  const [editingService, setEditingService] = useState<any | null>(null);

  // Tab 3b: Catálogo de Pacotes
  const [catalogPackages, setCatalogPackages] = useState<any[]>([]);
  const [catalogAvailabilities, setCatalogAvailabilities] = useState<any[]>([]); // catalogo_pacotes_unidade
  const [editingCatalogPackage, setEditingCatalogPackage] = useState<any | null>(null);

  // Tab 4: WhatsApp Logs
  const [whatsappLogs, setWhatsappLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig();
    fetchServices();
    fetchCatalogPackages();
  }, []);

  useEffect(() => {
    if (activeTab === 'whatsapp_logs') {
      fetchWhatsAppLogs();
    }
  }, [activeTab]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchWhatsAppLogs = async () => {
    if (!supabaseClient) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabaseClient
        .from('whatsapp_mensagens')
        .select(`
          id, 
          criado_em, 
          nome_cliente, 
          nome_pet, 
          telefone, 
          tipo_agendamento, 
          status, 
          mensagem, 
          detalhe_erro,
          unidade_id,
          unidades (
            nome
          )
        `)
        .order('criado_em', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setWhatsappLogs(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar logs do WhatsApp:", err);
      showMsg("Falha ao carregar logs: " + err.message, "error");
    } finally {
      setLoadingLogs(false);
    }
  };

  const traduzirErroWhatsApp = (detalhe: string) => {
    if (!detalhe) return "❌ Falha no Envio";
    try {
      const obj = JSON.parse(detalhe);
      const str = JSON.stringify(obj).toLowerCase();
      
      if (str.includes('instance not logged in')) {
        return "🔴 WhatsApp Desconectado (Ação: Reconectar instância)";
      }
      if (str.includes('number not registered on whatsapp')) {
        return "⚠️ Número sem WhatsApp (Ação: Corrigir telefone do cliente)";
      }
      if (str.includes('unauthorized') || str.includes('401')) {
        return "🔑 Erro de Chave API (Ação: Verificar Token)";
      }
      
      const summary = obj.message || obj.error || obj.description || "Causa desconhecida";
      const shortSummary = summary.length > 30 ? summary.substring(0, 30) + '...' : summary;
      return `❌ Falha no Envio (${shortSummary})`;
    } catch (e) {
      return "Erro no Processamento";
    }
  };

  const getWhatsAppLogStatus = (status?: string) => {
    const normalized = status?.toLowerCase();
    if (normalized === 'success' || status?.toUpperCase() === 'SUCESSO' || status?.toUpperCase() === 'ENVIADO') {
      return { label: 'ENVIADO', className: 'bg-emerald-100 text-emerald-700' };
    }
    if (normalized === 'pending' || status?.toUpperCase() === 'PENDENTE') {
      return { label: 'PENDENTE', className: 'bg-amber-100 text-amber-700' };
    }
    return { label: 'ERRO', className: 'bg-rose-100 text-rose-700' };
  };

  const getWhatsAppLogDate = (value?: string) => ({
    date: value ? new Date(value).toLocaleDateString('pt-BR') : '-',
    time: value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'
  });

  const fetchConfig = async () => {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from('config_sistema').select('*').eq('id', 1).single();
      if (error) throw error;
      if (data) setSysConfig(data);
    } catch (err: any) {
      console.error("Erro ao buscar configuração:", err);
    }
  };

  const fetchServices = async () => {
    if (!supabaseClient) return;
    try {
      const { data: srvData, error: srvError } = await supabaseClient.from('servicos').select('*').order('nome');
      const { data: availData, error: availError } = await supabaseClient.from('servicos_unidade').select('*');
      
      if (srvError) throw srvError;
      if (availError) throw availError;

      if (srvData) setServices(srvData.slice().sort(compareNomePtBr));
      if (availData) setServiceAvailabilities(availData);
    } catch (err: any) {
      console.error("Erro ao buscar serviços:", err);
      showMsg("Falha ao carregar catálogo: " + err.message, "error");
    }
  };

  const fetchCatalogPackages = async () => {
    if (!supabaseClient) return;
    try {
      const { data: pkgData, error: pkgError } = await supabaseClient.from('catalogo_pacotes').select('*').order('nome');
      const { data: availData, error: availError } = await supabaseClient.from('catalogo_pacotes_unidade').select('*');

      if (pkgError) throw pkgError;
      if (availError) throw availError;

      if (pkgData) setCatalogPackages(pkgData);
      if (availData) setCatalogAvailabilities(availData);
    } catch (err: any) {
      console.error("Erro ao buscar catálogo de pacotes:", err);
      showMsg("Falha ao carregar catálogo de pacotes: " + err.message, "error");
    }
  };

  const isCatalogPackageActiveInUnit = (pkgId: number | string, unitId: number | string) => {
    return catalogAvailabilities.some(a => a.catalogo_pacote_id === pkgId && a.unidade_id === unitId && a.ativo);
  };

  const saveCatalogPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCatalogPackage) return;
    setLoading(true);

    try {
      const payload = {
        nome: editingCatalogPackage.nome,
        frequencia: editingCatalogPackage.frequencia,
        qtd_sessoes: Number(editingCatalogPackage.qtd_sessoes),
        valor_base: parseFloat(editingCatalogPackage.valor_base)
      };

      let pkgId = editingCatalogPackage.id;
      let logAcao = '';
      let logDesc = '';

      if (pkgId) {
        const { error: upError } = await supabaseClient.from('catalogo_pacotes').update(payload).eq('id', pkgId);
        if (upError) throw upError;
        logAcao = 'EDICAO_MODELO_PACOTE';
        logDesc = `Editou o modelo de pacote ${payload.nome} (R$ ${payload.valor_base.toFixed(2)})`;
      } else {
        const { data, error: insError } = await supabaseClient.from('catalogo_pacotes').insert([payload]).select().single();
        if (insError) throw insError;
        pkgId = data.id;
        logAcao = 'NOVO_MODELO_PACOTE';
        logDesc = `Criou o modelo de pacote ${payload.nome} (R$ ${payload.valor_base.toFixed(2)})`;
      }

      await supabaseClient.from('catalogo_pacotes_unidade').delete().eq('catalogo_pacote_id', pkgId);

      const newAvails = units
        .filter(u => editingCatalogPackage.availabilities?.[u.id])
        .map(u => ({
          catalogo_pacote_id: pkgId,
          unidade_id: u.id,
          ativo: true
        }));

      if (newAvails.length > 0) {
        const { error: availError } = await supabaseClient.from('catalogo_pacotes_unidade').insert(newAvails);
        if (availError) throw availError;
      }

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        logAcao,
        logDesc,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Modelo de pacote salvo!');
      await fetchCatalogPackages();
      setEditingCatalogPackage(null);
    } catch (err: any) {
      console.error("Erro ao salvar modelo de pacote:", err);
      showMsg('Erro ao salvar modelo de pacote: ' + (err.message || ''), 'error');
    }
    setLoading(false);
  };

  const deleteCatalogPackage = async (id: number | string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o modelo "${nome}"? Esta ação não pode ser desfeita.`)) return;

    setLoading(true);
    try {
      const { error } = await supabaseClient.from('catalogo_pacotes').delete().eq('id', id);
      if (error) throw error;

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        'EXCLUIR_MODELO_PACOTE',
        `Excluiu o modelo de pacote ${nome}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg("Modelo de pacote removido com sucesso!");
      await fetchCatalogPackages();
      if (editingCatalogPackage?.id === id) setEditingCatalogPackage(null);
    } catch (err: any) {
      console.error("Erro ao excluir modelo de pacote:", err);
      showMsg("Erro ao excluir: " + err.message, "error");
    }
    setLoading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const url = await uploadToImgBB(file);
      if (url) {
        setSysConfig(prev => ({ ...prev, logo_url: url }));
        
        // Salva diretamente na tabela config_sistema
        const { error } = await supabaseClient.from('config_sistema').update({
          logo_url: url
        }).eq('id', 1);

        if (error) {
          throw error;
        }

        // Notifica o resto do sistema para atualizar a logo nas outras partes
        window.dispatchEvent(new Event('dadosGlobaisAtualizados'));
        showMsg("Logomarca carregada e salva com sucesso!");
      } else {
        showMsg(getLastImgBBUploadError() || "Falha no upload da imagem", "error");
      }
    } catch (err: any) {
      console.error("Erro ao fazer upload/salvar logo:", err);
      showMsg("Erro ao processar imagem e salvar: " + (err.message || ''), "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveIdentity = async () => {
    setLoading(true);
    try {
      const { error } = await supabaseClient.from('config_sistema').update({
        nome_fantasia: sysConfig.nome_fantasia,
        logo_url: sysConfig.logo_url
      }).eq('id', 1);
      
      if (error) throw error;
      showMsg('Identidade atualizada com sucesso!');

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        'ALTERAR_IDENTIDADE_REDE',
        `Alterou nome fantasia para ${sysConfig.nome_fantasia}`,
        userProfile?.nome,
        userProfile?.cargo
      );
      
      // Notifica o sistema para atualizar a Sidebar
      window.dispatchEvent(new Event('dadosGlobaisAtualizados'));
    } catch (err: any) {
      console.error("Erro ao salvar identidade:", err);
      showMsg('Erro ao salvar no banco: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const saveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    setLoading(true);
    try {
      const { error } = await supabaseClient.from('unidades').update({
        nome: editingUnit.name,
        endereco_completo: editingUnit.endereco_completo,
        telefone: editingUnit.phone,
        whatsapp_nome_instancia: editingUnit.whatsapp_nome_instancia,
        whatsapp_token: editingUnit.whatsapp_token,
        whatsapp_url_servidor: editingUnit.whatsapp_url_servidor,
        whatsapp_ativo: editingUnit.whatsapp_ativo
      }).eq('id', editingUnit.id);
      
      if (error) throw error;

      showMsg('Unidade atualizada!');

      registrarAtividade(
        editingUnit.id,
        userProfile?.email || 'sistema',
        'EDITAR_UNIDADE',
        `Alterou dados cadastrais da unidade ${editingUnit.name}`,
        userProfile?.nome,
        userProfile?.cargo
      );
      
      // Notifica o sistema para atualizar a Sidebar
      window.dispatchEvent(new Event('dadosGlobaisAtualizados'));
      
      refreshUnits();
      setEditingUnit(null);
    } catch (err: any) {
      console.error("Erro ao salvar unidade:", err);
      showMsg('Erro ao atualizar unidade: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const createNewUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitData.nome) return;
    setLoading(true);
    try {
      const { error } = await supabaseClient.from('unidades').insert([{
        nome: newUnitData.nome,
        endereco_completo: newUnitData.endereco_completo,
        telefone: newUnitData.telefone,
        whatsapp_nome_instancia: newUnitData.whatsapp_nome_instancia,
        whatsapp_token: newUnitData.whatsapp_token,
        whatsapp_url_servidor: newUnitData.whatsapp_url_servidor,
        whatsapp_ativo: newUnitData.whatsapp_ativo
      }]);

      if (error) throw error;

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        'NOVA_UNIDADE',
        `Criou a unidade: ${newUnitData.nome}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Nova unidade criada com sucesso!');
      
      // Notifica a Sidebar para buscar a nova lista
      window.dispatchEvent(new Event('dadosGlobaisAtualizados'));
      
      refreshUnits();
      setIsNewUnitModalOpen(false);
      setNewUnitData({ 
        nome: '', 
        endereco_completo: '', 
        telefone: '',
        whatsapp_nome_instancia: '',
        whatsapp_token: '',
        whatsapp_url_servidor: '',
        whatsapp_ativo: true
      });
    } catch (err: any) {
      console.error("Erro ao criar unidade:", err);
      showMsg('Erro ao criar unidade: ' + err.message, 'error');
    }
    setLoading(false);
  };

  const saveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    setLoading(true);
    
    try {
      const servicePayload = { 
        nome: editingService.nome, 
        preco_base: parseFloat(editingService.preco_base) 
      };
      
      let srvId = editingService.id;
      let logAcao = '';
      let logDesc = '';

      if (srvId) {
        const { error: upError } = await supabaseClient.from('servicos').update(servicePayload).eq('id', srvId);
        if (upError) throw upError;
        logAcao = 'EDICAO_SERVICO';
        logDesc = `Editou o serviço ${editingService.nome} (Preço: R$ ${servicePayload.preco_base.toFixed(2)})`;
      } else {
        const { data, error: insError } = await supabaseClient.from('servicos').insert([servicePayload]).select().single();
        if (insError) throw insError;
        srvId = data.id;
        logAcao = 'NOVO_SERVICO';
        logDesc = `Criou o serviço ${editingService.nome} (Preço: R$ ${servicePayload.preco_base.toFixed(2)})`;
      }

      await supabaseClient.from('servicos_unidade').delete().eq('servico_id', srvId);

      const newAvails = units
        .filter(u => editingService.availabilities?.[u.id])
        .map(u => ({
          servico_id: srvId,
          unidade_id: u.id,
          ativo: true
        }));

      if (newAvails.length > 0) {
        const { error: availError } = await supabaseClient.from('servicos_unidade').insert(newAvails);
        if (availError) throw availError;
      }

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        logAcao,
        logDesc,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg('Serviço e disponibilidades salvos!');
      await fetchServices();
      setEditingService(null);
    } catch (err: any) {
      console.error("Erro ao salvar serviço:", err);
      showMsg('Erro ao salvar serviço: ' + (err.message || ''), 'error');
    }
    setLoading(false);
  };

  const deleteService = async (id: number | string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o serviço "${nome}"? Esta ação não pode ser desfeita.`)) return;
    
    setLoading(true);
    try {
      const { error } = await supabaseClient.from('servicos').delete().eq('id', id);
      if (error) throw error;

      registrarAtividade(
        units[0]?.id || 'rede',
        userProfile?.email || 'sistema',
        'EXCLUIR_SERVICO',
        `Excluiu o serviço ${nome}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showMsg("Serviço removido com sucesso!");
      await fetchServices();
      if (editingService?.id === id) setEditingService(null);
    } catch (err: any) {
      console.error("Erro ao excluir serviço:", err);
      showMsg("Erro ao excluir: " + err.message, "error");
    }
    setLoading(false);
  };

  const isServiceActiveInUnit = (srvId: string, unitId: string) => {
    return serviceAvailabilities.some(a => a.servico_id === srvId && a.unidade_id === unitId && a.ativo);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Toast Notificação */}
      {message && (
        <div className={`fixed top-24 right-10 z-50 px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 text-white font-bold flex items-center space-x-2 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${message.type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}`}></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* Navegação de Abas */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-2">
        <button 
          onClick={() => setActiveTab('identity')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'identity' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-id-card"></i>
          <span>Identidade</span>
        </button>
        <button 
          onClick={() => setActiveTab('units')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'units' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-store"></i>
          <span>Unidades</span>
        </button>
        <button 
          onClick={() => setActiveTab('services')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'services' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-tags"></i>
          <span>Serviços</span>
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'packages' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-box-open"></i>
          <span>Pacotes</span>
        </button>
        <button
          onClick={() => setActiveTab('custos')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'custos' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-coins"></i>
          <span>Custos dos Serviços</span>
        </button>
        <button
          onClick={() => setActiveTab('fiscal')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'fiscal' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-solid fa-file-invoice-dollar"></i>
          <span>Fiscal</span>
        </button>
        <button 
          onClick={() => setActiveTab('whatsapp_logs')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'whatsapp_logs' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <i className="fa-brands fa-whatsapp"></i>
          <span>Logs do WhatsApp</span>
        </button>
      </div>

      {/* Conteúdo Aba 1: Identidade */}
      {activeTab === 'identity' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 animate-in fade-in duration-500">
          <header className="mb-10">
            <h3 className="text-xl font-bold text-slate-800 flex items-center">
              <i className="fa-solid fa-palette mr-3 text-indigo-500"></i>
              Identidade Visual da Rede
            </h3>
            <p className="text-slate-400 text-sm mt-1">Personalize o nome e a marca que aparecem no sistema.</p>
          </header>

          <div className="space-y-10 max-w-2xl">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Nome Fantasia do Sistema</label>
              <input 
                type="text" 
                value={sysConfig.nome_fantasia || ''}
                onChange={(e) => setSysConfig({...sysConfig, nome_fantasia: e.target.value})}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-700 shadow-inner"
                placeholder="Ex: iG Banho e Tosa"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Logomarca Oficial (PNG/SVG)</label>
              
              <input 
                type="file" 
                ref={logoInputRef} 
                onChange={handleLogoUpload} 
                className="hidden" 
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" 
              />

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {sysConfig.logo_url ? (
                  <div className="relative group">
                    <div className="w-48 h-48 bg-slate-50 rounded-[2.5rem] border-4 border-white shadow-xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105 duration-300">
                      <img src={sysConfig.logo_url} alt="Logomarca Atual" className="max-w-[80%] max-h-[80%] object-contain" />
                    </div>
                    <button 
                      onClick={() => setSysConfig({...sysConfig, logo_url: ''})}
                      className="absolute -top-2 -right-2 w-10 h-10 bg-rose-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-rose-600 transition-colors"
                    >
                      <i className="fa-solid fa-trash-can text-sm"></i>
                    </button>
                    <div className="absolute inset-0 bg-black/40 rounded-[2.5rem] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer" onClick={() => logoInputRef.current?.click()}>
                      <span className="text-white text-xs font-black uppercase tracking-widest">Substituir</span>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => logoInputRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-slate-50 flex flex-col items-center justify-center space-y-3 cursor-pointer group hover:bg-indigo-50/50 hover:border-indigo-300 transition-all"
                  >
                    {uploadingLogo ? (
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-circle-notch fa-spin text-4xl text-indigo-500 mb-3"></i>
                        <span className="text-xs font-bold text-indigo-600 uppercase">Subindo imagem...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                          <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-slate-600">Clique para enviar a logo</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Recomendado: PNG ou SVG (Fundo Transparente)</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6">
              {!isReadOnly && (
                <button 
                  onClick={saveIdentity}
                  disabled={loading || uploadingLogo}
                  className="w-full sm:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin mr-3"></i>
                      GRAVANDO...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-floppy-disk mr-3"></i>
                      SALVAR ALTERAÇÕES
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Aba 2: Unidades */}
      {activeTab === 'units' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Unidades da Rede</h3>
              <p className="text-sm text-slate-400">Gerencie os endereços e nomes das suas lojas.</p>
            </div>
            {!isReadOnly && (
              <button 
                onClick={() => setIsNewUnitModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center transition-all active:scale-95"
              >
                <i className="fa-solid fa-plus mr-2"></i> Nova Unidade
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {units.map(unit => (
              <div key={unit.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-indigo-50 w-12 h-12 rounded-2xl flex items-center justify-center text-indigo-600">
                    <i className="fa-solid fa-shop text-xl"></i>
                  </div>
                  {!isReadOnly && (
                    <button 
                      onClick={() => setEditingUnit(unit)}
                      className="text-slate-400 hover:text-indigo-600 p-2 transition-colors"
                    >
                      <i className="fa-solid fa-pen-to-square"></i>
                    </button>
                  )}
                </div>
                <h4 className="text-lg font-bold text-slate-800">{unit.name}</h4>
                <p className="text-sm text-slate-500 mt-2 truncate"><i className="fa-solid fa-location-dot mr-2"></i>{unit.endereco_completo || 'Não informado'}</p>
                <p className="text-sm text-slate-500 mt-1"><i className="fa-solid fa-phone mr-2"></i>{unit.phone || 'Não informado'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 3: Serviços */}
      {activeTab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
          {/* Lado Esquerdo: Lista */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Catálogo de Serviços</h3>
              <button 
                onClick={() => setEditingService({ nome: '', preco_base: 0, availabilities: {} })}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
              >
                <i className="fa-solid fa-plus mr-2"></i> Novo Serviço
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {services.map(srv => (
                <div key={srv.id} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-indigo-100 transition-all shadow-sm hover:shadow-md">
                  <div className="flex items-center space-x-4">
                    <div className="bg-slate-50 w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors shrink-0">
                      <i className="fa-solid fa-scissors"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{srv.nome}</p>
                      <p className="text-xs text-indigo-600 font-bold">R$ {Number(srv.preco_base).toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end space-x-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                    <div className="flex -space-x-1">
                      {units.map(u => (
                        <div 
                          key={u.id}
                          title={`${u.name}: ${isServiceActiveInUnit(srv.id, u.id) ? 'Habilitado' : 'Desabilitado'}`}
                          className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shadow-sm shrink-0 ${isServiceActiveInUnit(srv.id, u.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}
                        >
                          {u.name[0]}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button 
                        title="Editar"
                        onClick={() => {
                          const avails = {};
                          units.forEach(u => avails[u.id] = isServiceActiveInUnit(srv.id, u.id));
                          setEditingService({ ...srv, availabilities: avails });
                        }}
                        className="text-slate-400 hover:text-indigo-600 p-2 transition-colors"
                      >
                        <i className="fa-solid fa-sliders"></i>
                      </button>
                      <button 
                        title="Excluir"
                        onClick={() => deleteService(srv.id, srv.nome)}
                        className="text-slate-300 hover:text-rose-500 p-2 transition-colors"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {services.length === 0 && (
                <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                   <p className="text-slate-400 font-medium">Nenhum serviço cadastrado no banco.</p>
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: Editor de Serviço */}
          <div className="lg:col-span-1">
            {editingService ? (
              <div className="bg-white p-8 rounded-3xl border border-indigo-100 shadow-xl shadow-indigo-100/50 sticky top-24 animate-in slide-in-from-right duration-500">
                <h4 className="font-bold text-slate-800 mb-6 flex justify-between items-center">
                  <span className="flex items-center">
                    <i className="fa-solid fa-circle-plus mr-2 text-indigo-500"></i>
                    {editingService.id ? 'Editar Serviço' : 'Novo Serviço'}
                  </span>
                  <button onClick={() => setEditingService(null)} className="text-slate-300 hover:text-rose-500 p-1"><i className="fa-solid fa-xmark"></i></button>
                </h4>
                
                <form onSubmit={saveService} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Serviço</label>
                    <input 
                      required
                      type="text" 
                      value={editingService.nome}
                      onChange={(e) => setEditingService({...editingService, nome: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                      placeholder="Ex: Tosa Higiênica"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Preço Base (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input 
                        required
                        type="number" step="0.01"
                        value={editingService.preco_base}
                        onChange={(e) => setEditingService({...editingService, preco_base: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disponibilidade por Unidade</label>
                    <div className="space-y-2">
                      {units.map(unit => (
                        <div key={unit.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group" onClick={() => {
                          const newAvails = { ...editingService.availabilities, [unit.id]: !(editingService.availabilities?.[unit.id] ?? false) };
                          setEditingService({...editingService, availabilities: newAvails});
                        }}>
                          <span className="text-sm font-bold text-slate-700">{unit.name}</span>
                          <label className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={editingService.availabilities?.[unit.id] ?? false}
                              onChange={(e) => {
                                const newAvails = { ...editingService.availabilities, [unit.id]: e.target.checked };
                                setEditingService({...editingService, availabilities: newAvails});
                              }}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!isReadOnly && (
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      {loading ? 'Salvando...' : 'Confirmar e Salvar no Supabase'}
                    </button>
                  )}
                </form>
              </div>
            ) : (
              <div className="bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                   <i className="fa-solid fa-arrow-left text-2xl text-slate-300"></i>
                </div>
                <h5 className="text-slate-800 font-bold">Gestão de Itens</h5>
                <p className="text-slate-400 text-sm mt-2 max-w-[200px] mx-auto">Selecione um serviço na lista or crie um novo para definir preços e lojas.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba: Catálogo de Pacotes */}
      {activeTab === 'packages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
          {/* Lado Esquerdo: Lista */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Catálogo de Pacotes</h3>
              <button
                onClick={() => setEditingCatalogPackage({ nome: '', frequencia: 'Weekly', qtd_sessoes: 4, valor_base: 0, availabilities: {} })}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
              >
                <i className="fa-solid fa-plus mr-2"></i> Novo Modelo
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {catalogPackages.map(pkg => (
                <div key={pkg.id} className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-indigo-100 transition-all shadow-sm hover:shadow-md">
                  <div className="flex items-center space-x-4">
                    <div className="bg-slate-50 w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors shrink-0">
                      <i className="fa-solid fa-box-open"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{pkg.nome}</p>
                      <p className="text-xs text-slate-400 font-bold">
                        {pkg.frequencia === 'Weekly' ? 'Semanal' : 'Quinzenal'} • {pkg.qtd_sessoes} sessões
                      </p>
                      <p className="text-xs text-indigo-600 font-bold">R$ {Number(pkg.valor_base).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                    <div className="flex -space-x-1">
                      {units.map(u => (
                        <div
                          key={u.id}
                          title={`${u.name}: ${isCatalogPackageActiveInUnit(pkg.id, u.id) ? 'Habilitado' : 'Desabilitado'}`}
                          className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shadow-sm shrink-0 ${isCatalogPackageActiveInUnit(pkg.id, u.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}
                        >
                          {u.name[0]}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        title="Editar"
                        onClick={() => {
                          const avails: Record<string, boolean> = {};
                          units.forEach(u => avails[u.id] = isCatalogPackageActiveInUnit(pkg.id, u.id));
                          setEditingCatalogPackage({ ...pkg, availabilities: avails });
                        }}
                        className="text-slate-400 hover:text-indigo-600 p-2 transition-colors"
                      >
                        <i className="fa-solid fa-sliders"></i>
                      </button>
                      <button
                        title="Excluir"
                        onClick={() => deleteCatalogPackage(pkg.id, pkg.nome)}
                        className="text-slate-300 hover:text-rose-500 p-2 transition-colors"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {catalogPackages.length === 0 && (
                <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                   <p className="text-slate-400 font-medium">Nenhum modelo de pacote cadastrado ainda.</p>
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: Editor de Modelo */}
          <div className="lg:col-span-1">
            {editingCatalogPackage ? (
              <div className="bg-white p-8 rounded-3xl border border-indigo-100 shadow-xl shadow-indigo-100/50 sticky top-24 animate-in slide-in-from-right duration-500">
                <h4 className="font-bold text-slate-800 mb-6 flex justify-between items-center">
                  <span className="flex items-center">
                    <i className="fa-solid fa-circle-plus mr-2 text-indigo-500"></i>
                    {editingCatalogPackage.id ? 'Editar Modelo' : 'Novo Modelo'}
                  </span>
                  <button onClick={() => setEditingCatalogPackage(null)} className="text-slate-300 hover:text-rose-500 p-1"><i className="fa-solid fa-xmark"></i></button>
                </h4>

                <form onSubmit={saveCatalogPackage} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Modelo</label>
                    <input
                      required
                      type="text"
                      value={editingCatalogPackage.nome}
                      onChange={(e) => setEditingCatalogPackage({...editingCatalogPackage, nome: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                      placeholder="Ex: Semanal R$160"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Frequência</label>
                      <select
                        value={editingCatalogPackage.frequencia}
                        onChange={(e) => {
                          const freq = e.target.value;
                          setEditingCatalogPackage({
                            ...editingCatalogPackage,
                            frequencia: freq,
                            qtd_sessoes: freq === 'Weekly' ? 4 : 2
                          });
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      >
                        <option value="Weekly">Semanal</option>
                        <option value="Bi-weekly">Quinzenal</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Qtd Sessões</label>
                      <input
                        required
                        type="number"
                        min={1}
                        value={editingCatalogPackage.qtd_sessoes}
                        onChange={(e) => setEditingCatalogPackage({...editingCatalogPackage, qtd_sessoes: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor Base (R$)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                      <input
                        required
                        type="number" step="0.01"
                        value={editingCatalogPackage.valor_base}
                        onChange={(e) => setEditingCatalogPackage({...editingCatalogPackage, valor_base: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disponibilidade por Unidade</label>
                    <div className="space-y-2">
                      {units.map(unit => (
                        <div key={unit.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group" onClick={() => {
                          const newAvails = { ...editingCatalogPackage.availabilities, [unit.id]: !(editingCatalogPackage.availabilities?.[unit.id] ?? false) };
                          setEditingCatalogPackage({...editingCatalogPackage, availabilities: newAvails});
                        }}>
                          <span className="text-sm font-bold text-slate-700">{unit.name}</span>
                          <label className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={editingCatalogPackage.availabilities?.[unit.id] ?? false}
                              onChange={(e) => {
                                const newAvails = { ...editingCatalogPackage.availabilities, [unit.id]: e.target.checked };
                                setEditingCatalogPackage({...editingCatalogPackage, availabilities: newAvails});
                              }}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!isReadOnly && (
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      {loading ? 'Salvando...' : 'Confirmar e Salvar no Supabase'}
                    </button>
                  )}
                </form>
              </div>
            ) : (
              <div className="bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                   <i className="fa-solid fa-arrow-left text-2xl text-slate-300"></i>
                </div>
                <h5 className="text-slate-800 font-bold">Modelos de Pacote</h5>
                <p className="text-slate-400 text-sm mt-2 max-w-[200px] mx-auto">Selecione um modelo na lista ou crie um novo para usar na criação rápida de pacotes.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'custos' && (
        <CustosServicos supabaseClient={supabaseClient} userProfile={userProfile} />
      )}

      {activeTab === 'fiscal' && (
        <FiscalSettings supabaseClient={supabaseClient} units={units} userProfile={userProfile} />
      )}

      {/* Conteúdo Aba 4: Logs do WhatsApp */}
      {activeTab === 'whatsapp_logs' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 md:p-8 animate-in fade-in duration-500 overflow-hidden">
          <header className="mb-6 md:mb-8 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg md:text-xl font-black text-slate-800 flex items-center leading-tight">
                <i className="fa-brands fa-whatsapp mr-3 text-emerald-500"></i>
                Auditoria de Disparos (Robô)
              </h3>
              <p className="text-slate-400 text-sm mt-1">Histórico recente de mensagens enviadas automaticamente.</p>
            </div>
            <button 
              onClick={fetchWhatsAppLogs}
              disabled={loadingLogs}
              className="flex h-11 w-11 shrink-0 items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
              title="Atualizar Logs"
            >
              <i className={`fa-solid fa-arrows-rotate ${loadingLogs ? 'fa-spin' : ''}`}></i>
            </button>
          </header>

          {loadingLogs && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-500 mb-3"></i>
              <p className="text-xs font-black uppercase tracking-widest">Carregando logs...</p>
            </div>
          )}

          {!loadingLogs && whatsappLogs.length === 0 && (
            <div className="py-16 md:py-20 flex flex-col items-center justify-center text-center rounded-[1.5rem] bg-slate-50/70 border border-slate-100">
              <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                <i className="fa-solid fa-clipboard-list text-3xl text-slate-300"></i>
              </div>
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Nenhum log encontrado</p>
              <p className="mt-2 max-w-[260px] text-xs font-semibold leading-relaxed text-slate-400">
                Assim que mensagens forem enviadas, elas aparecerão aqui.
              </p>
            </div>
          )}

          {!loadingLogs && whatsappLogs.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data / Hora</th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente / Pet</th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Telefone</th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {whatsappLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <p className="text-xs font-bold text-slate-700">
                        {log.criado_em ? new Date(log.criado_em).toLocaleDateString('pt-BR') : '-'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {log.criado_em ? new Date(log.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-bold text-slate-800">{log.nome_cliente}</p>
                      <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-tighter">{log.nome_pet}</p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                        {log.unidades?.nome || 'Unidade não informada'}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-black uppercase tracking-tighter">
                        {log.tipo_agendamento || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-xs font-medium text-slate-600">{log.telefone}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col items-center">
                        <span 
                          title={log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error' ? log.detalhe_erro : undefined}
                          onClick={() => {
                            if ((log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error') && log.detalhe_erro) {
                              setSelectedError(log.detalhe_erro);
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-[9px] font-black text-center min-w-[100px] leading-tight cursor-pointer transition-transform active:scale-95 ${
                          (log.status?.toUpperCase() === 'SUCESSO' || log.status?.toLowerCase() === 'success')
                            ? 'bg-emerald-100 text-emerald-600 uppercase tracking-widest' 
                            : 'bg-rose-100 text-rose-600 uppercase tracking-widest'
                        }`}>
                          {(log.status?.toUpperCase() === 'SUCESSO' || log.status?.toLowerCase() === 'success') ? 'Enviado' : 'Falha no Envio'}
                        </span>
                        {(log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error') && (
                          <span className="text-[8px] text-slate-400 mt-1 font-bold lowercase">Clique p/ ver erro</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {whatsappLogs.length === 0 && !loadingLogs && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-300">
                        <i className="fa-solid fa-clipboard-list text-4xl mb-3"></i>
                        <p className="text-sm font-bold uppercase tracking-widest">Nenhum log encontrado</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {!loadingLogs && whatsappLogs.length > 0 && (
            <div className="md:hidden space-y-3 overflow-x-hidden">
              {whatsappLogs.map((log) => {
                const created = getWhatsAppLogDate(log.criado_em);
                const statusMeta = getWhatsAppLogStatus(log.status);
                const hasError = (log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error') && log.detalhe_erro;

                return (
                  <article key={log.id} className="w-full rounded-[1.35rem] border border-slate-100 bg-white p-4 shadow-sm overflow-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-800">{created.date}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">{created.time}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        title={hasError ? 'Ver erro' : undefined}
                        onClick={() => hasError && setSelectedError(log.detalhe_erro)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </button>
                    </div>

                    <div className="mt-4 min-w-0">
                      <p className="text-base font-black text-slate-800 break-words">
                        {log.nome_cliente || 'Cliente nao informado'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">
                          {log.nome_pet || 'Pet nao informado'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          {log.tipo_agendamento || 'Sem tipo'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs font-bold text-slate-600">
                      <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                        <i className="fa-solid fa-store text-slate-400"></i>
                        <span className="break-words">{log.unidades?.nome || 'Unidade nao informada'}</span>
                      </div>
                      {log.telefone && (
                        <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                          <i className="fa-brands fa-whatsapp text-emerald-500"></i>
                          <span className="break-words">{log.telefone}</span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalhe do Erro (Compartilhado) */}
      <AnimatePresence>
        {selectedError && (
          <div className="app-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedError(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="app-modal-panel relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="app-modal-header bg-rose-500 p-6 text-white flex items-center space-x-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <i className="fa-solid fa-circle-exclamation text-2xl"></i>
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Falha no WhatsApp</h3>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Detalhes técnicos do erro</p>
                </div>
              </div>
              <div className="app-modal-body p-8">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-6">
                  <p className="text-slate-700 font-bold text-sm leading-relaxed">
                    {formatarErroWhatsApp(selectedError)}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedError(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Nova Unidade */}
      {isNewUnitModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="app-modal-panel bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <header className="app-modal-header bg-indigo-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center">
                <i className="fa-solid fa-plus-circle mr-3"></i>
                Expandir Rede: Nova Unidade
              </h3>
              <button onClick={() => setIsNewUnitModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </header>
            <form onSubmit={createNewUnit} className="app-modal-body p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome da Unidade *</label>
                <input 
                  required
                  type="text" 
                  value={newUnitData.nome}
                  onChange={(e) => setNewUnitData({...newUnitData, nome: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                  placeholder="Ex: Matriz Centro"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço Completo</label>
                <textarea 
                  rows={2}
                  value={newUnitData.endereco_completo}
                  onChange={(e) => setNewUnitData({...newUnitData, endereco_completo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium resize-none"
                  placeholder="Rua, Número, Bairro, Cidade..."
                ></textarea>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">WhatsApp de Contato</label>
                <input 
                  type="text" 
                  value={newUnitData.telefone}
                  onChange={(e) => setNewUnitData({...newUnitData, telefone: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center">
                  <i className="fa-brands fa-whatsapp mr-2 text-sm"></i> Integração Evolution API (WhatsApp)
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL do Servidor</label>
                    <input 
                      type="text" 
                      value={newUnitData.whatsapp_url_servidor}
                      onChange={(e) => setNewUnitData({...newUnitData, whatsapp_url_servidor: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="ex: http://129.121.54.240:8080"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Instância</label>
                    <input 
                      type="text" 
                      value={newUnitData.whatsapp_nome_instancia}
                      onChange={(e) => setNewUnitData({...newUnitData, whatsapp_nome_instancia: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="ex: concordia"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Key</label>
                    <input 
                      type="text" 
                      value={newUnitData.whatsapp_token}
                      onChange={(e) => setNewUnitData({...newUnitData, whatsapp_token: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="Cole a API Key da instância aqui"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                        <i className="fa-solid fa-toggle-on text-xl"></i>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest">🟢 Ativar automação de WhatsApp para esta loja</p>
                        <p className="text-[10px] text-slate-400 font-bold">Habilitar envios automáticos e manuais</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={newUnitData.whatsapp_ativo}
                        onChange={(e) => setNewUnitData({...newUnitData, whatsapp_ativo: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsNewUnitModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 transition-all active:scale-95">
                  {loading ? 'Processando...' : 'Criar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edição Unidade */}
      {editingUnit && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="app-modal-panel bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="app-modal-header p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center">
                <i className="fa-solid fa-store mr-3"></i>
                Editar {editingUnit.name}
              </h3>
              <button onClick={() => setEditingUnit(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={saveUnit} className="app-modal-body p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome Fantasia</label>
                <input 
                  required
                  type="text" 
                  value={editingUnit.name}
                  onChange={(e) => setEditingUnit({...editingUnit, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço de Atendimento</label>
                <textarea 
                  required
                  rows={2}
                  value={editingUnit.endereco_completo || ''}
                  onChange={(e) => setEditingUnit({...editingUnit, endereco_completo: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium resize-none"
                ></textarea>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">WhatsApp / Telefone</label>
                <input 
                  required
                  type="text" 
                  value={editingUnit.phone || ''}
                  onChange={(e) => setEditingUnit({...editingUnit, phone: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center">
                  <i className="fa-brands fa-whatsapp mr-2 text-sm"></i> Integração Evolution API (WhatsApp)
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL do Servidor</label>
                    <input 
                      type="text" 
                      value={editingUnit.whatsapp_url_servidor || ''}
                      onChange={(e) => setEditingUnit({...editingUnit, whatsapp_url_servidor: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="ex: http://129.121.54.240:8080"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Instância</label>
                    <input 
                      type="text" 
                      value={editingUnit.whatsapp_nome_instancia || ''}
                      onChange={(e) => setEditingUnit({...editingUnit, whatsapp_nome_instancia: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="ex: concordia"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Key</label>
                    <input 
                      type="text" 
                      value={editingUnit.whatsapp_token || ''}
                      onChange={(e) => setEditingUnit({...editingUnit, whatsapp_token: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      placeholder="Cole a API Key da instância aqui"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                        <i className="fa-solid fa-toggle-on text-xl"></i>
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest">🟢 Ativar automação de WhatsApp para esta loja</p>
                        <p className="text-[10px] text-slate-400 font-bold">Habilitar envios automáticos e manuais</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={editingUnit.whatsapp_ativo ?? true}
                        onChange={(e) => setEditingUnit({...editingUnit, whatsapp_ativo: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setEditingUnit(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 transition-all">
                  {loading ? 'SALVANDO...' : 'SALVAR DADOS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
