
import React, { useState, useEffect, useRef } from 'react';
import { Unit, Client, Pet, Employee, Service, Appointment, UserProfile } from '../types';
import ClienteModal from './ClienteModal';
import AgendamentoDetalhesModal from './AgendamentoDetalhesModal'; // TEST
import CadastroPet from './CadastroPet';
import PacoteFormModal from './PacoteFormModal';
import PetSpeciesTag from './PetSpeciesTag';
import { registrarAtividade } from '../services/logger';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';
import { calculateAppointmentTotals } from '../services/pricing';
import { registrarPagamentoPacote, garantirFinanceiroMovimento } from '../services/pacotePayments';
import { compareNomePtBr } from '../services/sorting';

interface AppointmentsProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
}

const Appointments: React.FC<AppointmentsProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentAppointmentId, setCurrentAppointmentId] = useState<number | string | null>(null);
  
  const [appointments, setAppointments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [viewingAppt, setViewingAppt] = useState<any>(null);
  const [activeCardMenuId, setActiveCardMenuId] = useState<number | string | null>(null);
  const [expandedObservationId, setExpandedObservationId] = useState<string | null>(null);
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [showTaxiRouteMenu, setShowTaxiRouteMenu] = useState(false);
  const [loadingTaxiRoute, setLoadingTaxiRoute] = useState<'manha' | 'tarde' | null>(null);
  const [taxiRoutePreview, setTaxiRoutePreview] = useState<any | null>(null);
  const [isPacoteModalOpen, setIsPacoteModalOpen] = useState(false);
  const [finalizingAppointmentId, setFinalizingAppointmentId] = useState<number | string | null>(null);
  const [notifyingAppointmentId, setNotifyingAppointmentId] = useState<number | string | null>(null);

  // Novo modal de cadastro rápido
  const [isQuickClientModalOpen, setIsQuickClientModalOpen] = useState(false);
  const [isQuickPetModalOpen, setIsQuickPetModalOpen] = useState(false);

  const [confirmacao, setConfirmacao] = useState<{
    visivel: boolean, 
    acao: 'cancelar' | 'finalizar' | 'erro' | 'info' | null, 
    mensagem: string,
    callback?: () => void
  }>({ visivel: false, acao: null, mensagem: '' });

  const [toast, setToast] = useState<{ visivel: boolean; mensagem: string; tipo: 'sucesso' | 'erro' | 'info' }>({ 
    visivel: false, 
    mensagem: '', 
    tipo: 'info' 
  });

  const showToast = (mensagem: string, tipo: 'sucesso' | 'erro' | 'info' = 'info') => {
    setToast({ visivel: true, mensagem, tipo });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visivel: false }));
    }, 4000);
  };

  const getCleanObservation = (...values: Array<string | null | undefined>) => {
    const invalidDefaults = [
      'nenhuma restricao',
      'nenhuma restrição',
      'nenhuma observacao',
      'nenhuma observação',
      'nao informado',
      'não informado',
      'sem observacao',
      'sem observação'
    ];

    return values
      .map((value) => String(value || '').trim())
      .find((value) => value && !invalidDefaults.some((defaultText) => value.toLowerCase().includes(defaultText))) || '';
  };

  const renderObservationNote = (
    id: string,
    title: string,
    text: string,
    icon: string,
    tone: 'pet' | 'client'
  ) => {
    if (!text) return null;

    const isExpanded = expandedObservationId === id;
    const canToggle = text.length > 120;
    const toneClasses = tone === 'pet'
      ? 'border-l-teal-400 bg-teal-50/55 text-teal-600'
      : 'border-l-sky-400 bg-sky-50/60 text-sky-600';

    return (
      <div className={`rounded-2xl border border-slate-100 border-l-4 ${toneClasses} px-4 py-3`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-7 h-7 rounded-xl bg-white/75 flex items-center justify-center shrink-0 shadow-sm">
            <i className={`fa-solid ${icon} text-[11px]`}></i>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</p>
            <p className={`mt-1 text-xs font-semibold leading-relaxed text-slate-700 break-words ${isExpanded ? '' : 'line-clamp-2'}`}>
              {text}
            </p>
            {canToggle && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedObservationId(isExpanded ? null : id);
                }}
                className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-colors"
              >
                {isExpanded ? 'Recolher' : 'Ver observação'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const cleanAddressPart = (value: unknown) => String(value || '').trim();

  const buildMapsDestination = (appt: any) => {
    const client = appt.clientes || appt.pets?.clientes || {};
    const directAddress = cleanAddressPart(appt.endereco_busca || appt.pet_taxi_endereco || client.endereco_completo);

    if (directAddress) return directAddress;

    const street = cleanAddressPart(client.logradouro || client.endereco);
    const number = cleanAddressPart(client.numero);
    const complement = cleanAddressPart(client.complemento);
    const neighborhood = cleanAddressPart(client.bairro);
    const city = cleanAddressPart(client.cidade);
    const state = cleanAddressPart(client.estado || client.uf);
    const cep = cleanAddressPart(client.cep);

    if (!street) return '';

    const parts = [
      street && number ? `${street}, ${number}` : street,
      complement,
      neighborhood,
      city,
      state,
      cep
    ].filter(Boolean);

    return parts.join(', ');
  };

  const openMapsRoute = (appt: any) => {
    const enderecoCompleto = buildMapsDestination(appt);
    const hasMinimumAddress = enderecoCompleto.length >= 10;

    if (!hasMinimumAddress) {
      showToast('Endereço do cliente não cadastrado ou incompleto para traçar a rota.', 'info');
      return;
    }

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const isTaxiAppointment = (appt: any) => Boolean(appt.tem_taxi || appt.pet_taxi);

  const isCancelledStatus = (status?: string) => {
    const normalized = normalizeStatusLabel(status);
    return normalized === 'CANCELADO' || normalized === 'CANCELADA';
  };

  const isFinalizedStatus = (status?: string) => {
    const normalized = normalizeStatusLabel(status);
    return ['FINALIZADO', 'FINALIZADA', 'CONCLUIDO', 'CONCLUIDA'].includes(normalized);
  };

  function normalizeStatusLabel(status?: string) {
    return String(status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  const parseAppointmentTimeForRoute = (value: unknown) => {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return {
      label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      minutes: hours * 60 + minutes,
      turno: hours * 60 + minutes < 12 * 60 ? 'manha' as const : 'tarde' as const
    };
  };

  const getTaxiRouteStopsCount = (turno: 'manha' | 'tarde') => {
    const addresses = new Set<string>();

    appointments.forEach((appt: any) => {
      if (!isTaxiAppointment(appt) || isCancelledStatus(appt.status)) return;
      const timeInfo = parseAppointmentTimeForRoute(appt.horario_inicio);
      if (!timeInfo || timeInfo.turno !== turno) return;

      const client = appt.clientes || appt.pets?.clientes;
      const pet = appt.pets;
      const address = buildMapsDestination({ ...appt, clientes: client });
      if (!client?.id || !pet?.id || address.length < 10) return;
      addresses.add(address.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase());
    });

    return addresses.size;
  };

  const handleGenerateTaxiRoute = async (turno: 'manha' | 'tarde') => {
    setLoadingTaxiRoute(turno);
    setShowTaxiRouteMenu(false);
    try {
      const { data, error } = await supabaseClient.functions.invoke('gerar-rota-taxi', {
        body: {
          unidadeId: unit.id,
          data: selectedDate,
          turno
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTaxiRoutePreview(data);
    } catch (err: any) {
      console.error('Erro ao gerar rota do táxi:', err);
      showToast(err.message || 'Não foi possível gerar a rota do táxi.', 'erro');
    } finally {
      setLoadingTaxiRoute(null);
    }
  };

  const openMapsUrl = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const formatRouteDistance = (meters?: number | null) => {
    if (!meters) return '--';
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
  };

  const formatRouteDuration = (seconds?: number | null) => {
    if (!seconds) return '--';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h${rest ? ` ${rest}min` : ''}`;
  };

  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayBR());
  const [viewMonth, setViewMonth] = useState<Date>(new Date()); 
  
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [availablePets, setAvailablePets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | string | ''>('');
  const [appointmentDate, setAppointmentDate] = useState(selectedDate);
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  
  const [selectedServiceIds, setSelectedServiceIds] = useState<Array<number | string>>([]);
  const [valorDesconto, setValorDesconto] = useState<number>(0);
  const [valorAcrescimo, setValorAcrescimo] = useState<number>(0);

  const [paymentMethod, setPaymentMethod] = useState('');
  const [isPaidModal, setIsPaidModal] = useState(false);
  const [isPetTaxi, setIsPetTaxi] = useState(false);
  const [petTaxiEndereco, setPetTaxiEndereco] = useState('');
  const [valorTransporte, setValorTransporte] = useState<number>(0);

  const mainItemValuesForm = selectedServiceIds.map(id => Number(services.find(s => s.id === id)?.preco_base || 0));
  const appointmentTotals = calculateAppointmentTotals({
    mainItemValues: mainItemValuesForm,
    extraItemValues: [],
    valorTransporte: isPetTaxi ? valorTransporte : 0,
    valorDesconto,
    valorAcrescimo,
    isPacote: false,
    valorTotalSalvo: 0,
    valorServicosSalvo: 0
  });

  // Estados para Busca e Filtros (Client-side)
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'Todos' | 'Finalizado' | 'A Realizar' | 'Em Andamento'>('Todos');
  const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Pacote' | 'Avulso'>('Todos');
  const [filtroPagamento, setFiltroPagamento] = useState<'Todos' | 'Pago' | 'Pendente'>('Todos');
  const [filtroTransporte, setFiltroTransporte] = useState<'Todos' | 'Com Táxi' | 'Sem Táxi'>('Todos');

  const mobileTimeOptions = React.useMemo(() => {
    const options: string[] = [];
    for (let hour = 7; hour <= 20; hour++) {
      for (const minute of [0, 15, 30, 45]) {
        options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    return options;
  }, []);

  useEffect(() => {
    fetchData();
  }, [unit.id, selectedDate]);

  useEffect(() => {
    const handleClickOutside = () => setActiveCardMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Lógica Inteligente de Preenchimento de Endereço
  useEffect(() => {
    if (selectedClient) {
      // Tenta montar o endereço juntando as peças possíveis (logradouro ou endereco legado)
      const rua = selectedClient.logradouro || (selectedClient as any).endereco || '';
      const num = selectedClient.numero || '';
      const bairro = selectedClient.bairro || '';

      if (rua) {
        const enderecoCompleto = `${rua}${num ? ', ' + num : ''}${bairro ? ' - ' + bairro : ''}`;
        setPetTaxiEndereco(enderecoCompleto);
      } else {
        setPetTaxiEndereco(''); // Cadastro Expresso ou incompleto não tem endereço
      }
    } else {
      setPetTaxiEndereco('');
    }
  }, [selectedClient]);

  const fetchData = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    try {
      const { data: empData } = await supabaseClient.from('funcionarios').select('*').eq('unidade_id', unit.id);
      setEmployees(empData || []);

      const { data: srvData } = await supabaseClient.from('servicos').select('*');
      setServices((srvData || []).slice().sort(compareNomePtBr));

      const { data: apptData } = await supabaseClient
        .from('agendamentos')
        .select(`
          *,
          pets (
            *,
            clientes:clientes!pets_cliente_id_fkey (
              id,
              nome,
              telefone,
              telefone_adicional,
              email,
              notas_internas,
              restricoes,
              logradouro,
              cep,
              numero,
              bairro,
              complemento,
              cidade,
              estado
            )
          ),
          clientes:clientes!agendamentos_cliente_id_fkey (
            id,
            nome,
            telefone,
            telefone_adicional,
            email,
            notas_internas,
            restricoes,
            logradouro,
            cep,
            numero,
            bairro,
            complemento,
            cidade,
            estado
          ),
          funcionarios (nome),
          pacotes (
            *,
            agendamentos (id, data_agendamento, horario_inicio)
          ),
          agendamento_itens (
            id,
            descricao,
            tipo,
            eh_extra,
            valor,
            valor_extra,
            valor_cobrado,
            servico_id,
            servicos (nome, preco_base)
          )
        `)
        .eq('unidade_id', unit.id)
        .eq('data_agendamento', selectedDate)
        .order('horario_inicio', { ascending: true });
        
      if (apptData) {
        const processedAppts = apptData.map((appt: any) => {
          const cardClient = appt.clientes || appt.pets?.clientes || {};
          const normalizedAppt = {
            ...appt,
            cardClient,
            clienteRestricoes: getCleanObservation(cardClient.restricoes),
            petObservacoes: getCleanObservation(appt.pets?.notas_internas, appt.pets?.restricoes)
          };

          // Numeracao da sessao e apenas cosmetica: qualquer falha aqui (ex.: dado
          // legado malformado em uma sessao irma do mesmo pacote) nao pode derrubar
          // o agendamento inteiro da listagem do dia.
          if (appt.pacote_id && appt.pacotes?.agendamentos) {
            try {
              const sortedPackageAppts = [...appt.pacotes.agendamentos].sort((a, b) => {
                const dateCompare = (a.data_agendamento || '').localeCompare(b.data_agendamento || '');
                if (dateCompare !== 0) return dateCompare;
                return (a.horario_inicio || '').localeCompare(b.horario_inicio || '');
              });
              const index = sortedPackageAppts.findIndex(a => a.id === appt.id);
              if (index !== -1) {
                return { ...normalizedAppt, numero_sessao: index + 1 };
              }
            } catch (numeroSessaoErr) {
              console.error('Erro ao calcular numero da sessao do pacote (nao bloqueante):', numeroSessaoErr, appt.id);
            }
          }
          return normalizedAppt;
        });
        setAppointments(processedAppts);
        
        if (viewingAppt) {
          const updated = processedAppts.find(a => a.id === viewingAppt.id);
          if (updated) setViewingAppt(updated);
        }
      } else {
        setAppointments([]);
      }
    } catch (err) {
      console.error("Erro ao carregar dados de agendamento:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setIsEditing(false);
    setCurrentAppointmentId(null);
    setSelectedClient(null);
    setClientSearch('');
    setSelectedPetId('');
    setAppointmentDate(selectedDate);
    setAppointmentTime('09:00');
    setSelectedServiceIds([]);
    setValorDesconto(0);
    setValorAcrescimo(0);
    setPaymentMethod('');
    setIsPaidModal(false);
    setIsPetTaxi(false);
    setPetTaxiEndereco('');
    setValorTransporte(0);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (appt: any) => {
    setViewingAppt(appt);
    setShowPaymentSelector(false);
    setIsDetailModalOpen(true);
  };

  const handleStartEdit = (appt?: any) => {
    const target = appt || viewingAppt;
    if (!target) return;
    
    setIsEditing(true);
    setCurrentAppointmentId(target.id);
    setSelectedClient(target.pets?.clientes || null);
    setClientSearch(target.pets?.clientes?.nome || '');
    
    if (target.pets?.clientes?.id) {
       supabaseClient
        .from('pets')
        .select('*')
        .eq('cliente_id', target.pets.clientes.id)
        .then(({data}: any) => setAvailablePets(data || []));
    }

    setSelectedPetId(target.pet_id);
    setAppointmentDate(target.data_agendamento);
    setAppointmentTime(String(target.horario_inicio || '09:00').substring(0, 5));
    
    const initialServiceIds = target.agendamento_itens
      .filter((it: any) => !it.eh_extra && it.tipo !== 'adicional')
      .map((it: any) => it.servico_id);
    setSelectedServiceIds(initialServiceIds);
    setValorDesconto(Number(target.valor_desconto || 0));
    setValorAcrescimo(Number(target.valor_acrescimo || 0));

    setPaymentMethod(target.forma_pagamento || '');
    setIsPaidModal(target.pago || false);
    setIsPetTaxi(target.tem_taxi || target.pet_taxi || false);
    setPetTaxiEndereco(target.endereco_busca || target.pet_taxi_endereco || '');

    const taxiVal = Number(target.valor_transporte || 0);
    setValorTransporte(taxiVal);

    setIsDetailModalOpen(false);
    setIsModalOpen(true);
  };

  const handleQuickReceive = async (data: { method1: string, val1: number, method2?: string, val2?: number }) => {
    if (!viewingAppt || loading) return;
    setLoading(true);
    try {
      const payload: any = { 
        pago: true, 
        forma_pagamento: data.method1,
        valor_total: data.val1 // Salva o valor 1 na coluna principal se for dividido
      };

      if (data.method2) {
        payload.forma_pagamento_2 = data.method2;
        payload.valor_pagamento_2 = data.val2;
      } else {
        payload.forma_pagamento_2 = null;
        payload.valor_pagamento_2 = 0;
      }

      const { error } = await supabaseClient
        .from('agendamentos')
        .update(payload)
        .eq('id', viewingAppt.id);

      if (error) throw error;

      // Se o agendamento pertence a um pacote, marca o pacote como pago e
      // propaga pago=true para todos os outros agendamentos do mesmo pacote.
      if (viewingAppt.pacote_id) {
        await supabaseClient
          .from('pacotes')
          .update({ pago: true, forma_pagamento: data.method1, data_pagamento: viewingAppt.data_agendamento })
          .eq('id', viewingAppt.pacote_id);
        await supabaseClient
          .from('agendamentos')
          .update({ pago: true })
          .eq('pacote_id', viewingAppt.pacote_id);
      }

      setShowPaymentSelector(false);

      // Nota fiscal manual (Fase 2) so vale para agendamento avulso
      // (pacote_id nulo) - banho dentro de pacote nunca gera nota propria.
      if (!viewingAppt.pacote_id) {
        await garantirFinanceiroMovimento({
          supabaseClient,
          unitId: unit.id,
          agendamentoId: viewingAppt.id,
          clienteId: viewingAppt.cliente_id,
          petId: viewingAppt.pet_id,
          categoria: 'banho_avulso',
          origem: 'pagamento_agendamento',
          descricao: `Banho: ${viewingAppt.pets?.nome || 'Pet'}`,
          dataCompetencia: viewingAppt.data_agendamento,
          metodo1: data.method1,
          valor1: data.val1,
          metodo2: data.method2,
          valor2: data.val2,
          observacaoBase: `Pagamento do agendamento ${viewingAppt.id}`
        });
      }

      // Log de Auditoria
      const petName = viewingAppt.pets?.nome || 'Pet';
      const logMsg = data.method2 
        ? `Pet: ${petName} - Pagamento DIVIDIDO para agendamento ${viewingAppt.id}. V1: R$ ${data.val1} (${data.method1}), V2: R$ ${data.val2} (${data.method2})`
        : `Pet: ${petName} - Recebeu pagamento de R$ ${data.val1} via ${data.method1} para agendamento ${viewingAppt.id}`;

      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'Alteração de Pagamento', 
        logMsg,
        userProfile?.nome,
        userProfile?.cargo
      );

      await fetchData();
    } catch (err) {
      console.error("Erro ao receber pagamento:", err);
    } finally {
      setLoading(false);
    }
  };

  // Recebe o PACOTE inteiro a partir do modal de detalhes de uma sessao de
  // pacote. Usa o mesmo servico (registrarPagamentoPacote) chamado pela tela
  // de Pacotes, para nunca divergir do fluxo la existente.
  const handleQuickReceivePacote = async (data: { method1: string, val1: number, method2?: string, val2?: number }) => {
    if (!viewingAppt?.pacote_id || !viewingAppt?.pacotes || loading) return;
    setLoading(true);
    try {
      await registrarPagamentoPacote({
        supabaseClient,
        unitId: unit.id,
        pacoteId: viewingAppt.pacote_id,
        nomePacote: viewingAppt.pacotes.nome_pacote || viewingAppt.pacotes.nome,
        petNome: viewingAppt.pets?.nome,
        metodo1: data.method1,
        valor1: data.val1,
        dividirPagamento: Boolean(data.method2),
        metodo2: data.method2,
        valor2: data.val2,
        userEmail: userProfile?.email,
        userNome: userProfile?.nome,
        userCargo: userProfile?.cargo
      });

      setShowPaymentSelector(false);
      await fetchData();
      showToast('Pacote recebido com sucesso.', 'sucesso');
    } catch (err: any) {
      console.error('Erro ao receber pagamento do pacote:', err);
      showToast(`Falha ao receber pacote: ${err?.message || 'erro desconhecido.'}`, 'erro');
    } finally {
      setLoading(false);
    }
  };

  const updateAppointmentStatus = async (
    agendamentoId: number | string,
    novoStatus: string,
    options: {
      notificarAoFinalizar?: boolean;
      dataInicioReal?: string;
      dataFimReal?: string;
    } = {}
  ) => {
    const payload: any = { status: novoStatus };

    if (typeof options.notificarAoFinalizar === 'boolean') {
      payload.notificar_ao_finalizar = options.notificarAoFinalizar;
    }

    if (options.dataInicioReal) payload.data_inicio_real = options.dataInicioReal;
    if (options.dataFimReal) payload.data_fim_real = options.dataFimReal;

    const selectColumns = typeof options.notificarAoFinalizar === 'boolean'
      ? 'id,status,notificar_ao_finalizar'
      : 'id,status';

    const runUpdate = (updatePayload: any) => supabaseClient
      .from('agendamentos')
      .update(updatePayload)
      .eq('id', agendamentoId)
      .select(selectColumns)
      .single();

    let { data, error } = await runUpdate(payload);

    const schemaCacheMiss = error?.message?.includes("notificar_ao_finalizar")
      || error?.details?.includes("notificar_ao_finalizar")
      || error?.hint?.includes("notificar_ao_finalizar");

    if (schemaCacheMiss && typeof options.notificarAoFinalizar === 'boolean') {
      console.warn('Schema cache ainda nao reconheceu notificar_ao_finalizar; finalizando sem bloquear o atendimento.', error);
      const fallbackPayload = { ...payload };
      delete fallbackPayload.notificar_ao_finalizar;
      const fallbackResult = await supabaseClient
        .from('agendamentos')
        .update(fallbackPayload)
        .eq('id', agendamentoId)
        .select('id,status')
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    if (!data?.id) throw new Error('O Supabase nao confirmou a atualizacao do atendimento.');
    return data;
  };

  const performCancelAppointment = async (appt: any) => {
    setLoading(true);
    try {
      await updateAppointmentStatus(appt.id, 'Cancelado');
      
      // Log de Auditoria
      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'Cancelamento de Banho', 
        `Pet: ${appt.pets?.nome} - Cancelou agendamento ${appt.id}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setIsDetailModalOpen(false);
      await fetchData();
      showToast('Atendimento cancelado.', 'sucesso');
    } catch (err) {
      console.error("Erro ao cancelar agendamento:", err);
      showToast(`Falha ao cancelar atendimento: ${(err as any)?.message || 'erro desconhecido.'}`, 'erro');
    } finally {
      setLoading(false);
      setConfirmacao({ visivel: false, acao: null, mensagem: '' });
    }
  };

  const performReactivateAppointment = async (appt: any) => {
    setLoading(true);
    try {
      await updateAppointmentStatus(appt.id, 'Agendado');
      
      // Log de Auditoria
      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'Reativação de Agendamento', 
        `Pet: ${appt.pets?.nome} - Reativou agendamento ${appt.id}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setIsDetailModalOpen(false);
      await fetchData();
    } catch (err) {
      console.error("Erro ao reativar agendamento:", err);
      showToast("Falha ao reativar agendamento.", "erro");
    } finally {
      setLoading(false);
    }
  };

  const performStartAtendimento = async (appt: any) => {
    setLoading(true);
    try {
      await updateAppointmentStatus(appt.id, 'Em Andamento', { dataInicioReal: new Date().toISOString() });
      
      // Log de Auditoria
      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'Início de Atendimento', 
        `Pet: ${appt.pets?.nome} - Iniciou atendimento (Em Andamento) ${appt.id}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      await fetchData();
    } catch (err) {
      console.error("Erro ao iniciar atendimento:", err);
      showToast("Falha ao iniciar atendimento.", "erro");
    } finally {
      setLoading(false);
    }
  };

  const notifyFinishedAppointment = async (appt: any, origem: 'auto' | 'manual' = 'manual') => {
    setNotifyingAppointmentId(appt.id);
    try {
      const result = await enviarNotificacaoWhatsApp({
        supabaseClient,
        agendamentoId: appt.id,
        tipo: 'pronto',
        origem
      });

      if (!result?.ok) {
        const detail = result?.detalhe ? ` Motivo: ${result.detalhe}` : '';
        const fallback = result?.error || 'Erro desconhecido.';
        showToast(`Atendimento concluido - aviso nao enviado. ${detail || `Motivo: ${fallback}`}`, 'info');
        console.error('Falha no WhatsApp ao avisar cliente:', result?.error, result?.detalhe);
        registrarAtividade(
          unit.id,
          userProfile?.email || 'sistema',
          'WHATSAPP_AVISO_FINALIZADO_ERRO',
          `Falha ao avisar cliente sobre finalizacao do agendamento ${appt.id}: ${result?.error || result?.detalhe || 'Erro desconhecido'}`,
          userProfile?.nome,
          userProfile?.cargo
        );
        return false;
      }

      showToast('Atendimento concluido e cliente avisado!', 'sucesso');
      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'WHATSAPP_AVISO_FINALIZADO',
        `Avisou cliente sobre finalizacao do agendamento ${appt.id} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );
      return true;
    } catch (err: any) {
      console.error('Erro critico no WhatsApp ao avisar cliente:', err);
      showToast(`Atendimento concluido - aviso nao enviado. Motivo: ${err?.message || 'Erro inesperado.'}`, 'info');
      return false;
    } finally {
      setNotifyingAppointmentId(null);
    }
  };

  const performFinalizeAppointment = async (appt: any, notifyClient: boolean = true) => {
    setFinalizingAppointmentId(appt.id);
      setLoading(true);
    try {
      showToast('Concluindo...', 'info');
      await updateAppointmentStatus(appt.id, 'Finalizado', {
        notificarAoFinalizar: notifyClient,
        dataFimReal: new Date().toISOString()
      });

      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'Finalizacao de Atendimento',
        `Pet: ${appt.pets?.nome} - Finalizou atendimento ${appt.id}${!notifyClient ? ' (SEM AVISO)' : ''}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      if (appt.pacote_id && appt.pacotes) {
        const isLastSession = appt.numero_sessao === appt.pacotes.qtd_sessoes;

        if (isLastSession) {
          if (appt.pacotes.renovacao_automatica) {
            try {
              await renovarPacote(appt.pacotes);
              setConfirmacao({
                visivel: true,
                acao: 'info',
                mensagem: 'Pacote renovado automaticamente! Um novo ciclo foi gerado com status pendente.'
              });
            } catch (renovError) {
              console.error('Erro na renovacao automatica:', renovError);
            }
          } else {
            await supabaseClient.from('pacotes').update({ status: 'FINALIZADO' }).eq('id', appt.pacote_id);
          }
        }
      }

      setIsDetailModalOpen(false);
      await fetchData();
      showToast('Atendimento concluido.', 'sucesso');

      if (notifyClient) {
        await notifyFinishedAppointment({ ...appt, status: 'Finalizado' }, 'auto');
      }
    } catch (err: any) {
      console.error('Erro ao finalizar agendamento:', err);
      showToast(`Falha ao concluir atendimento: ${err?.message || 'erro desconhecido.'}`, 'erro');
    } finally {
      setLoading(false);
      setFinalizingAppointmentId(null);
      setConfirmacao(prev => (prev.acao === 'finalizar') ? { visivel: false, acao: null, mensagem: '' } : prev);
    }
  };

  const renovarPacote = async (pacoteAtual: any) => {
    // 1. Recuperar o cliente_id diretamente do cadastro do pet (Gatilho de Segurança)
    let clientId = null;
    if (pacoteAtual.pet_id) {
      const { data: petData, error: petErr } = await supabaseClient
        .from('pets')
        .select('cliente_id, nome')
        .eq('id', pacoteAtual.pet_id)
        .single();
      
      if (petErr || !petData?.cliente_id) {
        console.error("ERRO CRÍTICO: Pet sem dono vinculado interrompendo renovação.", { pet_id: pacoteAtual.pet_id });
        registrarAtividade(
          unit.id, 
          'SISTEMA', 
          'ALERTA_FALHA_RENOVACAO', 
          `Falha Crítica: O sistema tentou renovar um pacote para o Pet ID ${pacoteAtual.pet_id} (${petData?.nome || 'Desconhecido'}), mas o mesmo não possui cliente/dono vinculado. Processo abortado.`,
          'SISTEMA',
          'master'
        );
        return;
      }
      clientId = petData.cliente_id;
    }

    if (!clientId) return;

    // 2. Buscar sessões ordenadas para confirmar intervalo e última data
    const { data: sessionData } = await supabaseClient
      .from('agendamentos')
      .select('id, data_agendamento, horario_inicio, tem_taxi, valor_transporte, valor_total')
      .eq('pacote_id', pacoteAtual.id)
      .order('data_agendamento', { ascending: true })
      .order('horario_inicio', { ascending: true });

    if (!sessionData || sessionData.length < 1) return;

    const lastSession = sessionData[sessionData.length - 1];

    // Intervalo derivado da frequência do pacote (4 sessões = semanal, 2 sessões = quinzenal).
    // Não usar a distância observada entre a 1ª e a 2ª sessão: remarcações manuais corrompem esse cálculo.
    const intervalDays = pacoteAtual.qtd_sessoes === 4 ? 7 : pacoteAtual.qtd_sessoes === 2 ? 14 : 7;

    // 3. Clonar Pacote
    const newCiclo = (Number(pacoteAtual.ciclo_renovacao) || 1) + 1;
    const newPackData = {
      cliente_id: clientId,
      pet_id: pacoteAtual.pet_id,
      unidade_id: pacoteAtual.unidade_id,
      qtd_sessoes: pacoteAtual.qtd_sessoes,
      valor_total: pacoteAtual.valor_total,
      valor_transporte: pacoteAtual.valor_transporte,
      nome_pacote: `${pacoteAtual.nome_pacote || pacoteAtual.nome} (RENOVAÇÃO CICLO ${newCiclo})`,
      nome: `${pacoteAtual.nome_pacote || pacoteAtual.nome} (RENOVAÇÃO CICLO ${newCiclo})`,
      pago: false, // PENDENTE
      ativo: true,
      renovacao_automatica: true,
      status: 'ATIVO',
      pacote_anterior_id: pacoteAtual.id,
      ciclo_renovacao: newCiclo
    };

    const { data: newPack, error: pErr } = await supabaseClient
      .from('pacotes')
      .insert([newPackData])
      .select().single();

    if (pErr) throw pErr;

    // 4. Gerar novos agendamentos baseado no intervalo
    const newApptsPayload = [];
    let nextDate = new Date(lastSession.data_agendamento + 'T12:00:00');
    
    for (let i = 1; i <= pacoteAtual.qtd_sessoes; i++) {
        nextDate.setDate(nextDate.getDate() + intervalDays);
        const dateStr = nextDate.toISOString().split('T')[0];
        
        newApptsPayload.push({
            pet_id: pacoteAtual.pet_id,
            cliente_id: clientId,
            pacote_id: newPack.id,
            unidade_id: pacoteAtual.unidade_id,
            data_agendamento: dateStr,
            horario_inicio: lastSession.horario_inicio,
            valor_total: parseFloat(pacoteAtual.valor_total) / pacoteAtual.qtd_sessoes,
            valor_transporte: parseFloat(pacoteAtual.valor_transporte) / pacoteAtual.qtd_sessoes,
            status: 'Agendado',
            numero_sessao: i,
            tem_taxi: lastSession.tem_taxi
        });
    }

    const { data: createdAppts, error: aErr } = await supabaseClient
      .from('agendamentos')
      .insert(newApptsPayload)
      .select();

    if (aErr) throw aErr;

    // 5. Clonar itens (serviços) da primeira sessão do antigo
    const { data: oldItems } = await supabaseClient
      .from('agendamento_itens')
      .select('servico_id')
      .eq('agendamento_id', sessionData[0].id);

    if (oldItems && oldItems.length > 0) {
        const itemsToInsert: any[] = [];
        createdAppts.forEach(appt => {
            oldItems.forEach(item => {
                itemsToInsert.push({
                    unidade_id: pacoteAtual.unidade_id || unit.id,
                    agendamento_id: appt.id,
                    servico_id: item.servico_id,
                    descricao: item.servicos?.nome || null,
                    tipo: 'principal',
                    eh_extra: false,
                    valor: 0,
                    valor_extra: 0,
                    valor_cobrado: 0 
                });
            });
        });
        await supabaseClient.from('agendamento_itens').insert(itemsToInsert);
    }

    // 6. Finalizar o pacote antigo e desativar sua renovação para não duplicar
    await supabaseClient.from('pacotes').update({ status: 'FINALIZADO', renovacao_automatica: false }).eq('id', pacoteAtual.id);

    // Log de Renovação
    registrarAtividade(
      unit.id,
      userProfile?.email || 'sistema',
      'RENOVAR_PACOTE_AUTO',
      `Renovação automática processada para o pet_id: ${pacoteAtual.pet_id}. Novo pacote: ${newPack.id}`,
      'SISTEMA',
      'master'
    );

    // Recarregar dados para refletir mudanças
    await fetchData();
  };

  const handleClientSearch = async (val: string) => {
    setClientSearch(val);
    if (val.length < 2) {
      setClientResults([]);
      return;
    }
    // Isolamento por Unidade: V2 usa unidade_id como vínculo obrigatório de negócio.
    const { data } = await supabaseClient
      .from('clientes')
      .select('*')
      .ilike('nome', `%${val}%`)
      .eq('unidade_id', unit.id)
      .limit(5);
    setClientResults(data || []);
  };

  const selectClient = async (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.nome);
    setClientResults([]);
    
    const { data: petData } = await supabaseClient.from('pets').select('*').eq('cliente_id', client.id);
    setAvailablePets(petData || []);
    if (petData?.length) setSelectedPetId(petData[0].id);
  };

  const toggleServiceId = (id: number | string) => {
    setSelectedServiceIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const sanitizeAppointmentCreatePayload = (payload: Record<string, any>) => {
    const {
      id,
      created_at,
      updated_at,
      agendamento_itens,
      pets,
      clientes,
      pacotes,
      ...safePayload
    } = payload;

    return safePayload;
  };

  const saveAppointment = async () => {
    if (!selectedClient || !selectedPetId || selectedServiceIds.length === 0) {
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Selecione o Cliente, o Pet e ao menos 1 Serviço.' });
      return;
    }
    setLoading(true);
    try {
      // Trava de Segurança: Verificar propriedade do Pet no Banco de Dados antes de salvar
      const { data: petCheck, error: checkErr } = await supabaseClient
        .from('pets')
        .select('cliente_id, nome')
        .eq('id', selectedPetId)
        .single();

      if (checkErr || petCheck?.cliente_id !== selectedClient.id) {
        console.error("ERRO DE SEGURANÇA: Pet não pertence ao cliente informado.", { pet_id: selectedPetId, target_client: selectedClient.id });
        registrarAtividade(
          unit.id, 
          userProfile?.email || 'sistema', 
          'ALERTA_TRAVA_DONO', 
          `Interrupção de Segurança: Tentativa de agendar pet "${petCheck?.nome || '?'}" para cliente diferente do registrado no sistema.`,
          userProfile?.nome,
          userProfile?.cargo
        );
        throw new Error("Ocorreu um erro de segurança: Este pet não está vinculado ao cliente selecionado. O administrador foi notificado.");
      }

      const finalTotal = appointmentTotals.totalGeral;
      const taxiVal = isPetTaxi ? valorTransporte : 0;

      // Ajuste de nomes das chaves para snake_case conforme esperado pelo Supabase
      // Observacao: 'status' so entra no payload na criacao. Em edicao, o status
      // (Finalizado/Em Andamento/Cancelado/etc) e preservado - remarcar data/hora
      // pela tela de Agendamentos nao pode reverter o status de um atendimento.
      const apptPayload: Record<string, any> = {
        pet_id: selectedPetId,
        cliente_id: selectedClient?.id,
        unidade_id: unit.id,
        data_agendamento: appointmentDate,
        horario_inicio: appointmentTime,
        valor_total: finalTotal,
        valor_servicos: appointmentTotals.valorServicos,
        valor_desconto: valorDesconto,
        valor_acrescimo: valorAcrescimo,
        valor_transporte: taxiVal,
        tem_taxi: isPetTaxi,
        endereco_busca: isPetTaxi ? petTaxiEndereco : null,
        forma_pagamento: paymentMethod,
        pago: isPaidModal
      };

      if (!isEditing) {
        apptPayload.status = 'Agendado';
      }

      // Trava de Segurança Final: Garantir cliente_id no Payload
      if (!apptPayload.cliente_id) {
        throw new Error("Por favor, selecione um cliente cadastrado para garantir a integridade do agendamento.");
      }

      let apptId = isEditing ? currentAppointmentId : null;
      if (isEditing && apptId) {
        const { error: updateError } = await supabaseClient.from('agendamentos').update(apptPayload).eq('id', apptId);
        if (updateError) throw updateError;
        
        // Log de Auditoria
        const petName = availablePets.find(p => p.id === selectedPetId)?.nome || 'Pet';
        registrarAtividade(
          unit.id, 
          userProfile?.email || 'sistema', 
          'Edição de Agendamento', 
          `Pet: ${petName} - Editou agendamento ${apptId}. Valor Total: R$ ${finalTotal.toFixed(2)} (Serviços: R$ ${appointmentTotals.valorServicos.toFixed(2)} + Táxi: R$ ${taxiVal.toFixed(2)})`,
          userProfile?.nome,
          userProfile?.cargo
        );

        await supabaseClient
          .from('agendamento_itens')
          .delete()
          .eq('agendamento_id', apptId)
          .eq('eh_extra', false);
      } else {
        const createPayload = sanitizeAppointmentCreatePayload(apptPayload);
        const { data, error: insertError } = await supabaseClient.from('agendamentos').insert([createPayload]).select().single();
        if (insertError) throw insertError;
        apptId = data.id;

        // Log de Auditoria
        const petName = availablePets.find(p => p.id === selectedPetId)?.nome || 'Pet';
        registrarAtividade(
          unit.id, 
          userProfile?.email || 'sistema', 
          'Novo Agendamento', 
          `Pet: ${petName} - Criou novo agendamento ${apptId}. Valor Total: R$ ${finalTotal.toFixed(2)} (Serviços: R$ ${appointmentTotals.valorServicos.toFixed(2)} + Táxi: R$ ${taxiVal.toFixed(2)})`,
          userProfile?.nome,
          userProfile?.cargo
        );
      }

      const itemsPayload = selectedServiceIds.map(srvId => {
        const service = services.find(s => s.id === srvId);
        return {
          unidade_id: unit.id,
          agendamento_id: apptId,
          servico_id: srvId,
          descricao: service?.nome || null,
          tipo: 'principal',
          eh_extra: false,
          valor: 0,
          valor_extra: 0,
          valor_cobrado: 0
        };
      });

      const { error: itemsError } = await supabaseClient.from('agendamento_itens').insert(itemsPayload);
      if (itemsError) throw itemsError;

      // --- GATILHO WHATSAPP (NÃO-BLOQUEANTE) ---
      if (!isEditing && selectedClient && selectedPetId) {
        const pet = availablePets.find(p => p.id === selectedPetId);
        if (pet && selectedClient.telefone) {
          const [y, m, d] = appointmentDate.split('-');
          const dataFormatada = `${d}/${m}`;
          const horaFormatada = String(appointmentTime).substring(0, 5);
          
          const msg = isPetTaxi
            ? `Olá ${selectedClient.nome}! Confirmamos o agendamento do(a) ${pet.nome} para o dia ${dataFormatada} às ${horaFormatada}. 🐾 Já anotamos aqui que o transporte está incluso e passaremos para buscar o(a) ${pet.nome}. Até logo!`
            : `Olá ${selectedClient.nome}! Confirmamos o agendamento do(a) ${pet.nome} para o dia ${dataFormatada} às ${horaFormatada}. 🐾 Esperamos por vocês na nossa unidade no horário combinado. Até logo!`;
          
          enviarNotificacaoWhatsApp({
            telefone: selectedClient.telefone,
            mensagem: msg,
            unidadeId: unit.id,
            supabaseClient,
            agendamentoId: apptId,
            tipo: 'confirmacao',
            origem: 'auto',
            forceDirect: true,
            whatsapp_nome_instancia: unit.whatsapp_nome_instancia,
            whatsapp_token: unit.whatsapp_token,
            whatsapp_url_servidor: unit.whatsapp_url_servidor,
            whatsapp_ativo: unit.whatsapp_ativo
          }).then(result => {
            if (result && !result.ok) {
              console.error('Falha no WhatsApp ao salvar:', result.error);
              showToast(`Salvo. (${result.error || 'Aviso WhatsApp não enviado'})`, 'info');
            }
          }).catch(err => {
            console.error('Erro crítico no WhatsApp ao salvar:', err);
            showToast('Agendamento salvo. (Erro no WhatsApp)', 'info');
          });
        }
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("Erro ao salvar agendamento:", err);
      setConfirmacao({ 
        visivel: true, 
        acao: 'erro', 
        mensagem: err.message || 'Erro desconhecido ao salvar agendamento.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemindWhatsApp = (appt: any) => {
    const clientPhone = appt.pets?.clientes?.telefone?.replace(/\D/g, '');
    if (!clientPhone) {
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Cliente sem telefone cadastrado.' });
      return;
    }

    const clientName = appt.pets?.clientes?.nome || 'Cliente';
    const petName = appt.pets?.nome || 'seu Pet';
    const [y, m, d] = appt.data_agendamento.split('-');
    const dataFormatada = `${d}/${m}`;
    const horaFormatada = String(appt.horario_inicio || '').substring(0, 5);
    
    // Mesma lógica de Táxi usada no sistema
    const hasTaxi = appt.tem_taxi || appt.pet_taxi || appt.agendamento_itens?.some((it: any) => 
      it.servicos?.nome?.toLowerCase().includes('táxi') || 
      it.servicos?.nome?.toLowerCase().includes('taxi')
    );

    const message = `Olá! 🐾 Passando para confirmar o banho do(a) ${petName} amanhã às ${horaFormatada}. Confirmado?`;

    showToast('Enviando lembrete...', 'info');
    
    enviarNotificacaoWhatsApp({
      telefone: clientPhone,
      mensagem: message,
      unidadeId: unit.id,
      supabaseClient,
      agendamentoId: appt.id,
      tipo: 'lembrete',
      origem: 'manual',
      forceDirect: true
    }).then(result => {
      if (result?.ok) {
        showToast('Lembrete enviado com sucesso!', 'sucesso');
        registrarAtividade(
          unit.id,
          userProfile?.email || 'sistema',
          'LEMBRETE_MANUAL_WA',
          `Enviou lembrete manual via WhatsApp para ${clientName} (Pet: ${petName})`,
          userProfile?.nome,
          userProfile?.cargo
        );
      } else {
        console.error('Falha ao enviar lembrete:', result?.error);
        showToast(result?.error || 'Aviso de WhatsApp não enviado.', 'info');
      }
    }).catch(err => {
      console.error('Erro ao enviar lembrete:', err);
      showToast('Erro no WhatsApp.', 'info');
    });
  };

  const generateCalendarDays = () => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  // Lógica de cálculo para o Painel de Resumo
  const normalizeAppointmentStatus = (status?: string) => String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const statsResumo = {
    total: appointments.length,
    finalizados: appointments.filter(a => a.status === 'Finalizado').length,
    emAndamento: appointments.filter(a => a.status === 'Em Andamento').length,
    cancelados: appointments.filter(a => {
      const status = normalizeAppointmentStatus(a.status);
      return status === 'CANCELADO' || status === 'CANCELADA';
    }).length,
    pendentes: appointments.filter(a => a.status === 'Agendado').length,
    pacotes: appointments.filter(a => a.pacote_id !== null).length
  };
  const taxiMorningStops = getTaxiRouteStopsCount('manha');
  const taxiAfternoonStops = getTaxiRouteStopsCount('tarde');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      {/* OVERLAY DE CONFIRMAÇÃO */}
      {confirmacao.visivel && (
        <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 border border-slate-100 animate-in zoom-in duration-300">
             <div className="flex flex-col items-center text-center space-y-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${confirmacao.acao === 'erro' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                   <i className={`fa-solid ${confirmacao.acao === 'erro' ? 'fa-circle-xmark' : 'fa-circle-info'}`}></i>
                </div>
                <h3 className="text-xl font-black text-slate-800">Mensagem</h3>
                <p className="text-sm font-bold text-slate-500 leading-relaxed">{confirmacao.mensagem}</p>
                <button onClick={() => setConfirmacao({ visivel: false, acao: null, mensagem: '' })} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase shadow-lg">Entendi</button>
             </div>
          </div>
        </div>
      )}

      {loadingTaxiRoute && (
        <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="app-modal-panel bg-white rounded-[2rem] shadow-2xl p-8 flex items-center gap-4">
            <i className="fa-solid fa-route fa-spin text-2xl text-teal-600"></i>
            <div>
              <p className="font-black text-slate-800">Calculando melhor rota...</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {loadingTaxiRoute === 'manha' ? 'Rota da manhã' : 'Rota da tarde'}
              </p>
            </div>
          </div>
        </div>
      )}

      {taxiRoutePreview && (
        <div className="app-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="app-modal-panel bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in duration-200">
            <header className="app-modal-header bg-teal-600 text-white p-5 md:p-7 flex items-start justify-between shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-100">Ferramenta operacional</p>
                <h3 className="text-xl md:text-2xl font-black">
                  Rota do Táxi — {taxiRoutePreview.turno === 'manha' ? 'Manhã' : 'Tarde'}
                </h3>
                <p className="text-xs font-bold text-teal-100 mt-1">
                  {selectedDate.split('-').reverse().join('/')} · {taxiRoutePreview.unidade?.nome || unit.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTaxiRoutePreview(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>

            <div className="app-modal-body flex-1 overflow-y-auto p-5 md:p-7 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Paradas</p>
                  <p className="text-2xl font-black text-slate-800">{taxiRoutePreview.quantidadeParadas || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pets</p>
                  <p className="text-2xl font-black text-slate-800">{taxiRoutePreview.quantidadePets || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Distância</p>
                  <p className="text-2xl font-black text-slate-800">{formatRouteDistance(taxiRoutePreview.distanciaMetros)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Duração</p>
                  <p className="text-2xl font-black text-slate-800">{formatRouteDuration(taxiRoutePreview.duracaoSegundos)}</p>
                </div>
              </div>

              {taxiRoutePreview.aviso && (
                <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm font-bold text-amber-800 flex items-start gap-3">
                  <i className="fa-solid fa-circle-info mt-0.5"></i>
                  <span>{taxiRoutePreview.aviso}</span>
                </div>
              )}

              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sequência</p>
                  <p className="text-sm font-black text-slate-800">
                    {taxiRoutePreview.modoOrdenacao === 'rota_otimizada' ? 'Rota otimizada' : 'Ordem por horário'}
                  </p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${taxiRoutePreview.modoOrdenacao === 'rota_otimizada' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                  {taxiRoutePreview.modoOrdenacao === 'rota_otimizada' ? 'Google Routes' : 'Manual'}
                </span>
              </div>

              {taxiRoutePreview.quantidadeParadas === 0 ? (
                <div className="rounded-3xl bg-slate-50 border border-slate-100 p-8 text-center">
                  <i className="fa-solid fa-route text-4xl text-slate-300 mb-3"></i>
                  <p className="font-black text-slate-700">Sem paradas para este período.</p>
                  <p className="text-sm font-bold text-slate-400 mt-1">Não há atendimentos com táxi e endereço válido neste turno.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black shrink-0">1</span>
                    <div>
                      <p className="font-black text-slate-800">{taxiRoutePreview.unidade?.nome || unit.name} — Saída</p>
                      <p className="text-xs font-bold text-slate-500 break-words">{taxiRoutePreview.unidade?.endereco}</p>
                    </div>
                  </div>

                  {taxiRoutePreview.paradas?.map((stop: any, index: number) => (
                    <div key={`${stop.endereco}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">{index + 2}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-slate-800 break-words">{stop.endereco}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{(stop.clientes || []).join(' / ')}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(stop.agendamentos || []).map((item: any) => (
                              <span key={item.id} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-[10px] font-black text-slate-600">
                                {item.pet} — {String(item.horario || '').substring(0, 5)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMapsUrl(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.endereco)}`)}
                          className="shrink-0 rounded-full bg-teal-50 text-teal-700 px-3 py-2 text-[10px] font-black hover:bg-teal-100"
                        >
                          Maps
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black shrink-0">{(taxiRoutePreview.paradas?.length || 0) + 2}</span>
                    <div>
                      <p className="font-black text-slate-800">{taxiRoutePreview.unidade?.nome || unit.name} — Retorno</p>
                      <p className="text-xs font-bold text-slate-500 break-words">{taxiRoutePreview.unidade?.endereco}</p>
                    </div>
                  </div>
                </div>
              )}

              {taxiRoutePreview.ignorados?.length > 0 && (
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                  <p className="text-sm font-black text-amber-800">
                    {taxiRoutePreview.ignorados.length} atendimentos não entraram na rota porque o endereço do cliente está ausente ou incompleto.
                  </p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {taxiRoutePreview.ignorados.map((item: any) => (
                      <div key={`${item.agendamentoId}-${item.pet}`} className="rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-amber-900">
                        {item.cliente} · {item.pet} {item.horario ? `· ${item.horario}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="app-modal-footer bg-slate-50 border-t border-slate-100 p-4 md:p-6 flex flex-col sm:flex-row gap-3 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setTaxiRoutePreview(null)}
                className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-100"
              >
                CANCELAR
              </button>
              {taxiRoutePreview.mapsUrl ? (
                <button
                  type="button"
                  onClick={() => openMapsUrl(taxiRoutePreview.mapsUrl)}
                  disabled={!taxiRoutePreview.mapsUrl}
                  className="px-6 py-3 rounded-2xl bg-teal-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-teal-500/20 disabled:opacity-50"
                >
                  ABRIR ROTA NO MAPS
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  {taxiRoutePreview.trechos?.map((segment: any, index: number) => (
                    <button
                      key={`${segment.titulo}-${index}`}
                      type="button"
                      onClick={() => openMapsUrl(segment.mapsUrl)}
                      className="px-4 py-3 rounded-2xl bg-teal-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-teal-500/20"
                    >
                      ABRIR {segment.titulo} NO MAPS
                    </button>
                  ))}
                </div>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* Header Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-4">
           <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><i className="fa-solid fa-calendar-day text-2xl"></i></div>
           <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">
                {selectedDate.split('-').reverse().join('/')}
              </h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">iG {unit.name}</p>
           </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTaxiRouteMenu(prev => !prev)}
              className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-2xl font-black flex items-center justify-center shadow-lg shadow-teal-500/20 active:scale-95 transition-all text-xs uppercase tracking-widest"
            >
              <i className="fa-solid fa-route mr-2"></i>
              ROTA DO TÁXI
            </button>

            {showTaxiRouteMenu && (
              <div className="absolute right-0 mt-3 w-[min(92vw,320px)] bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 p-3">
                {([
                  { turno: 'manha' as const, titulo: 'Rota da Manhã', subtitulo: 'ATÉ 12:00', count: taxiMorningStops },
                  { turno: 'tarde' as const, titulo: 'Rota da Tarde', subtitulo: 'APÓS 12:00', count: taxiAfternoonStops }
                ]).map((item) => {
                  const disabled = loadingTaxiRoute !== null;
                  return (
                    <button
                      key={item.turno}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleGenerateTaxiRoute(item.turno)}
                      className={`w-full rounded-2xl p-4 text-left flex items-center justify-between transition-all ${disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-teal-50 active:scale-[0.99]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                          <i className={`fa-solid ${item.turno === 'manha' ? 'fa-sun' : 'fa-moon'}`}></i>
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{item.titulo}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.subtitulo}</p>
                        </div>
                      </div>
                      <span className="text-right">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-teal-600">
                          {loadingTaxiRoute === item.turno ? 'Calculando...' : item.count > 0 ? `${item.count} paradas` : 'Verificar rota'}
                        </span>
                        <span className="block mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Ordem por horário
                        </span>
                      </span>
                    </button>
                  );
                })}
                <div className="mt-2 rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-[10px] font-bold text-amber-800 leading-relaxed">
                  Se a otimização automática estiver indisponível, as paradas serão exibidas por horário.
                </div>
              </div>
            )}
          </div>

          {!isReadOnly && (
            <button onClick={() => setIsPacoteModalOpen(true)} className="bg-[#7C3AED] hover:opacity-90 text-white px-8 py-3 rounded-2xl font-black flex items-center justify-center shadow-lg shadow-violet-500/20 active:scale-95 transition-all">
              <i className="fa-solid fa-plus mr-2"></i> NOVO PACOTE
            </button>
          )}

          {!isReadOnly && (
            <button onClick={handleOpenNew} className="bg-[#F59E0B] hover:opacity-90 text-white px-8 py-3 rounded-2xl font-black flex items-center justify-center shadow-lg shadow-amber-500/20 active:scale-95 transition-all">
              <i className="fa-solid fa-plus mr-2"></i> NOVO BANHO
            </button>
          )}
        </div>
      </div>

      {isPacoteModalOpen && (
        <PacoteFormModal
          unit={unit}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsPacoteModalOpen(false)}
          onSaved={fetchData}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lado Esquerdo: Calendário */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><i className="fa-solid fa-chevron-left text-xs"></i></button>
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{viewMonth.getMonth() + 1}/{viewMonth.getFullYear()}</span>
                <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><i className="fa-solid fa-chevron-right text-xs"></i></button>
              </div>
              <div className="grid grid-cols-7 gap-2">
                 {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dw => (
                    <div key={dw} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center pb-2">
                       {dw}
                    </div>
                 ))}
                 {generateCalendarDays().map((day, i) => (
                    day === null ? <div key={i}></div> : (
                      <button 
                        key={i} 
                        onClick={() => {
                          const newD = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                          // Forçamos o fuso de Brasília para garantir consistência
                          const brDate = newD.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                          const [d, m, y] = brDate.split('/');
                          setSelectedDate(`${y}-${m}-${d}`);
                        }}
                        className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${selectedDate.endsWith(`-${day.toString().padStart(2, '0')}`) ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {day}
                      </button>
                    )
                 ))}
              </div>
           </div>
        </div>

        {/* Lado Direito: Lista */}
        <div className="lg:col-span-3 space-y-4">
           
           {/* PAINEL DE RESUMO DO DIA */}
           <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              <div className="bg-[#009688] p-4 rounded-xl text-white text-center shadow-md">
                 <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Total do Dia</p>
                 <p className="text-xl font-black">{statsResumo.total}</p>
              </div>
              <div className="bg-[#009688] p-4 rounded-xl text-white text-center shadow-md">
                 <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Finalizados</p>
                 <p className="text-xl font-black">{statsResumo.finalizados}</p>
              </div>
              <div className="bg-amber-500 p-4 rounded-xl text-white text-center shadow-md border-2 border-white/20">
                 <p className="text-[10px] font-black uppercase opacity-80 tracking-widest mb-1">Em Andamento</p>
                 <p className="text-xl font-black">{statsResumo.emAndamento}</p>
              </div>
              <div className="relative overflow-hidden bg-[#DC2626] p-4 rounded-xl text-white text-center shadow-md shadow-rose-500/20">
                 <i className="fa-solid fa-ban absolute right-3 top-1/2 -translate-y-1/2 text-4xl opacity-15"></i>
                 <div className="relative">
                    <p className="text-[10px] font-black uppercase opacity-85 tracking-widest mb-1">Cancelados</p>
                    <p className="text-xl font-black">{statsResumo.cancelados}</p>
                 </div>
              </div>
              <div className="bg-[#009688] p-4 rounded-xl text-white text-center shadow-md">
                 <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">A Realizar</p>
                 <p className="text-xl font-black">{statsResumo.pendentes}</p>
              </div>
              <div className="bg-[#009688] p-4 rounded-xl text-white text-center shadow-md">
                 <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Sessões de Pacote</p>
                 <p className="text-xl font-black">{statsResumo.pacotes}</p>
              </div>
           </div>

           {/* BARRA DE BUSCA E FILTROS */}
           <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                 {/* Busca por Texto */}
                 <div className="flex-1 relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input 
                      type="text" 
                      placeholder="Buscar por pet ou tutor..." 
                      value={termoBusca}
                      onChange={(e) => setTermoBusca(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    />
                 </div>

                 {/* Filtro de Status */}
                 <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {(['Todos', 'Em Andamento', 'Finalizado', 'A Realizar'] as const).map((opt) => (
                      <button 
                        key={opt}
                        onClick={() => setFiltroStatus(opt)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filtroStatus === opt ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {opt}
                      </button>
                    ))}
                 </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-50">
                 {/* Filtro de Tipo */}
                 <div className="flex items-center space-x-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo:</span>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                       {(['Todos', 'Pacote', 'Avulso'] as const).map((opt) => (
                         <button 
                           key={opt}
                           onClick={() => setFiltroTipo(opt)}
                           className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filtroTipo === opt ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                         >
                           {opt}
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* Filtro de Pagamento */}
                 <div className="flex items-center space-x-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pagamento:</span>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                       {(['Todos', 'Pago', 'Pendente'] as const).map((opt) => (
                         <button 
                           key={opt}
                           onClick={() => setFiltroPagamento(opt)}
                           className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filtroPagamento === opt ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                         >
                           {opt}
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* Filtro de Transporte */}
                 <div className="flex items-center space-x-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transporte:</span>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                       {(['Todos', 'Com Táxi', 'Sem Táxi'] as const).map((opt) => (
                         <button 
                           key={opt}
                           onClick={() => setFiltroTransporte(opt)}
                           className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${filtroTransporte === opt ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                         >
                           {opt}
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* Botão Limpar */}
                 {(termoBusca || filtroStatus !== 'Todos' || filtroTipo !== 'Todos' || filtroPagamento !== 'Todos' || filtroTransporte !== 'Todos') && (
                   <button 
                     onClick={() => {
                       setTermoBusca('');
                       setFiltroStatus('Todos');
                       setFiltroTipo('Todos');
                       setFiltroPagamento('Todos');
                       setFiltroTransporte('Todos');
                     }}
                     className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline ml-auto"
                   >
                     Limpar Filtros
                   </button>
                 )}
              </div>
           </div>

           {(() => {
              const agendamentosFiltrados = appointments.filter(appt => {
                // 1. Filtro de Busca
                const searchMatch = !termoBusca || 
                  appt.pets?.nome?.toLowerCase().includes(termoBusca.toLowerCase()) ||
                  appt.pets?.clientes?.nome?.toLowerCase().includes(termoBusca.toLowerCase()) ||
                  appt.agendamento_itens?.some((it: any) => it.servicos?.nome?.toLowerCase().includes(termoBusca.toLowerCase()));
                
                // 2. Filtro de Status
                let statusMatch = true;
                if (filtroStatus === 'Em Andamento') statusMatch = appt.status === 'Em Andamento';
                if (filtroStatus === 'Finalizado') statusMatch = appt.status === 'Finalizado';
                if (filtroStatus === 'A Realizar') statusMatch = appt.status === 'Agendado';

                // 3. Filtro de Tipo
                let tipoMatch = true;
                if (filtroTipo === 'Pacote') tipoMatch = !!appt.pacote_id;
                if (filtroTipo === 'Avulso') tipoMatch = !appt.pacote_id;

                // 4. Filtro de Pagamento
                let pagamentoMatch = true;
                const estaPago = appt.pacote_id ? appt.pacotes?.pago : appt.pago;
                if (filtroPagamento === 'Pago') pagamentoMatch = !!estaPago;
                if (filtroPagamento === 'Pendente') pagamentoMatch = !estaPago;

                // 5. Filtro de Transporte
                let transporteMatch = true;
                const temTransporte = appt.tem_taxi || appt.pet_taxi;
                if (filtroTransporte === 'Com Táxi') transporteMatch = !!temTransporte;
                if (filtroTransporte === 'Sem Táxi') transporteMatch = !temTransporte;

                return searchMatch && statusMatch && tipoMatch && pagamentoMatch && transporteMatch;
              });

              return agendamentosFiltrados.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {agendamentosFiltrados.map(appt => {
                    const cardClient = appt.cardClient || appt.clientes || appt.pets?.clientes || {};
                    const petObservation = appt.petObservacoes || '';
                    const clientObservation = appt.clienteRestricoes || '';
                    const hasTransport = appt.tem_taxi || appt.pet_taxi || appt.agendamento_itens?.some((it: any) => it.servicos?.nome?.toUpperCase().includes('TÁXI'));
                    const routeAddress = hasTransport ? buildMapsDestination(appt) : '';

                    return (
                     <div key={appt.id} className={`relative h-full ${activeCardMenuId === appt.id ? 'z-[100]' : 'z-10'}`}>
                       <div className="h-full rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.11),0_4px_10px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_36px_rgba(15,23,42,0.14),0_6px_14px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col relative isolate z-10 p-6 group">

                       {/* Faixa de status no canto (recorte isolado nesta caixinha, não no card inteiro,
                           para não cortar o menu de Ações que precisa aparecer por cima do card) */}
                       {(appt.status === 'Em Andamento' || appt.status === 'Finalizado' || appt.status === 'Cancelado') && (
                          <div className="absolute top-0 right-0 w-28 h-28 overflow-hidden pointer-events-none rounded-tr-[2rem] z-[2]" aria-hidden="true">
                             <div className={`absolute -right-12 top-5 w-40 rotate-45 text-center text-[9px] font-black uppercase tracking-widest py-1.5 shadow-md ${
                                appt.status === 'Em Andamento'
                                   ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                                   : appt.status === 'Finalizado'
                                   ? 'bg-gradient-to-r from-emerald-600 to-emerald-800 text-white'
                                   : 'bg-gradient-to-r from-slate-400 to-slate-500 text-white'
                             }`}>
                                {appt.status === 'Em Andamento' ? 'Em andamento' : appt.status}
                             </div>
                          </div>
                       )}

                       {/* Informações do Pet e Cliente */}
                       <div className="relative z-[2] min-w-0 cursor-pointer" onClick={() => handleOpenDetail(appt)}>
                          <div className="flex items-start gap-4">
                             {/* Horário */}
                             <div className="text-center shrink-0 pr-4 border-r border-slate-100">
                                <p className="text-2xl font-black text-slate-800 tracking-tighter leading-none">{String(appt.horario_inicio).substring(0, 5)}</p>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
                                  appt.status === 'Em Andamento' ? 'text-amber-500' :
                                  appt.status === 'Finalizado' ? 'text-emerald-500' :
                                  appt.status === 'Cancelado' ? 'text-slate-500' : 'text-slate-400'
                                }`}>
                                  {appt.status === 'Em Andamento' ? 'andamento' : appt.status === 'Finalizado' ? 'finalizado' : appt.status === 'Cancelado' ? 'cancelado' : 'início'}
                                </p>
                             </div>

                             {/* Avatar do pet */}
                             <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 font-black text-lg border-2 border-white shadow-sm shrink-0 overflow-hidden">
                                {appt.pets?.foto_url ? (
                                   <img src={appt.pets.foto_url} alt={appt.pets?.nome || 'Pet'} className="w-full h-full object-cover" />
                                ) : (
                                   appt.pets?.nome?.charAt(0) || <i className="fa-solid fa-paw"></i>
                                )}
                             </div>

                             <div className="min-w-0 flex-1 pr-10">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                   <h4 className="min-w-0 max-w-full font-black text-lg text-slate-800 truncate group-hover:text-amber-600 transition-colors">
                                      {appt.pets?.nome}
                                   </h4>
                                   <PetSpeciesTag especie={appt.pets?.especie} raca={appt.pets?.raca} />
                                </div>
                                <p className="text-xs text-slate-400 font-bold truncate flex items-center">
                                   <i className="fa-solid fa-user-tag mr-2 opacity-50 text-[10px]"></i> {cardClient.nome}
                                </p>
                             </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                             {appt.pacote_id && (
                                <span className="shrink-0 bg-indigo-50 text-indigo-500 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-indigo-100">
                                   Sessão {appt.numero_sessao || '?'}/{appt.pacotes?.qtd_sessoes || '?'}
                                </span>
                             )}
                             {appt.pacote_id && Number(appt.pacotes?.valor_total) > 0 && (
                                <span className="shrink-0 bg-violet-50 text-violet-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-violet-100">
                                   Pacote R$ {Number(appt.pacotes.valor_total).toFixed(2)}
                                </span>
                             )}
                             {Number(appt.valor_transporte) > 0 && (
                                <span className="shrink-0 bg-amber-50 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-amber-100">
                                   Táxi R$ {Number(appt.valor_transporte).toFixed(2)}
                                </span>
                             )}
                          </div>

                          {hasTransport && (
                             <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                                <p className="text-xs text-slate-400 font-bold truncate flex items-center min-w-0">
                                   <i className="fa-solid fa-location-dot mr-2 opacity-50 text-[10px] text-amber-500"></i>
                                   <span className="mr-1 shrink-0">Endereço:</span>
                                   <span className="text-slate-500 truncate">
                                      {routeAddress || 'Endereço não cadastrado'}
                                   </span>
                                </p>
                                <button
                                   type="button"
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      openMapsRoute(appt);
                                   }}
                                   aria-label={`Abrir rota de ${appt.pets?.nome || 'pet'} no Google Maps`}
                                   className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-black tracking-wide whitespace-nowrap shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
                                      routeAddress
                                         ? 'border-teal-100 bg-white/90 text-teal-800 hover:border-teal-200 hover:bg-teal-50'
                                         : 'border-slate-200 bg-white/80 text-slate-400'
                                   }`}
                                >
                                   <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4 shrink-0 drop-shadow-sm"
                                      fill="none"
                                   >
                                      <path d="M12 22s7-6.18 7-12A7 7 0 0 0 5 10c0 5.82 7 12 7 12Z" fill="#34A853" />
                                      <path d="M12 2a7 7 0 0 1 7 7.5c0 2.23-1.03 4.65-2.34 6.78L12 12V2Z" fill="#4285F4" />
                                      <path d="M12 22s-7-6.18-7-12c0-1.78.67-3.4 1.77-4.63L12 12v10Z" fill="#FBBC05" />
                                      <path d="M16.66 16.28C14.72 19.42 12 22 12 22v-10l4.66 4.28Z" fill="#EA4335" />
                                      <circle cx="12" cy="10" r="2.45" fill="white" />
                                      <circle cx="12" cy="10" r="1.25" fill="#1f2937" opacity="0.72" />
                                   </svg>
                                   Maps
                                </button>
                             </div>
                          )}
                         
                         {/* Lista de Micro-serviços */}
                         {(() => {
                           const baseItems = appt.agendamento_itens?.filter((it: any) => !it.eh_extra) ?? [];
                           const extraItems = appt.agendamento_itens?.filter((it: any) => it.eh_extra) ?? [];
                           const extraTotal = extraItems.reduce((sum: number, it: any) => sum + Number(it.valor_extra || it.valor_cobrado || it.valor || 0), 0);
                           const extraLabel = extraItems.length === 1
                             ? extraItems[0].servicos?.nome || extraItems[0].descricao || 'Extra'
                             : `${extraItems.length} extras`;
                           return (
                             <>
                               {extraItems.length > 0 && (
                                 <div className="flex items-center justify-between mt-3 px-3 py-2 rounded-lg" style={{ background: '#EAF3DE' }}>
                                   <span className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: '#27500A' }}>
                                     <i className="fa-solid fa-scissors text-[9px]"></i>
                                     EXTRA HOJE · {extraLabel}
                                   </span>
                                   {extraTotal > 0 && (
                                     <span className="text-[10px] font-black" style={{ color: '#27500A' }}>
                                       + {extraTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                     </span>
                                   )}
                                 </div>
                               )}
                               <div className="flex flex-wrap gap-2 mt-2">
                                 {baseItems.map((it: any) => (
                                   <span key={it.id} className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                                     {it.servicos?.nome}
                                   </span>
                                 ))}
                                 {extraItems.map((it: any) => (
                                   <span key={it.id} className="text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: '#D1FADF', color: '#166534' }}>
                                     <i className="fa-solid fa-scissors text-[8px]"></i>
                                     EXTRA · {it.servicos?.nome || it.descricao}
                                   </span>
                                 ))}
                                 {hasTransport && (
                                   <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                     🚕 TÁXI
                                   </span>
                                 )}
                               </div>
                             </>
                           );
                         })()}

                         {(petObservation || clientObservation) && (
                            <div className="mt-3 grid grid-cols-1 gap-2">
                               {renderObservationNote(
                                  `${appt.id}-pet`,
                                  'Observação do pet',
                                  petObservation,
                                  'fa-paw',
                                  'pet'
                               )}
                               {renderObservationNote(
                                  `${appt.id}-client`,
                                  'Observação do cliente',
                                  clientObservation,
                                  'fa-comment-dots',
                                  'client'
                               )}
                            </div>
                         )}
                      </div>

                      {/* Rodapé: Valor/Pagamento + Ações (mt-auto gruda no rodapé do card, pra todo card ficar do mesmo tamanho na mesma linha independente da quantidade de conteúdo) */}
                      <div className="relative z-[2] mt-auto pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                         <div className="min-w-0">
                            <p className="font-black text-xl text-slate-800 tracking-tighter leading-none">R$ {(parseFloat(appt.valor_total) || 0).toFixed(2)}</p>
                            <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 flex items-center ${(appt.pacote_id ? appt.pacotes?.pago : appt.pago) ? 'text-emerald-500' : 'text-rose-500'}`}>
                               <i className={`fa-solid ${(appt.pacote_id ? appt.pacotes?.pago : appt.pago) ? 'fa-circle-check' : 'fa-circle-exclamation'} mr-1 text-[8px]`}></i>
                               {(appt.pacote_id ? appt.pacotes?.pago : appt.pago) ? 'PAGO' : 'PENDENTE'}
                            </p>
                         </div>

                         <div className="relative flex items-center gap-1.5 shrink-0">
                            <button
                               onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt); }}
                               title="Ver detalhes"
                               className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 text-white text-[11px] font-black uppercase tracking-wide shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all"
                            >
                               <i className="fa-solid fa-file-lines text-[10px]"></i> Detalhes
                            </button>
                            <button
                               onClick={(e) => { e.stopPropagation(); handleRemindWhatsApp(appt); }}
                               title="Enviar lembrete via WhatsApp"
                               className="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-emerald-500 hover:border-emerald-100 transition-all flex items-center justify-center"
                            >
                               <i className="fa-brands fa-whatsapp"></i>
                            </button>
                            {!isFinalizedStatus(appt.status) && !isCancelledStatus(appt.status) && !isReadOnly && (
                               <button
                                  onClick={(e) => { e.stopPropagation(); handleStartEdit(appt); }}
                                  title="Alterar dados"
                                  className="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-amber-600 hover:border-amber-100 transition-all flex items-center justify-center"
                               >
                                  <i className="fa-solid fa-pen-to-square"></i>
                               </button>
                            )}
                            <button
                               onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCardMenuId(activeCardMenuId === appt.id ? null : appt.id);
                               }}
                               title="Mais ações"
                               className="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-slate-700 hover:border-slate-200 transition-all flex items-center justify-center"
                            >
                               <i className="fa-solid fa-gear"></i>
                            </button>
                            {!isCancelledStatus(appt.status) && !isReadOnly && (
                               <button
                                  onClick={(e) => { e.stopPropagation(); performCancelAppointment(appt); }}
                                  title="Cancelar atendimento"
                                  className="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all flex items-center justify-center"
                               >
                                  <i className="fa-solid fa-trash-can"></i>
                               </button>
                            )}

                            {/* Dropdown de Ações */}
                            {activeCardMenuId === appt.id && (
                               <div className="absolute right-0 top-full mt-2 w-52 bg-white !opacity-100 rounded-2xl shadow-2xl border border-slate-100 z-[9999] py-3 animate-in fade-in zoom-in duration-200 ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
                               <div className="px-4 py-2 border-b border-slate-50 mb-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ações do Agendamento</p>
                               </div>

                               {/* Opções de Ação */}
                               {appt.status === 'Agendado' && !isReadOnly && (
                                  <button onClick={() => { performStartAtendimento(appt); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-amber-600 hover:bg-amber-50 transition-colors border-b border-slate-50">
                                     <i className="fa-solid fa-play mr-3 text-amber-500 text-sm"></i> Iniciar Atendimento
                                  </button>
                               )}

                               {appt.status === 'Cancelado' && !isReadOnly && (
                                  <button onClick={() => { performReactivateAppointment(appt); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors border-b border-slate-50">
                                     <i className="fa-solid fa-rotate-left mr-3 text-blue-500 text-sm"></i> Reativar Agendamento
                                  </button>
                               )}

                               {!isFinalizedStatus(appt.status) && !isCancelledStatus(appt.status) && !isReadOnly && (
                                  <>
                                     <button
                                       onClick={() => { performFinalizeAppointment(appt); setActiveCardMenuId(null); }}
                                       disabled={finalizingAppointmentId === appt.id}
                                       className="w-full flex items-center px-5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors border-b border-slate-50 disabled:opacity-50"
                                     >
                                        <i className={`fa-solid ${finalizingAppointmentId === appt.id ? 'fa-circle-notch fa-spin' : 'fa-circle-check'} mr-3 text-emerald-500 text-sm`}></i>
                                        {finalizingAppointmentId === appt.id ? 'Concluindo...' : 'Concluir e Avisar'}
                                     </button>
                                     <button
                                       onClick={() => { performFinalizeAppointment(appt, false); setActiveCardMenuId(null); }}
                                       disabled={finalizingAppointmentId === appt.id}
                                       className="w-full flex items-center px-5 py-3 text-xs font-bold text-blue-500 hover:bg-blue-50 transition-colors border-b border-slate-50 disabled:opacity-50"
                                     >
                                        <i className={`fa-solid ${finalizingAppointmentId === appt.id ? 'fa-circle-notch fa-spin' : 'fa-check'} mr-3 text-blue-500 text-sm`}></i>
                                        {finalizingAppointmentId === appt.id ? 'Concluindo...' : 'Finalizar Sem Aviso'}
                                     </button>
                                  </>
                               )}

                               {isFinalizedStatus(appt.status) && !isReadOnly && (
                                  <button
                                    onClick={() => { notifyFinishedAppointment(appt, 'manual'); setActiveCardMenuId(null); }}
                                    disabled={notifyingAppointmentId === appt.id}
                                    className="w-full flex items-center px-5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors border-b border-slate-50 disabled:opacity-50"
                                  >
                                     <i className={`fa-brands ${notifyingAppointmentId === appt.id ? 'fa-whatsapp fa-bounce' : 'fa-whatsapp'} mr-3 text-emerald-500 text-sm`}></i>
                                     {notifyingAppointmentId === appt.id ? 'Enviando...' : 'Avisar Cliente'}
                                  </button>
                               )}

                               <button onClick={() => { handleOpenDetail(appt); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                  <i className="fa-solid fa-eye mr-3 text-purple-500"></i> Ver Detalhes
                               </button>
                               
                               {!isFinalizedStatus(appt.status) && !isCancelledStatus(appt.status) && !isReadOnly && (
                                  <button onClick={() => { handleStartEdit(appt); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                     <i className="fa-solid fa-pen-to-square mr-3 text-amber-500"></i> Alterar Dados
                                  </button>
                               )}
                               
                               {!(appt.pacote_id ? appt.pacotes?.pago : appt.pago) && !isCancelledStatus(appt.status) && !isReadOnly && (
                                  <button onClick={() => { setViewingAppt(appt); setShowPaymentSelector(true); setIsDetailModalOpen(true); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors">
                                     <i className="fa-solid fa-dollar-sign mr-3 text-emerald-500"></i> Receber Agora
                                  </button>
                               )}
                               
                               {!isCancelledStatus(appt.status) && !isReadOnly && (
                                  <button onClick={() => { performCancelAppointment(appt); setActiveCardMenuId(null); }} className="w-full flex items-center px-5 py-3 text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors border-t border-slate-50 mt-1">
                                     <i className="fa-solid fa-ban mr-3 text-rose-500"></i> Cancelar Atendimento
                                  </button>
                               )}
                            </div>
                         )}
                      </div>
                      </div>
                   </div>
                  </div>
                    );
                  })}
               </div>
             ) : (
                <div className="bg-white p-20 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center opacity-20">
                  <i className="fa-solid fa-calendar-xmark text-6xl mb-4"></i>
                  <p className="font-black uppercase tracking-widest">
                    {appointments.length === 0 ? 'Nenhum banho agendado' : 'Nenhum agendamento encontrado para estes filtros'}
                  </p>
                </div>
             );
           })()}
        </div>
      </div>

      {/* MODAL DE AGENDAMENTO (COM NOVO CADASTRO RÁPIDO) */}
      {isModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="app-modal-panel bg-white w-[95%] mx-auto max-w-md md:max-w-5xl md:w-full rounded-[2.5rem] shadow-2xl overflow-x-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <header className="app-modal-header bg-[#F59E0B] p-6 md:p-8 text-white flex justify-between items-center shrink-0">
               <h3 className="text-xl md:text-2xl font-black">{isEditing ? 'Alterar Agendamento' : 'Novo Banho'}</h3>
               <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl"><i className="fa-solid fa-xmark"></i></button>
            </header>
            <div className="app-modal-body flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-10 custom-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                  <div className="space-y-6">
                     <div className="space-y-2 relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">Tutor / Cliente *</label>
                        {!selectedClient ? (
                          <div className="relative">
                            <i className="fa-solid fa-user absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input type="text" value={clientSearch} onChange={(e) => handleClientSearch(e.target.value)} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all" placeholder="Buscar tutor..."/>
                            {clientResults.length > 0 || (clientSearch.length >= 2) ? (
                              <div className="absolute w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 overflow-hidden max-h-[300px] overflow-y-auto">
                                {clientResults.map(c => (
                                  <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-center space-x-4">
                                     <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs shrink-0">{c.nome.charAt(0)}</div>
                                     <span className="font-bold text-slate-800 text-sm truncate">{c.nome}</span>
                                  </button>
                                ))}
                                <button onClick={() => setIsQuickClientModalOpen(true)} className="w-full text-left px-5 py-4 hover:bg-amber-50 flex items-center space-x-4 border-t border-slate-100 text-amber-600">
                                   <i className="fa-solid fa-plus-circle"></i>
                                   <span className="font-black text-xs uppercase">Cadastrar "{clientSearch}"</span>
                                </button>
                              </div>
                            ) : null}
                            <p className="text-[9px] text-rose-500 font-bold mt-2 flex items-start gap-1.5 leading-tight">
                               <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                               Por favor, selecione um cliente cadastrado para garantir o envio dos lembretes de WhatsApp
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                             <span className="font-black text-slate-800 truncate mr-2">{selectedClient.nome}</span>
                             <button onClick={() => setSelectedClient(null)} className="text-xs text-amber-600 font-bold uppercase underline shrink-0">Trocar</button>
                          </div>
                        )}
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pet Selecionado *</label>
                        <select 
                          disabled={!selectedClient} 
                          value={selectedPetId} 
                          onChange={(e) => {
                            if (e.target.value === 'novo') {
                              setIsQuickPetModalOpen(true);
                            } else {
                              setSelectedPetId(e.target.value);
                            }
                          }} 
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all appearance-none"
                        >
                           <option value="">Selecione o pet...</option>
                           {availablePets.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                           {selectedClient && <option value="novo" className="text-amber-600 font-black">+ NOVO PET</option>}
                        </select>
                     </div>

                     {/* NOVO BLOCO: ADICIONAIS (PET TÁXI) */}
                     <div className="pt-4 space-y-4 border-t border-slate-50">
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex items-center space-x-3">
                              <i className="fa-solid fa-taxi text-amber-500"></i>
                              <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Incluir Pet Táxi (Leva e Traz)</span>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={isPetTaxi} onChange={(e) => setIsPetTaxi(e.target.checked)} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                           </label>
                        </div>
                        
                        {isPetTaxi && (
                           <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                              {/* Campo: Valor do Transporte */}
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Valor do Transporte (R$):</label>
                                 <div className="relative">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                                    <input 
                                       type="number" 
                                       value={valorTransporte} 
                                       onChange={(e) => setValorTransporte(Number(e.target.value))} 
                                       className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all" 
                                       placeholder="0.00"
                                    />
                                 </div>
                              </div>

                              <div className="space-y-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Endereço de Busca/Entrega</label>
                                 <div className="relative">
                                    <i className="fa-solid fa-map-location-dot absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                                    <input 
                                       type="text" 
                                       value={petTaxiEndereco} 
                                       onChange={(e) => setPetTaxiEndereco(e.target.value)} 
                                       className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all" 
                                       placeholder="Ex: Rua das Flores, 123 - Bairro"
                                    />
                                 </div>
                                 <p className="text-[9px] text-slate-400 italic ml-1">* Endereço capturado automaticamente do tutor.</p>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label><input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all"/></div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
                        <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="hidden md:block w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all"/>
                        <select value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="md:hidden w-full max-w-[calc(100vw-24px)] px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 transition-all overflow-y-auto">
                           {!mobileTimeOptions.includes(appointmentTime) && <option value={appointmentTime}>{appointmentTime}</option>}
                           {mobileTimeOptions.map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                     </div>
                  </div>
               </div>

               <div className="pt-8 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Serviços e Valores</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                     {services.map(s => (
                        <label key={s.id} className={`p-4 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${selectedServiceIds.includes(s.id) ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                           <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleServiceId(s.id)} />
                           <span className="text-xs font-bold text-slate-700">{s.nome}</span>
                        </label>
                     ))}
                  </div>
                  <div className="mt-8 p-6 md:p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100 space-y-6">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-2xl border border-amber-100">
                           <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Serviços</p>
                           <p className="font-black text-slate-800 text-lg">R$ {mainItemValuesForm.reduce((a, b) => a + b, 0).toFixed(2)}</p>
                        </div>
                        {isPetTaxi && (
                          <div className="bg-white p-4 rounded-2xl border border-amber-100">
                             <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Pet Táxi</p>
                             <p className="font-black text-slate-800 text-lg">R$ {Number(valorTransporte || 0).toFixed(2)}</p>
                          </div>
                        )}
                        <div className="bg-white p-4 rounded-2xl border border-amber-100">
                           <label className="text-[9px] font-black text-orange-500 uppercase mb-1 block">Desconto</label>
                           <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-orange-400 font-black text-sm">− R$</span>
                              <input
                                type="number"
                                min={0}
                                value={valorDesconto}
                                onChange={(e) => setValorDesconto(Math.max(0, Number(e.target.value) || 0))}
                                className="w-full pl-11 pr-1 py-0.5 bg-transparent outline-none font-black text-orange-600 text-lg"
                                placeholder="0.00"
                              />
                           </div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-amber-100">
                           <label className="text-[9px] font-black text-emerald-500 uppercase mb-1 block">Acréscimo</label>
                           <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-sm">+ R$</span>
                              <input
                                type="number"
                                min={0}
                                value={valorAcrescimo}
                                onChange={(e) => setValorAcrescimo(Math.max(0, Number(e.target.value) || 0))}
                                className="w-full pl-11 pr-1 py-0.5 bg-transparent outline-none font-black text-emerald-600 text-lg"
                                placeholder="0.00"
                              />
                           </div>
                        </div>
                     </div>

                     <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-center md:text-left">
                           <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Total Geral</p>
                           <p className="text-4xl font-black text-amber-600">R$ {appointmentTotals.totalGeral.toFixed(2)}</p>
                        </div>

                        <div className="flex flex-wrap md:flex-nowrap gap-2 w-full md:w-auto">
                          {['Pix', 'Dinheiro', 'Cartão'].map(m => (
                            <button key={m} onClick={() => setPaymentMethod(m)} className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${paymentMethod === m ? 'bg-amber-500 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>{m}</button>
                          ))}
                     </div>
                  </div>
               </div>
            </div>
            </div>
            <footer className="app-modal-footer p-4 md:p-8 bg-slate-50 border-t border-slate-100 flex flex-row justify-end gap-2 md:gap-4">
               <button onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none px-4 py-3 md:px-8 md:py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
               <button onClick={saveAppointment} disabled={loading || !selectedClient} className={`flex-[2] md:flex-none px-4 py-3 md:px-12 md:py-4 bg-[#F59E0B] text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center ${(!selectedClient || loading) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                 {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : 'SALVAR'}
               </button>
            </footer>
          </div>
        </div>
      )}

      {/* NOVO CADASTRO RÁPIDO VIA MODAL HÍBRIDO */}
      {isQuickClientModalOpen && (
        <ClienteModal 
          modo="rapido"
          client={{ nome: clientSearch }}
          unitId={unit.id}
          supabaseClient={supabaseClient}
          onClose={() => setIsQuickClientModalOpen(false)}
          onSave={(data) => {
            selectClient(data.cliente);
            if (data.pet) setSelectedPetId(data.pet.id);
            setIsQuickClientModalOpen(false);
          }}
          showToast={(txt, type) => setConfirmacao({ visivel: true, acao: type === 'error' ? 'erro' : 'info', mensagem: txt })}
        />
      )}

      {isQuickPetModalOpen && selectedClient && (
        <CadastroPet 
          clientId={selectedClient.id}
          clientName={selectedClient.nome}
          unitId={unit.id}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsQuickPetModalOpen(false)}
          onSave={(newPet) => {
            setAvailablePets(prev => [...prev, newPet]);
            setSelectedPetId(newPet.id);
            setIsQuickPetModalOpen(false);
          }}
          showToast={(txt, type) => setConfirmacao({ visivel: true, acao: type === 'error' ? 'erro' : 'info', mensagem: txt })}
        />
      )}

      {/* NOVO MODAL DE DETALHES RECONSTRUÍDO */}
      {isDetailModalOpen && viewingAppt && (
        <AgendamentoDetalhesModal 
          appt={viewingAppt}
          userProfile={userProfile}
          onClose={() => setIsDetailModalOpen(false)}
          onEdit={(appt) => handleStartEdit(appt)}
          onStartAtendimento={(appt) => performStartAtendimento(appt)}
          onReactivate={(appt) => performReactivateAppointment(appt)}
          onFinalize={(appt) => performFinalizeAppointment(appt)}
          onFinalizeNoNotice={(appt) => performFinalizeAppointment(appt, false)}
          onCancel={(appt) => performCancelAppointment(appt)}
          onQuickReceive={(data) => handleQuickReceive(data)}
          onQuickReceivePacote={(data) => handleQuickReceivePacote(data)}
          supabaseClient={supabaseClient}
          onRefresh={() => fetchData()}
        />
      )}

      {toast.visivel && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`${
            toast.tipo === 'sucesso' ? 'bg-emerald-500' : 
            toast.tipo === 'erro' ? 'bg-rose-500' : 'bg-slate-800'
          } text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 font-bold text-xs uppercase tracking-widest`}>
            {toast.tipo === 'sucesso' && <i className="fa-solid fa-circle-check"></i>}
            {toast.tipo === 'erro' && <i className="fa-solid fa-circle-exclamation"></i>}
            {toast.tipo === 'info' && <i className="fa-solid fa-circle-info"></i>}
            <span>{toast.mensagem}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Appointments;
