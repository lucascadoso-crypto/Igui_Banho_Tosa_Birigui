
import React, { useState, useEffect } from 'react';
import { Unit, Package, UserProfile } from '../types';
import PacoteDetalhesModal from './PacoteDetalhesModal';
import PacoteFormModal from './PacoteFormModal';
import { registrarAtividade } from '../services/logger';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';

interface PacotesProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
}

const Pacotes: React.FC<PacotesProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [editingPackageData, setEditingPackageData] = useState<any | null>(null);

  // Estado para Confirmação de Cancelamento UI
  const [pacoteParaCancelar, setPacoteParaCancelar] = useState<any | null>(null);

  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [termoBusca, setTermoBusca] = useState('');
  const [quickFilter, setQuickFilter] = useState<'ativos' | 'renovar' | 'semProximo' | 'pendentes' | 'hoje'>('ativos');
  const [statusFiltro, setStatusFiltro] = useState<'Todos' | 'Ativos' | 'Finalizados' | 'Cancelados' | 'A vencer'>('Ativos');
  const [frequenciaFiltro, setFrequenciaFiltro] = useState('Todos');
  const [tutorFiltro, setTutorFiltro] = useState('Todos');
  const [taxiFiltro, setTaxiFiltro] = useState<'Todos' | 'Com táxi' | 'Sem táxi'>('Todos');
  const [proximaSessaoFiltro, setProximaSessaoFiltro] = useState<'Todos' | 'Hoje' | 'Próximos 7 dias' | 'Sem agendamento' | 'Atrasado'>('Todos');
  const [pagamentoFiltro, setPagamentoFiltro] = useState<'Todos' | 'Pago' | 'Pendente' | 'Parcial'>('Todos');
  const [ordenacao, setOrdenacao] = useState<'Próxima sessão' | 'Menos sessões restantes' | 'Mais recente' | 'Maior pendência' | 'Nome do pet'>('Próxima sessão');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(16);

  useEffect(() => {
    fetchData();
  }, [unit.id]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [termoBusca, quickFilter, statusFiltro, frequenciaFiltro, tutorFiltro, taxiFiltro, proximaSessaoFiltro, pagamentoFiltro, ordenacao, itensPorPagina, unit.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: packData, error: packError } = await supabaseClient
        .from('pacotes')
        .select('*, pets(*), clientes(*), agendamentos(id, status, data_agendamento, data_fim_real, horario_inicio, tem_taxi, valor_total, agendamento_itens(id, tipo, eh_extra, descricao, servicos(nome)))')
        .eq('unidade_id', unit.id)
        .order('created_at', { ascending: false });
      
      if (packError) throw packError;
      setPackages(packData || []);
    } catch (err) {
      console.error('[DEBUG] Erro ao buscar pacotes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Função para enviar lembrete automático
  const handleSendPackageReminder = (p: any) => {
    const clientName = p.clientes?.nome || 'Cliente';
    const petName = p.pets?.nome || 'seu pet';
    const phoneRaw = p.clientes?.telefone?.replace(/\D/g, '') || '';
    const phone = phoneRaw.startsWith('55') ? phoneRaw : `55${phoneRaw}`;
    const total = p.qtd_sessoes || 0;

    // Ordenar agendamentos por data para encontrar o índice correto
    const sortedAppts = [...(p.agendamentos || [])].sort((a, b) => (a.data_agendamento || '').localeCompare(b.data_agendamento || ''));
    
    // Encontrar o próximo agendamento (futuro ou hoje)
    const today = getTodayBR();
    const nextIdx = sortedAppts.findIndex(a => a.status === 'Agendado' && a.data_agendamento >= today);

    const nextSess = nextIdx !== -1 ? sortedAppts[nextIdx] : null;

    let msg = "";
    if (nextSess) {
      const hora = String(nextSess.horario_inicio || '').substring(0, 5);
      msg = `Olá ${clientName}! 🐾 Passando para confirmar o banho do(a) ${petName} amanhã às ${hora}. Confirmado?`;
    } else {
      msg = `Olá ${clientName}! O pacote do ${petName} está concluído ou não tem agendamentos futuros. Vamos renovar? 🐾`;
    }

    if (phone) {
      // Envio assíncrono com registro de log
      (async () => {
        const result = await enviarNotificacaoWhatsApp({
          telefone: phone,
          mensagem: msg,
          unidadeId: unit.id,
          supabaseClient,
          agendamentoId: nextSess?.id,
          tipo: 'manual'
        });

        // Registro de Auditoria (Manual)
        try {
          await supabaseClient.from('whatsapp_mensagens').insert([{
            status: result?.ok ? 'SUCESSO' : 'ERRO',
            nome_cliente: clientName,
            nome_pet: petName,
            telefone: phone,
            unidade_id: unit.id,
            detalhe_erro: result?.ok ? null : result?.error,
            tipo_agendamento: 'MANUAL',
            criado_em: new Date().toISOString()
          }]);
        } catch (logErr) {
          console.error("Erro ao gravar log_whatsapp manual:", logErr);
        }
      })();
      
      console.log("Mensagem de lembrete enviada via API em background");
    } else {
      alert('Telefone do cliente não encontrado para enviar o WhatsApp.');
    }
  };

  // Função Real de Cancelamento/Exclusão em Cascata
  const confirmCancelPackage = async () => {
    if (!pacoteParaCancelar) return;
    setLoading(true);
    try {
      // 1. Deletar Agendamentos (Filhos)
      const { error: errAppt } = await supabaseClient
        .from('agendamentos')
        .delete()
        .eq('pacote_id', pacoteParaCancelar.id);
      
      if (errAppt) throw errAppt;

      // 2. Deletar Pacote (Pai)
      const { error: errPack } = await supabaseClient
        .from('pacotes')
        .delete()
        .eq('id', pacoteParaCancelar.id);
      
      if (errPack) throw errPack;
      
      // Log de Auditoria
      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'Exclusão de Pacote',
        `Pet: ${pacoteParaCancelar.pets?.nome} - Excluiu o pacote (ID: ${pacoteParaCancelar.id})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      // 3. Atualizar UI
      setPacoteParaCancelar(null);
      await fetchData();
    } catch (err) {
      console.error("Erro ao cancelar pacote:", err);
    } finally {
      setLoading(false);
    }
  };


  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '--/--/--';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.substring(2)}`;
  };

  const openDetails = (p: any) => {
    setSelectedPackage(p);
    setIsDetailModalOpen(true);
  };

  const handleEditPackage = (p: any) => {
    setIsDetailModalOpen(false);
    setEditingPackageData(p);
    setIsModalOpen(true);
  };

  const normalizeText = (value: any) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const toMoney = (value: any) => Number.parseFloat(String(value || 0)) || 0;
  const today = getTodayBR();

  const getSortedAppointments = (p: any) => [...(p.agendamentos || [])]
    .sort((a: any, b: any) => `${a.data_agendamento || ''} ${a.horario_inicio || ''}`.localeCompare(`${b.data_agendamento || ''} ${b.horario_inicio || ''}`));

  const isFinalizedAppt = (status: any) => ['finalizado', 'finalizada', 'concluido', 'concluida'].includes(normalizeText(status));
  const isCancelledAppt = (status: any) => ['cancelado', 'cancelada'].includes(normalizeText(status));
  const getCompletedCount = (p: any) => getSortedAppointments(p).filter((a: any) => isFinalizedAppt(a.status)).length;
  const getNextSession = (p: any) => getSortedAppointments(p).find((a: any) => !isFinalizedAppt(a.status) && !isCancelledAppt(a.status) && a.data_agendamento >= today);
  // Usa a data de finalizacao real (data_fim_real) para ordenar/exibir o ultimo
  // banho. Registros antigos sem data_fim_real caem no fallback data_agendamento.
  const getBathDisplayDate = (a: any) => (a.data_fim_real ? String(a.data_fim_real).substring(0, 10) : (a.data_agendamento || ''));
  const getLastBath = (p: any) => [...(p.agendamentos || [])]
    .filter((a: any) => isFinalizedAppt(a.status))
    .sort((a: any, b: any) => `${getBathDisplayDate(b)} ${b.horario_inicio || ''}`.localeCompare(`${getBathDisplayDate(a)} ${a.horario_inicio || ''}`))[0];
  const getRemainingSessions = (p: any) => Math.max(0, (p.qtd_sessoes || 0) - getCompletedCount(p));
  const getProgress = (p: any) => {
    const total = p.qtd_sessoes || 0;
    return total > 0 ? Math.min(100, Math.round((getCompletedCount(p) / total) * 100)) : 0;
  };
  const getPackageStatus = (p: any) => {
    const status = normalizeText(p.status);
    const remaining = getRemainingSessions(p);
    if (status.includes('cancel')) return 'Cancelado';
    if (status.includes('final') || status.includes('conclu') || remaining === 0) return 'Finalizado';
    if (remaining <= 2 && (p.ativo !== false)) return 'A vencer';
    return p.ativo === false ? 'Finalizado' : 'Ativo';
  };
  const isActivePackage = (p: any) => getPackageStatus(p) === 'Ativo' || getPackageStatus(p) === 'A vencer';
  const getFrequency = (p: any) => {
    const name = normalizeText(p.nome_pacote || p.nome);
    if (name.includes('mensal')) return 'Mensal';
    if (p.qtd_sessoes === 4) return 'Semanal';
    if (p.qtd_sessoes === 2) return 'Quinzenal';
    return `${p.qtd_sessoes || 0} sessões`;
  };
  const getPaymentStatus = (p: any) => {
    if (p.pago === true || p.pago === 'true') return 'Pago';
    if (toMoney(p.valor_pagamento_2) > 0 || toMoney(p.valor_pago) > 0) return 'Parcial';
    return 'Pendente';
  };
  const getServicesText = (p: any) => {
    const names = new Set<string>();
    (p.agendamentos || []).forEach((a: any) => {
      (a.agendamento_itens || []).forEach((item: any) => {
        const name = item?.servicos?.nome || item?.descricao;
        if (name && !item.eh_extra && normalizeText(item.tipo) !== 'adicional') names.add(name);
      });
    });
    return Array.from(names);
  };
  const hasTaxi = (p: any) => (p.agendamentos || []).some((a: any) => a.tem_taxi) || toMoney(p.valor_transporte) > 0;
  const hasSessionToday = (p: any) => (p.agendamentos || []).some((a: any) => a.data_agendamento === today && !isCancelledAppt(a.status));
  const isRenewSoon = (p: any) => isActivePackage(p) && (getRemainingSessions(p) <= 2 || getProgress(p) >= 75);
  const hasNoNextSession = (p: any) => isActivePackage(p) && !getNextSession(p);
  const packageSearchText = (p: any) => normalizeText([
    p.id,
    p.nome,
    p.nome_pacote,
    p.pets?.nome,
    p.clientes?.nome,
    p.clientes?.telefone,
    ...getServicesText(p)
  ].join(' '));

  const frequenciasDisponiveis = Array.from(new Set(packages.map(getFrequency))).filter(Boolean);
  const tutoresDisponiveis = Array.from(new Set(packages.map(p => p.clientes?.nome).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const applyQuickFilter = (filter: typeof quickFilter) => {
    setQuickFilter(filter);
    if (filter === 'ativos') {
      setStatusFiltro('Ativos');
      setProximaSessaoFiltro('Todos');
      setPagamentoFiltro('Todos');
    }
    if (filter === 'renovar') setStatusFiltro('A vencer');
    if (filter === 'semProximo') setProximaSessaoFiltro('Sem agendamento');
    if (filter === 'pendentes') setPagamentoFiltro('Pendente');
    if (filter === 'hoje') setProximaSessaoFiltro('Hoje');
  };

  const clearFilters = () => {
    setTermoBusca('');
    setQuickFilter('ativos');
    setStatusFiltro('Ativos');
    setFrequenciaFiltro('Todos');
    setTutorFiltro('Todos');
    setTaxiFiltro('Todos');
    setProximaSessaoFiltro('Todos');
    setPagamentoFiltro('Todos');
    setOrdenacao('Próxima sessão');
  };

  const filteredByRules = packages.filter((p) => {
    const status = getPackageStatus(p);
    const nextSession = getNextSession(p);
    const searchMatch = !termoBusca.trim() || packageSearchText(p).includes(normalizeText(termoBusca));
    const statusMatch =
      statusFiltro === 'Todos' ||
      (statusFiltro === 'Ativos' && isActivePackage(p)) ||
      (statusFiltro === 'Finalizados' && status === 'Finalizado') ||
      (statusFiltro === 'Cancelados' && status === 'Cancelado') ||
      (statusFiltro === 'A vencer' && isRenewSoon(p));
    const frequencyMatch = frequenciaFiltro === 'Todos' || getFrequency(p) === frequenciaFiltro;
    const tutorMatch = tutorFiltro === 'Todos' || p.clientes?.nome === tutorFiltro;
    const taxiMatch = taxiFiltro === 'Todos' || (taxiFiltro === 'Com táxi' ? hasTaxi(p) : !hasTaxi(p));
    const nextMatch =
      proximaSessaoFiltro === 'Todos' ||
      (proximaSessaoFiltro === 'Hoje' && hasSessionToday(p)) ||
      (proximaSessaoFiltro === 'Próximos 7 dias' && nextSession && (() => {
        const next = new Date(`${nextSession.data_agendamento}T12:00:00`);
        const limit = new Date(`${today}T12:00:00`);
        limit.setDate(limit.getDate() + 7);
        return next >= new Date(`${today}T12:00:00`) && next <= limit;
      })()) ||
      (proximaSessaoFiltro === 'Sem agendamento' && hasNoNextSession(p)) ||
      (proximaSessaoFiltro === 'Atrasado' && !nextSession && (p.agendamentos || []).some((a: any) => !isFinalizedAppt(a.status) && !isCancelledAppt(a.status) && a.data_agendamento < today));
    const payment = getPaymentStatus(p);
    const paymentMatch = pagamentoFiltro === 'Todos' || payment === pagamentoFiltro;

    const quickMatch =
      quickFilter === 'ativos' ? isActivePackage(p) :
      quickFilter === 'renovar' ? isRenewSoon(p) :
      quickFilter === 'semProximo' ? hasNoNextSession(p) :
      quickFilter === 'pendentes' ? payment !== 'Pago' :
      quickFilter === 'hoje' ? hasSessionToday(p) :
      true;

    return searchMatch && statusMatch && frequencyMatch && tutorMatch && taxiMatch && nextMatch && paymentMatch && quickMatch;
  });

  const pacotesFiltrados = [...filteredByRules].sort((a, b) => {
    if (ordenacao === 'Menos sessões restantes') return getRemainingSessions(a) - getRemainingSessions(b);
    if (ordenacao === 'Mais recente') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (ordenacao === 'Maior pendência') return (getPaymentStatus(a) === 'Pago' ? 1 : 0) - (getPaymentStatus(b) === 'Pago' ? 1 : 0);
    if (ordenacao === 'Nome do pet') return String(a.pets?.nome || '').localeCompare(String(b.pets?.nome || ''));
    const nextA = getNextSession(a)?.data_agendamento || '9999-12-31';
    const nextB = getNextSession(b)?.data_agendamento || '9999-12-31';
    return nextA.localeCompare(nextB);
  });

  const totalPaginas = Math.max(1, Math.ceil(pacotesFiltrados.length / itensPorPagina));
  const safePaginaAtual = Math.min(paginaAtual, totalPaginas);
  const inicioPaginacao = (safePaginaAtual - 1) * itensPorPagina;
  const pacotesPaginados = pacotesFiltrados.slice(inicioPaginacao, inicioPaginacao + itensPorPagina);
  const fimPaginacao = Math.min(inicioPaginacao + itensPorPagina, pacotesFiltrados.length);

  const kpiPacotesAtivos = packages.filter(isActivePackage).length;
  const kpiTotalSessoes = packages.reduce((acc, p) => acc + (p.qtd_sessoes || 0), 0);
  const kpiReceitaAtivos = packages.filter(isActivePackage).reduce((acc, p) => acc + toMoney(p.valor_total), 0);
  const kpiReceitaFinalizados = packages.filter(p => getPackageStatus(p) === 'Finalizado').reduce((acc, p) => acc + toMoney(p.valor_total), 0);
  const kpiReceitaAtivosFormatada = formatCurrency(kpiReceitaAtivos);
  const kpiReceitaFinalizadosFormatada = formatCurrency(kpiReceitaFinalizados);
  const kpiRenovar = packages.filter(isRenewSoon).length;
  const kpiPendentes = packages.filter(p => getPaymentStatus(p) !== 'Pago').length;

  const activeFilterCount = [
    statusFiltro !== 'Ativos',
    frequenciaFiltro !== 'Todos',
    tutorFiltro !== 'Todos',
    taxiFiltro !== 'Todos',
    proximaSessaoFiltro !== 'Todos',
    pagamentoFiltro !== 'Todos',
    termoBusca.trim() !== ''
  ].filter(Boolean).length;

  const renderFilterPanel = () => (
    <div className="pt-4 border-t border-slate-100 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as any)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            {(['Todos', 'Ativos', 'Finalizados', 'Cancelados', 'A vencer'] as const).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</span>
          <select value={frequenciaFiltro} onChange={(e) => setFrequenciaFiltro(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            <option value="Todos">Todos</option>
            {frequenciasDisponiveis.map((freq) => <option key={freq} value={freq}>{freq}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamento</span>
          <select value={pagamentoFiltro} onChange={(e) => setPagamentoFiltro(e.target.value as any)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            {(['Todos', 'Pago', 'Pendente', 'Parcial'] as const).map(opt => <option key={opt}>{opt}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordenar por</span>
          <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as any)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            {(['Próxima sessão', 'Menos sessões restantes', 'Mais recente', 'Maior pendência', 'Nome do pet'] as const).map(opt => <option key={opt}>{opt}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tutor</span>
          <select value={tutorFiltro} onChange={(e) => setTutorFiltro(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            <option>Todos</option>
            {tutoresDisponiveis.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pet Táxi</span>
          <select value={taxiFiltro} onChange={(e) => setTaxiFiltro(e.target.value as any)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            {(['Todos', 'Com táxi', 'Sem táxi'] as const).map(opt => <option key={opt}>{opt}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Próxima sessão</span>
          <select value={proximaSessaoFiltro} onChange={(e) => setProximaSessaoFiltro(e.target.value as any)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none text-xs font-bold text-slate-700">
            {(['Todos', 'Hoje', 'Próximos 7 dias', 'Sem agendamento', 'Atrasado'] as const).map(opt => <option key={opt}>{opt}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <button onClick={clearFilters} className="px-4 py-3 rounded-xl text-[11px] font-black text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-all">
          <i className="fa-solid fa-broom mr-2"></i>Limpar filtros
        </button>
        <span className="text-[11px] font-black text-emerald-600">{pacotesFiltrados.length} resultados</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      {/* MODAL DE CONFIRMAÇÃO UI - CANCELAMENTO PACOTE */}
      {pacoteParaCancelar && (
        <div className="app-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 text-center animate-in zoom-in duration-300 border border-slate-100">
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
                 <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Confirmação</h3>
              <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">
                 Deseja realmente cancelar este pacote e todos os agendamentos futuros de <span className="text-rose-500">{pacoteParaCancelar.pets?.nome}</span>?
              </p>
              <div className="flex gap-4">
                 <button 
                   onClick={() => setPacoteParaCancelar(null)}
                   className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                 >VOLTAR</button>
                 <button 
                   onClick={confirmCancelPackage}
                   className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95"
                 >
                   {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'CONFIRMAR'}
                 </button>
              </div>
           </div>
        </div>
      )}

      <header className="flex flex-wrap items-center gap-4 bg-white p-5 md:p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 min-w-0 shrink-0 order-1">
           <div className="w-14 h-14 md:w-16 md:h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
             <i className="fa-solid fa-layer-group text-2xl"></i>
           </div>
           <div className="min-w-0">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-tight">Pacotes Ativos</h2>
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.16em] truncate">Controle de Fidelidade Igui Birigui</p>
           </div>
        </div>
        {!isReadOnly && (
          <button onClick={() => { setEditingPackageData(null); setIsModalOpen(true); }} className="order-2 md:order-3 shrink-0 bg-[#00897B] hover:bg-[#00796f] text-white px-5 md:px-7 py-3.5 rounded-2xl font-black shadow-lg shadow-teal-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider">
            <i className="fa-solid fa-plus"></i> <span>Novo pacote</span>
          </button>
        )}
        <div className="relative order-3 md:order-2 w-full md:w-auto md:flex-1 min-w-0">
          <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="text"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="Buscar por nome do pet, tutor, telefone ou nº do pacote..."
            className="w-full pl-14 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-slate-700 text-sm transition-all"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {[
          { label: 'Pacotes Ativos', value: kpiPacotesAtivos, hint: null, icon: 'fa-circle-check', tone: 'teal' },
          { label: 'Valor dos ativos', value: kpiReceitaAtivosFormatada, hint: 'Pacotes em aberto', icon: 'fa-dollar-sign', tone: 'teal' },
          { label: 'A receber', value: kpiPendentes, hint: 'Pagamentos em aberto', icon: 'fa-wallet', tone: 'amber' }
        ].map((kpi) => (
          <div key={kpi.label} className={`min-h-[132px] md:min-h-[112px] rounded-[1.45rem] p-5 md:p-4 text-white relative overflow-hidden border border-white/10 ${kpi.tone === 'amber' ? 'bg-gradient-to-br from-[#F59E0B] via-[#F2860B] to-[#C2570C] shadow-[0_16px_32px_rgba(217,119,6,0.22)]' : 'bg-gradient-to-br from-[#00897B] via-[#007F75] to-[#075E59] shadow-[0_16px_32px_rgba(0,137,123,0.18)]'}`}>
            <div className="relative z-10 flex min-h-[84px] md:min-h-[76px] flex-col justify-between">
              <p className="text-[10px] md:text-[11px] font-black text-white/78 uppercase tracking-[0.14em] leading-tight">{kpi.label}</p>
              <div className="min-w-0">
                <p className="text-3xl md:text-[1.85rem] font-black tracking-tight leading-none truncate" title={String(kpi.value)}>{kpi.value}</p>
                {kpi.hint && <p className={`text-[11px] font-black mt-2 md:mt-1.5 leading-snug break-words ${kpi.tone === 'amber' ? 'text-amber-50/95' : 'text-teal-100/95'}`}>{kpi.hint}</p>}
              </div>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 md:w-12 md:h-12 rounded-2xl border border-white/10 bg-white/7 flex items-center justify-center opacity-45">
              <i className={`fa-solid ${kpi.icon} text-3xl md:text-[1.65rem] text-white/70`}></i>
            </div>
            <div className="absolute -right-8 -bottom-10 w-32 h-32 rounded-full bg-white/8"></div>
          </div>
        ))}
      </div>

      <p className="text-center md:text-left text-[11px] font-bold text-slate-400 tracking-wide px-1">
        {kpiRenovar} para renovar · {packages.filter(hasSessionToday).length} banhos hoje · {kpiTotalSessoes} sessões em {packages.length} pacotes · {kpiReceitaFinalizadosFormatada} em ciclos concluídos
      </p>

      <section className="rounded-[1.7rem] border border-slate-100 bg-white p-4 md:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1 min-w-0">
            {[
              { id: 'ativos', label: 'Ativos', icon: 'fa-circle-check' },
              { id: 'renovar', label: 'Para renovar', icon: 'fa-rotate' },
              { id: 'pendentes', label: 'Pendentes', icon: 'fa-wallet' },
              { id: 'hoje', label: 'Banhos de hoje', icon: 'fa-calendar-day' }
            ].map((item) => (
              <button key={item.id} onClick={() => applyQuickFilter(item.id as any)} className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-2 ${quickFilter === item.id ? 'bg-[#00897B] text-white shadow-lg shadow-teal-500/20' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:border-teal-200'}`}>
                <i className={`fa-solid ${item.icon}`}></i>{item.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowFilterPanel(v => !v)} className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-2 border ${showFilterPanel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-100 hover:border-teal-200'}`}>
            <i className="fa-solid fa-sliders"></i>
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && <span className="bg-teal-600 text-white rounded-full px-2 py-0.5">{activeFilterCount}</span>}
            <i className={`fa-solid fa-chevron-down text-[9px] transition-transform ${showFilterPanel ? 'rotate-180' : ''}`}></i>
          </button>
        </div>

        {showFilterPanel && renderFilterPanel()}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="px-3 py-2 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-black border border-emerald-100"><i className="fa-regular fa-circle-check mr-1"></i>Ativos: {kpiPacotesAtivos}</span>
        <span className="px-3 py-2 rounded-full bg-slate-50 text-slate-600 text-[11px] font-black border border-slate-100"><i className="fa-regular fa-circle-check mr-1"></i>Finalizados: {packages.filter(p => getPackageStatus(p) === 'Finalizado').length}</span>
        <span className="px-3 py-2 rounded-full bg-orange-50 text-orange-600 text-[11px] font-black border border-orange-100"><i className="fa-regular fa-clock mr-1"></i>A vencer: {kpiRenovar}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        {loading && packages.length === 0 ? (
          <div className="col-span-full py-20 text-center"><i className="fa-solid fa-circle-notch fa-spin text-4xl text-teal-600"></i></div>
        ) : pacotesPaginados.map(p => {
          const total = p.qtd_sessoes || 0;
          const concluded = getCompletedCount(p);
          const progress = getProgress(p);
          const nextSession = getNextSession(p);
          const lastBath = getLastBath(p);
          const status = getPackageStatus(p);
          const payment = getPaymentStatus(p);
          const frequency = getFrequency(p);
          const servicesNames = getServicesText(p);
          const remaining = getRemainingSessions(p);

          const statusClass = status === 'A vencer'
            ? 'bg-orange-50 text-orange-600 border-orange-100'
            : status === 'Finalizado'
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : status === 'Cancelado'
                ? 'bg-rose-50 text-rose-600 border-rose-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-100';
          const frequencyClass = frequency === 'Semanal'
            ? 'bg-blue-50 text-blue-600'
            : frequency === 'Quinzenal'
              ? 'bg-violet-50 text-violet-600'
              : 'bg-teal-50 text-teal-600';

          return (
            <article key={p.id} className="bg-white rounded-[1.45rem] shadow-[0_12px_30px_rgba(15,23,42,0.08)] border border-slate-100 overflow-hidden group hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.12)] transition-all">
              <div className="p-4 md:p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <button className="w-16 h-16 rounded-[1.3rem] bg-teal-50 flex items-center justify-center text-teal-600 font-black text-2xl border-2 border-white shadow-sm shrink-0 overflow-hidden" onClick={() => openDetails(p)} aria-label={`Abrir pacote de ${p.pets?.nome || 'pet'}`}>
                    {p.pets?.foto_url ? <img src={p.pets.foto_url} alt={p.pets?.nome || 'Pet'} className="w-full h-full object-cover" /> : (p.pets?.nome?.charAt(0) || <i className="fa-solid fa-paw text-xl"></i>)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-slate-900 text-lg leading-tight truncate">{p.pets?.nome || 'Pet sem nome'}</h3>
                        <p className="text-xs text-slate-500 font-bold truncate">Tutor: {p.clientes?.nome || 'Não informado'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${frequencyClass}`}>{frequency}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {servicesNames.slice(0, 2).map((name) => <span key={name} className="px-2 py-1 rounded-lg bg-slate-50 text-slate-500 text-[9px] font-black uppercase border border-slate-100 truncate max-w-full">{name}</span>)}
                      {servicesNames.length > 2 && <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-400 text-[9px] font-black">+{servicesNames.length - 2}</span>}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-black text-slate-700">{concluded} / {total} sessões</p>
                    <p className="text-[11px] font-black text-slate-700">{progress}%</p>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${status === 'A vencer' ? 'bg-orange-500' : 'bg-[#00897B]'}`} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-bold flex items-center gap-2"><i className="fa-regular fa-calendar"></i>Próxima sessão</span>
                    <span className="font-black text-slate-800 text-right">{nextSession ? `${formatDateBR(nextSession.data_agendamento)} - ${String(nextSession.horario_inicio || '').substring(0, 5)}` : 'Sem agendamento'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-bold flex items-center gap-2"><i className="fa-solid fa-shower"></i>Último banho</span>
                    <span className="font-black text-slate-800 text-right">{lastBath ? formatDateBR(getBathDisplayDate(lastBath)) : '--/--/--'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400 font-bold flex items-center gap-2"><i className="fa-solid fa-wallet"></i>Valor do pacote</span>
                    <span className="font-black text-slate-900 text-right">{formatCurrency(toMoney(p.valor_total))}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase ${statusClass}`}>{status}</span>
                  <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${payment === 'Pago' ? 'bg-emerald-50 text-emerald-700' : payment === 'Parcial' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>{payment}</span>
                  {remaining <= 2 && isActivePackage(p) && <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-black uppercase">Renovar em breve</span>}
                  {hasNoNextSession(p) && <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-black uppercase">Sem próximo banho</span>}
                  {hasTaxi(p) && <span className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-[10px] font-black uppercase"><i className="fa-solid fa-taxi mr-1"></i>Táxi</span>}
                </div>
              </div>

              <div className="px-4 md:px-5 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center gap-2">
                <button onClick={() => openDetails(p)} className="flex-1 py-3 rounded-xl bg-[#00897B] text-white text-[11px] font-black shadow-lg shadow-teal-500/20 hover:bg-[#00796f] transition-all">Ver detalhes</button>
                <button onClick={() => handleSendPackageReminder(p)} title="WhatsApp" className="w-11 h-11 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-emerald-500 hover:border-emerald-100 transition-all"><i className="fa-brands fa-whatsapp"></i></button>
                <button onClick={() => openDetails(p)} title="Agendar / sessões" className="w-11 h-11 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-teal-600 hover:border-teal-100 transition-all"><i className="fa-regular fa-calendar"></i></button>
                {!isReadOnly && (
                  <button onClick={() => setPacoteParaCancelar(p)} title="Cancelar pacote" className="w-11 h-11 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all"><i className="fa-solid fa-trash-can"></i></button>
                )}
              </div>
            </article>
          );
        })}

        {!loading && pacotesFiltrados.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 font-bold italic bg-white rounded-3xl border border-dashed border-slate-200">
            {termoBusca ? `Nenhum pacote encontrado para "${termoBusca}"` : "Nenhum pacote encontrado para esta unidade."}
          </div>
        )}
      </div>

      {!loading && pacotesFiltrados.length > 0 && (
        <footer className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-500">
            Mostrando {inicioPaginacao + 1} a {fimPaginacao} de {pacotesFiltrados.length} pacotes
          </p>
          <div className="flex items-center justify-between md:justify-end gap-3">
            <div className="flex items-center gap-1">
              <button disabled={safePaginaAtual === 1} onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} className="w-9 h-9 rounded-xl border border-slate-100 text-slate-500 disabled:opacity-30"><i className="fa-solid fa-chevron-left text-xs"></i></button>
              {Array.from({ length: Math.min(totalPaginas, 5) }).map((_, idx) => {
                const page = idx + 1;
                return <button key={page} onClick={() => setPaginaAtual(page)} className={`w-9 h-9 rounded-xl text-xs font-black ${safePaginaAtual === page ? 'bg-[#00897B] text-white shadow-lg shadow-teal-500/20' : 'text-slate-500 hover:bg-slate-50'}`}>{page}</button>;
              })}
              {totalPaginas > 5 && <span className="px-2 text-slate-400 text-xs font-black">...</span>}
              <button disabled={safePaginaAtual === totalPaginas} onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} className="w-9 h-9 rounded-xl border border-slate-100 text-slate-500 disabled:opacity-30"><i className="fa-solid fa-chevron-right text-xs"></i></button>
            </div>
            <select value={itensPorPagina} onChange={(e) => setItensPorPagina(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-100 text-xs font-black text-slate-600 outline-none">
              {[12, 16, 24, 48].map((qtd) => <option key={qtd} value={qtd}>{qtd} por página</option>)}
            </select>
          </div>
        </footer>
      )}

      {/* Modal de Criação/Edição de Pacote */}
      {isModalOpen && (
        <PacoteFormModal
          unit={unit}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          editingPackage={editingPackageData}
          onClose={() => setIsModalOpen(false)}
          onSaved={fetchData}
        />
      )}

      {/* Modal de Detalhes do Pacote */}
      {isDetailModalOpen && selectedPackage && (
        <PacoteDetalhesModal 
          pack={selectedPackage}
          unit={unit}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsDetailModalOpen(false)}
          onRefresh={fetchData}
          onEdit={handleEditPackage}
        />
      )}
    </div>
  );
};

export default Pacotes;
