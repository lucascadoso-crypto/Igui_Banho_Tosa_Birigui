
import React, { useState, useEffect } from 'react';
import { Unit, Client, Pet, Service, Package } from '../types';
import PacoteDetalhesModal from './PacoteDetalhesModal';
import { registrarAtividade } from '../services/logger';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';

interface PacotesProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: any;
}

const Pacotes: React.FC<PacotesProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  // Estado para Confirmação de Cancelamento UI
  const [pacoteParaCancelar, setPacoteParaCancelar] = useState<any | null>(null);

  // Form States
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [availablePets, setAvailablePets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [packageTotalValue, setPackageTotalValue] = useState<number>(0);
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [startDate, setStartDate] = useState(getTodayBR());
  const [startTime, setStartTime] = useState('09:00');
  const [sessionCount, setSessionCount] = useState(4);
  const [interval, setInterval] = useState<'Weekly' | 'Bi-weekly'>('Weekly');
  const [generatedDates, setGeneratedDates] = useState<string[]>([]);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [originalStructuralValues, setOriginalStructuralValues] = useState({
    sessionCount: 4,
    interval: 'Weekly',
    startDate: getTodayBR()
  });

  const [isPetTaxi, setIsPetTaxi] = useState(false);
  const [valorTransportePacote, setValorTransportePacote] = useState<number>(0);
  const [renovacaoAutomatica, setRenovacaoAutomatica] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ nome: '', telefone: '', petNome: '' });

  useEffect(() => {
    fetchData();
  }, [unit.id]);

  useEffect(() => {
    generateDates();
  }, [startDate, sessionCount, interval]);

  const handleIntervalChange = (val: 'Weekly' | 'Bi-weekly') => {
    setInterval(val);
    setSessionCount(val === 'Weekly' ? 4 : 2);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: srvData } = await supabaseClient.from('servicos').select('*').order('nome');
      setServices(srvData || []);

      const { data: packData, error: packError } = await supabaseClient
        .from('pacotes')
        .select('*, pets(*), clientes(*), agendamentos(id, status, data_agendamento, horario_inicio)')
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
    const sortedAppts = [...(p.agendamentos || [])].sort((a, b) => a.data_agendamento.localeCompare(b.data_agendamento));
    
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

  const generateDates = () => {
    const dates = [];
    let current = new Date(startDate + 'T12:00:00');
    const step = interval === 'Weekly' ? 7 : 14;
    for (let i = 0; i < sessionCount; i++) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + step);
    }
    setGeneratedDates(dates);
  };

  const handleClientSearch = async (val: string) => {
    setClientSearch(val);
    if (val.length < 2) {
      setClientResults([]);
      return;
    }
    // Implementação do Isolamento por Unidade: busca clientes da unidade atual ou legados (null)
    const { data } = await supabaseClient
      .from('clientes')
      .select('*')
      .ilike('nome', `%${val}%`)
      .or(`unidade_preferencial_id.eq.${unit.id},unidade_preferencial_id.is.null`)
      .limit(5);
    setClientResults(data || []);
  };

  const selectClient = async (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.nome);
    setClientResults([]);
    setShowQuickAdd(false);
    const { data } = await supabaseClient.from('pets').select('*').eq('cliente_id', client.id);
    setAvailablePets(data || []);
    if (data?.length) setSelectedPetId(data[0].id);
  };

  const handleQuickAdd = async () => {
    if (!quickAddData.nome || !quickAddData.telefone || !quickAddData.petNome) {
      alert("Preencha todos os campos do cadastro rápido.");
      return;
    }
    setLoading(true);
    try {
      const { data: newClient, error: cErr } = await supabaseClient
        .from('clientes')
        .insert([{ nome: quickAddData.nome, telefone: quickAddData.telefone, unidade_preferencial_id: unit.id }])
        .select().single();
      if (cErr) throw cErr;
      const { data: newPet, error: pErr } = await supabaseClient
        .from('pets')
        .insert([{ cliente_id: newClient.id, nome: quickAddData.petNome, especie: 'Cachorro' }])
        .select().single();
      if (pErr) throw pErr;
      setSelectedClient(newClient);
      setClientSearch(newClient.nome);
      setAvailablePets([newPet]);
      setSelectedPetId(newPet.id);
      setShowQuickAdd(false);
      setQuickAddData({ nome: '', telefone: '', petNome: '' });
    } catch (err) {
      console.error("Erro no cadastro rápido:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePackage = async () => {
    if (!selectedClient || !selectedPetId || selectedServiceIds.length === 0 || generatedDates.length === 0) {
      alert("Preencha todos os campos obrigatórios, incluindo o Tutor (Cliente).");
      return;
    }
    setLoading(true);
    try {
      // Trava de Segurança: Verificar propriedade do Pet no Banco de Dados
      const { data: petCheck, error: checkErr } = await supabaseClient
        .from('pets')
        .select('cliente_id, nome')
        .eq('id', selectedPetId)
        .single();

      if (checkErr || petCheck?.cliente_id !== selectedClient.id) {
        console.error("ERRO CRÍTICO: Tentativa de vincular agendamento a pet sem dono correspondente.", { pet_id: selectedPetId, expected_owner: selectedClient.id });
        registrarAtividade(
          unit.id, 
          userProfile?.email || 'sistema', 
          'ALERTA_FALHA_SEGURANCA', 
          `Tentativa interrompida: Foi detectada uma tentativa de agendamento para o Pet ${petCheck?.nome || 'N/A'} (ID: ${selectedPetId}) sem vínculo correto com o tutor selecionado. Operação abortada por segurança.`,
          userProfile?.nome,
          userProfile?.cargo
        );
        throw new Error("Falha de Integridade: O pet selecionado não pertence ao cliente informado. Por favor, recarregue a página.");
      }

      const petName = petCheck.nome || 'Pet';
      const freqText = interval === 'Weekly' ? 'Semanal' : 'Quinzenal';
      const nomeAutomatico = `Pacote ${freqText} - ${petName}`;

      if (editingPackageId) {
        // Lógica de UPDATE
        const finalTotal = packageTotalValue + (isPetTaxi ? valorTransportePacote : 0);
        const taxiVal = isPetTaxi ? valorTransportePacote : 0;

        const { error: pErr } = await supabaseClient
          .from('pacotes')
          .update({
            nome: nomeAutomatico, 
            nome_pacote: nomeAutomatico, 
            cliente_id: selectedClient?.id,
            pet_id: selectedPetId, 
            qtd_sessoes: sessionCount,
            valor_total: finalTotal, 
            valor_transporte: taxiVal,
            renovacao_automatica: renovacaoAutomatica
          })
          .eq('id', editingPackageId);

        if (pErr) throw pErr;

        const hasStructuralChange = 
          sessionCount !== originalStructuralValues.sessionCount ||
          interval !== originalStructuralValues.interval ||
          startDate !== originalStructuralValues.startDate;

        if (hasStructuralChange) {
          // 1. Buscar sessões finalizadas para saber quantas restam
          const { data: allAppts } = await supabaseClient
            .from('agendamentos')
            .select('status')
            .eq('pacote_id', editingPackageId);
          
          const finishedCount = allAppts?.filter((a: any) => a.status === 'Finalizado').length || 0;
          const remainingToGenerate = sessionCount - finishedCount;

          // 2. Deletar sessões futuras (Agendado)
          await supabaseClient
            .from('agendamentos')
            .delete()
            .eq('pacote_id', editingPackageId)
            .eq('status', 'Agendado');

          if (remainingToGenerate > 0) {
            // 3. Gerar novas datas para as sessões restantes
            const newDates = [];
            let current = new Date(startDate + 'T12:00:00');
            const step = interval === 'Weekly' ? 7 : 14;
            for (let i = 0; i < remainingToGenerate; i++) {
              newDates.push(current.toISOString().split('T')[0]);
              current.setDate(current.getDate() + step);
            }

            const totalWithTaxi = packageTotalValue + (isPetTaxi ? valorTransportePacote : 0);
            const pricePerSession = totalWithTaxi / sessionCount;
            const taxiPerSession = isPetTaxi ? (valorTransportePacote / sessionCount) : 0;

            const appointmentsData = newDates.map((date, index) => ({
              pet_id: selectedPetId, 
              cliente_id: selectedClient?.id,
              pacote_id: editingPackageId, 
              unidade_id: unit.id,
              data_agendamento: date, 
              horario_inicio: startTime, 
              valor_total: pricePerSession, 
              valor_transporte: taxiPerSession,
              status: 'Agendado',
              numero_sessao: finishedCount + index + 1,
              tem_taxi: isPetTaxi
            }));

            const { data: appts, error: aErr } = await supabaseClient.from('agendamentos').insert(appointmentsData).select();
            if (aErr) throw aErr;

            // Inserir itens de serviço para os novos agendamentos
            const itemsPayload: any[] = [];
            appts.forEach(appt => {
              selectedServiceIds.forEach(srvId => {
                itemsPayload.push({ agendamento_id: appt.id, servico_id: srvId, valor_cobrado: 0 });
              });
            });
            if (itemsPayload.length > 0) {
              await supabaseClient.from('agendamento_itens').insert(itemsPayload);
            }
          }
        } else {
          // Lógica de UPDATE simples (Serviços/Táxi)
          // 1. Buscar IDs das sessões futuras
          const { data: futureAppts, error: fErr } = await supabaseClient
            .from('agendamentos')
            .select('id')
            .eq('pacote_id', editingPackageId)
            .eq('status', 'Agendado');
          
          if (fErr) throw fErr;

          if (futureAppts && futureAppts.length > 0) {
            const futureIds = futureAppts.map((a: any) => a.id);

            // 2. Atualizar flag de táxi, pet_id e valor_total (caso tenha mudado)
            const totalWithTaxi = packageTotalValue + (isPetTaxi ? valorTransportePacote : 0);
            const pricePerSession = totalWithTaxi / sessionCount;
            const taxiPerSession = isPetTaxi ? (valorTransportePacote / sessionCount) : 0;

            const { error: uErr } = await supabaseClient
              .from('agendamentos')
              .update({ 
                tem_taxi: isPetTaxi,
                pet_id: selectedPetId,
                cliente_id: selectedClient?.id,
                valor_total: pricePerSession,
                valor_transporte: taxiPerSession
              })
              .in('id', futureIds);
            
            if (uErr) throw uErr;

            // 3. Atualizar Serviços (agendamento_itens)
            // Deletar itens antigos das sessões futuras
            const { error: dErr } = await supabaseClient
              .from('agendamento_itens')
              .delete()
              .in('agendamento_id', futureIds);
            
            if (dErr) throw dErr;

            // Inserir novos itens
            const newItems: any[] = [];
            futureIds.forEach((apptId: number | string) => {
              selectedServiceIds.forEach(srvId => {
                newItems.push({ agendamento_id: apptId, servico_id: srvId, valor_cobrado: 0 });
              });
            });

            if (newItems.length > 0) {
              const { error: iErr } = await supabaseClient.from('agendamento_itens').insert(newItems);
              if (iErr) throw iErr;
            }
          }
        }
        
        registrarAtividade(
          unit.id,
          userProfile?.email || 'sistema',
          'Edição de Pacote',
          `Pet: ${petName} - Editou o pacote e atualizou sessões futuras`,
          userProfile?.nome,
          userProfile?.cargo
        );
      } else {
        // Lógica de INSERT (Original)
        const finalTotal = packageTotalValue + (isPetTaxi ? valorTransportePacote : 0);
        const taxiVal = isPetTaxi ? valorTransportePacote : 0;

        const { data: pack, error: pErr } = await supabaseClient
          .from('pacotes')
          .insert([{
            nome: nomeAutomatico, 
            nome_pacote: nomeAutomatico, 
            cliente_id: selectedClient?.id,
            pet_id: selectedPetId, 
            unidade_id: unit.id, 
            qtd_sessoes: sessionCount,
            valor_total: finalTotal, 
            valor_transporte: taxiVal,
            ativo: true,
            renovacao_automatica: renovacaoAutomatica
          }])
          .select().single();

        if (pErr) throw pErr;

        const pricePerSession = finalTotal / sessionCount;
        const taxiPerSession = taxiVal / sessionCount;

        const appointmentsData = generatedDates.map((date, index) => ({
          pet_id: selectedPetId, 
          cliente_id: selectedClient?.id,
          pacote_id: pack.id, 
          unidade_id: unit.id,
          data_agendamento: date, 
          horario_inicio: startTime, 
          valor_total: pricePerSession, 
          valor_transporte: taxiPerSession,
          status: 'Agendado',
          numero_sessao: index + 1,
          tem_taxi: isPetTaxi
        }));

        const { data: appts, error: aErr } = await supabaseClient.from('agendamentos').insert(appointmentsData).select();
        if (aErr) throw aErr;

        // Log de Auditoria
        registrarAtividade(
          unit.id,
          userProfile?.email || 'sistema',
          'Novo Pacote',
          `Pet: ${petName} - Criou um novo pacote para (${sessionCount} sessões). ID: ${pack.id}`,
          userProfile?.nome,
          userProfile?.cargo
        );

        const itemsPayload: any[] = [];
        appts.forEach(appt => {
          selectedServiceIds.forEach(srvId => {
            itemsPayload.push({ agendamento_id: appt.id, servico_id: srvId, valor_cobrado: 0 });
          });
        });
        await supabaseClient.from('agendamento_itens').insert(itemsPayload);
      }

      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (err) {
      console.error('[DEBUG] Falha crítica ao salvar pacote:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingPackageId(null);
    setSelectedClient(null);
    setClientSearch('');
    setSelectedServiceIds([]);
    setSelectedPetId('');
    setPackageTotalValue(0);
    setSessionCount(4);
    setIsPetTaxi(false);
    setRenovacaoAutomatica(false);
    setValorTransportePacote(0);
    setShowQuickAdd(false);
    setQuickAddData({ nome: '', telefone: '', petNome: '' });
  };

  const toggleService = (id: number | string) => {
    setSelectedServiceIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(sid => sid !== id);
      } else {
        return [...prev, id];
      }
    });
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

  const handleEditPackage = async (p: any) => {
    setIsDetailModalOpen(false);
    setEditingPackageId(p.id);
    
    // Pre-fill form
    setSelectedClient(p.clientes);
    setClientSearch(p.clientes?.nome || '');
    setSelectedPetId(p.pet_id);
    setSessionCount(p.qtd_sessoes);
    
    const taxiVal = Number(p.valor_transporte || 0);
    setValorTransportePacote(taxiVal);
    setPackageTotalValue(Number(p.valor_total) - taxiVal);
    
    setRenovacaoAutomatica(p.renovacao_automatica || false);
    setInterval(p.qtd_sessoes === 4 ? 'Weekly' : 'Bi-weekly');

    const initialInterval = p.qtd_sessoes === 4 ? 'Weekly' : 'Bi-weekly';
    const initialStartDate = p.agendamentos?.[0]?.data_agendamento || getTodayBR();

    setOriginalStructuralValues({
      sessionCount: p.qtd_sessoes,
      interval: initialInterval,
      startDate: initialStartDate
    });

    // Fetch pets for the client
    const { data: pets } = await supabaseClient.from('pets').select('*').eq('cliente_id', p.cliente_id);
    setAvailablePets(pets || []);

    // Fetch services for the package (from the first appointment)
    if (p.agendamentos && p.agendamentos.length > 0) {
      const { data: items } = await supabaseClient
        .from('agendamento_itens')
        .select('servico_id')
        .eq('agendamento_id', p.agendamentos[0].id);
      
      if (items) {
        setSelectedServiceIds(items.map((it: any) => it.servico_id));
      }
      
      setStartTime(p.agendamentos[0].horario_inicio?.substring(0, 5) || '09:00');
      setStartDate(p.agendamentos[0].data_agendamento);
      setIsPetTaxi(p.agendamentos[0].tem_taxi || false);
    }

    setIsModalOpen(true);
  };

  const kpiPacotesAtivos = packages.filter(p => p.ativo).length;
  const kpiTotalSessoes = packages.reduce((acc, p) => acc + (p.qtd_sessoes || 0), 0);
  const kpiReceitaAtivos = packages.filter(p => p.status?.toLowerCase() === 'ativo').reduce((acc, p) => acc + (parseFloat(p.valor_total) || 0), 0);
  const kpiReceitaAtivosFormatada = kpiReceitaAtivos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const kpiReceitaFinalizados = packages.filter(p => p.status?.toLowerCase() !== 'ativo').reduce((acc, p) => acc + (parseFloat(p.valor_total) || 0), 0);
  const kpiReceitaFinalizadosFormatada = kpiReceitaFinalizados.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const pacotesFiltrados = packages.filter(p => 
    p.pets?.nome?.toLowerCase().includes(termoBusca.toLowerCase()) || 
    p.clientes?.nome?.toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      {/* MODAL DE CONFIRMAÇÃO UI - CANCELAMENTO PACOTE */}
      {pacoteParaCancelar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 text-center animate-in zoom-in duration-300 border border-slate-100">
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

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-4">
           <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl"><i className="fa-solid fa-layer-group text-2xl"></i></div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Pacotes Ativos</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Controle de Fidelidade {unit.name}</p>
           </div>
        </div>
        {!isReadOnly && (
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-[#00897B] hover:opacity-90 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-teal-500/20 active:scale-95 transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i> NOVO PACOTE
          </button>
        )}
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#00897B] p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden min-w-0">
          <div className="relative z-10 min-w-0">
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1 truncate">Pacotes Ativos</p>
            <p className="text-xl sm:text-2xl lg:text-xl xl:text-3xl font-black truncate" title={String(kpiPacotesAtivos)}>
              {kpiPacotesAtivos}
            </p>
          </div>
          <i className="fa-solid fa-check-double absolute right-6 top-1/2 -translate-y-1/2 text-6xl opacity-10"></i>
        </div>
        <div className="bg-[#00897B] p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden min-w-0">
          <div className="relative z-10 min-w-0">
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1 truncate">Total em Sessões</p>
            <p className="text-xl sm:text-2xl lg:text-xl xl:text-3xl font-black truncate" title={String(kpiTotalSessoes)}>
              {kpiTotalSessoes}
            </p>
          </div>
          <i className="fa-solid fa-calendar-days absolute right-6 top-1/2 -translate-y-1/2 text-6xl opacity-10"></i>
        </div>
        <div className="bg-[#00897B] p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden min-w-0">
          <div className="relative z-10 min-w-0">
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1 truncate">Receita (Ativos)</p>
            <p className="text-xl sm:text-2xl lg:text-xl xl:text-3xl font-black truncate" title={kpiReceitaAtivosFormatada}>
              {kpiReceitaAtivosFormatada}
            </p>
          </div>
          <i className="fa-solid fa-sack-dollar absolute right-6 top-1/2 -translate-y-1/2 text-6xl opacity-10"></i>
        </div>
        <div className="bg-[#00897B] p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden min-w-0">
          <div className="relative z-10 min-w-0">
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1 truncate">Receita (Finalizados)</p>
            <p className="text-xl sm:text-2xl lg:text-xl xl:text-3xl font-black truncate" title={kpiReceitaFinalizadosFormatada}>
              {kpiReceitaFinalizadosFormatada}
            </p>
          </div>
          <i className="fa-solid fa-hand-holding-dollar absolute right-6 top-1/2 -translate-y-1/2 text-6xl opacity-10"></i>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input 
          type="text" 
          value={termoBusca} 
          onChange={(e) => setTermoBusca(e.target.value)} 
          placeholder="Buscar por nome do pet ou tutor..." 
          className="w-full pl-14 pr-5 py-4 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm focus:ring-2 focus:ring-teal-500 outline-none font-bold text-slate-700 transition-all"
        />
      </div>

      {/* Lista de Cards */}
      <div className="space-y-4">
        {loading && packages.length === 0 ? (
          <div className="py-20 text-center"><i className="fa-solid fa-circle-notch fa-spin text-4xl text-teal-600"></i></div>
        ) : pacotesFiltrados.map(p => {
          const total = p.qtd_sessoes || 4;
          const concluded = (p.agendamentos || []).filter((a: any) => a.status === 'Finalizado').length;
          const progress = (concluded / total) * 100;
          const createdDate = p.created_at ? p.created_at.split('T')[0] : '--';
          const firstAppt = (p.agendamentos || []).sort((a:any, b:any) => a.data_agendamento.localeCompare(b.data_agendamento))[0]?.data_agendamento;
          const lastAppt = (p.agendamentos || []).sort((a:any, b:any) => b.data_agendamento.localeCompare(a.data_agendamento))[0]?.data_agendamento;

          return (
            <div key={p.id} className="bg-white rounded-[1.8rem] shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-all">
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                
                {/* Coluna 1: Pet Info */}
                <div className="flex items-center space-x-4 min-w-[180px] cursor-pointer" onClick={() => openDetails(p)}>
                  <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 font-black text-xl border-2 border-white shadow-sm shrink-0">
                    {p.pets?.nome?.charAt(0) || 'P'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 text-base truncate group-hover:text-teal-700 transition-colors">{p.pets?.nome}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{p.clientes?.nome}</p>
                  </div>
                </div>

                {/* Coluna 2: Datas Importantes */}
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-calendar text-slate-300 text-[10px]"></i>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Criado</p>
                      <p className="text-[11px] font-bold text-slate-600">{formatDateBR(createdDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-calendar-check text-slate-300 text-[10px]"></i>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Primeiro</p>
                      <p className="text-[11px] font-bold text-slate-600">{formatDateBR(firstAppt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-calendar-day text-slate-300 text-[10px]"></i>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Último</p>
                      <p className="text-[11px] font-bold text-slate-600">{formatDateBR(lastAppt)}</p>
                    </div>
                  </div>
                </div>

                {/* Coluna 3: Badges */}
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-[9px] font-black">#{String(p.id).substring(0, 4).toUpperCase()}</span>
                  <span className="bg-teal-50 text-teal-600 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.qtd_sessoes === 4 ? 'Semanal' : 'Quinzenal'}</span>
                  {p.pago && (
                    <div className="w-7 h-7 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-[10px] shadow-sm">
                      <i className="fa-solid fa-dollar-sign"></i>
                    </div>
                  )}
                </div>

                {/* Coluna 4: Ações Expostas */}
                <div className="flex items-center gap-1.5 shrink-0 pl-4 border-l border-slate-50">
                   <button 
                     onClick={() => handleSendPackageReminder(p)}
                     title="Lembrar via WhatsApp" 
                     className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                   >
                      <i className="fa-brands fa-whatsapp text-lg"></i>
                   </button>
                   <button onClick={() => openDetails(p)} title="Ver Sessões" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-teal-600 hover:bg-teal-50 transition-all">
                      <i className="fa-solid fa-droplet text-sm"></i>
                   </button>
                   <button title="Recibo" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-slate-700 hover:bg-slate-50 transition-all">
                      <i className="fa-solid fa-receipt text-sm"></i>
                   </button>
                   {!isReadOnly && (
                     <>
                       <button title="Renovar Pacote" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                          <i className="fa-solid fa-arrows-rotate text-sm"></i>
                       </button>
                       <button 
                         onClick={() => setPacoteParaCancelar(p)}
                         title="Cancelar" 
                         className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                       >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                       </button>
                     </>
                   )}
                </div>
              </div>

              {/* Barra de Progresso */}
              <div className="px-6 pb-5 pt-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Progresso</p>
                  <p className="text-[9px] font-black text-teal-600">{concluded} de {total} sessões concluídas</p>
                </div>
                <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#00897B] transition-all duration-1000 shadow-sm" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && pacotesFiltrados.length === 0 && (
          <div className="py-20 text-center text-slate-300 font-bold italic bg-white rounded-3xl border border-dashed">
            {termoBusca ? `Nenhum pacote encontrado para "${termoBusca}"` : "Nenhum pacote encontrado para esta unidade."}
          </div>
        )}
      </div>

      {/* Modal de Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-[95%] mx-auto md:max-w-5xl md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <header className="bg-[#00897B] p-6 md:p-8 text-white flex justify-between items-center relative overflow-hidden shrink-0">
               <div className="relative z-10">
                  <h3 className="text-xl md:text-2xl font-black">Novo Pacote de Fidelidade</h3>
                  <p className="text-teal-100 text-[10px] md:text-sm font-medium mt-1">Defina a recorrência e gere o cronograma.</p>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="relative z-10 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl"><i className="fa-solid fa-xmark"></i></button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-10 custom-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tutor e Pet *</label>
                     {!selectedClient ? (
                        <div className="relative">
                           <i className="fa-solid fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                           <input type="text" value={clientSearch} onChange={(e) => handleClientSearch(e.target.value)} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-slate-700" placeholder="Buscar tutor..."/>
                           {(clientResults.length > 0 || (clientSearch.length >= 2 && !showQuickAdd)) && (
                              <div className="absolute w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 border border-slate-100 overflow-hidden">
                                 {clientResults.map(c => (
                                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-center space-x-4">
                                       <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-xs">{c.nome.charAt(0)}</div>
                                       <div><p className="font-bold text-slate-800 text-sm">{c.nome}</p><p className="text-[10px] text-slate-400">{c.telefone}</p></div>
                                    </button>
                                 ))}
                                 <button onClick={() => { setQuickAddData({...quickAddData, nome: clientSearch}); setShowQuickAdd(true); }} className="w-full text-left px-5 py-4 hover:bg-teal-50 flex items-center space-x-4 border-t border-slate-100 text-teal-600"><i className="fa-solid fa-plus-circle text-lg"></i><div><p className="font-black text-sm uppercase">Adicionar "{clientSearch}"</p></div></button>
                              </div>
                           )}
                           {showQuickAdd && (
                              <div className="mt-4 p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4 shadow-xl border-t-4 border-t-teal-500">
                                 <input type="text" value={quickAddData.nome} onChange={(e) => setQuickAddData({...quickAddData, nome: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold" placeholder="Nome do Tutor..."/>
                                 <input type="tel" value={quickAddData.telefone} onChange={(e) => setQuickAddData({...quickAddData, telefone: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold" placeholder="WhatsApp"/>
                                 <input type="text" value={quickAddData.petNome} onChange={(e) => setQuickAddData({...quickAddData, petNome: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold" placeholder="Nome do Animal..."/>
                                 <button onClick={handleQuickAdd} className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-teal-500/20">Criar e Selecionar</button>
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-between">
                              <span className="font-black text-slate-800 truncate text-sm">{selectedClient.nome}</span>
                              <button onClick={() => setSelectedClient(null)} className="text-[10px] text-teal-600 font-black uppercase underline shrink-0">Trocar</button>
                           </div>
                           <select value={selectedPetId} onChange={(e) => setSelectedPetId(e.target.value)} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm">
                              <option value="">Selecione o Pet...</option>
                              {availablePets.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                           </select>
                        </div>
                     )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase tracking-widest">Data Início</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" /></div>
                     <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase tracking-widest">Hora Padrão</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" /></div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Serviços Inclusos</h4>
                     <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                        {services.map(s => (
                           <label key={s.id} className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${selectedServiceIds.includes(s.id) ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                              <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                              <span className="text-xs font-bold text-slate-700">{s.nome}</span>
                           </label>
                        ))}
                     </div>
                  </div>
                  <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase tracking-widest">Frequência</label><select value={interval} onChange={(e) => handleIntervalChange(e.target.value as any)} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none"><option value="Weekly">Semanal (4 sessões)</option><option value="Bi-weekly">Quinzenal (2 sessões)</option></select></div>
                        <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase tracking-widest">Qtd de Sessões</label><input type="number" value={sessionCount} onChange={(e) => setSessionCount(Number(e.target.value))} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" /></div>
                     </div>

                     {/* NOVO BLOCO: ADICIONAIS (PET TÁXI) */}
                     <div className="pt-4 space-y-4 border-t border-slate-50">
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex items-center space-x-3">
                              <i className="fa-solid fa-taxi text-teal-500"></i>
                              <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Incluir Pet Táxi (Leva e Traz)</span>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={isPetTaxi} onChange={(e) => setIsPetTaxi(e.target.checked)} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                           </label>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex items-center space-x-3">
                              <i className="fa-solid fa-arrows-rotate text-teal-500"></i>
                              <div>
                                 <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest block">Renovação Automática</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">(Gera um novo pacote igual ao finalizar)</span>
                              </div>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={renovacaoAutomatica} onChange={(e) => setRenovacaoAutomatica(e.target.checked)} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                           </label>
                        </div>
                        
                        {isPetTaxi && (
                           <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Valor do Transporte do Pacote (R$):</label>
                              <div className="relative">
                                 <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                                 <input 
                                    type="number" 
                                    value={valorTransportePacote} 
                                    onChange={(e) => setValorTransportePacote(Number(e.target.value))} 
                                    className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 transition-all" 
                                    placeholder="0.00"
                                 />
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="bg-teal-50 p-6 rounded-[2rem] border border-teal-100 space-y-3">
                        <label className="text-[10px] font-black text-teal-400 uppercase tracking-widest block text-center">Valor Total do Pacote</label>
                        <div className="relative">
                           <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-teal-400">R$</span>
                           <input type="number" value={packageTotalValue} onChange={(e) => setPackageTotalValue(Number(e.target.value))} className="w-full pl-20 pr-6 py-5 bg-white border border-teal-200 rounded-[1.5rem] text-4xl font-black text-teal-700 outline-none text-center" placeholder="0.00"/>
                        </div>
                        
                        {isPetTaxi && (
                           <div className="pt-3 border-t border-teal-100 text-center">
                              <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Total do Pacote + Transporte:</p>
                              <p className="text-2xl font-black text-slate-800">R$ {(packageTotalValue + Number(valorTransportePacote)).toFixed(2)}</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               <div className="pt-8 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center"><i className="fa-solid fa-calendar-check mr-2 text-teal-400"></i> Cronograma Sugerido</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                     {generatedDates.map((date, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                           <p className="text-[9px] font-black text-teal-300 uppercase mb-1">{idx + 1}ª Sessão</p>
                           <input type="date" value={date} onChange={(e) => { const newDates = [...generatedDates]; newDates[idx] = e.target.value; setGeneratedDates(newDates); }} className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:ring-0 w-full text-center"/>
                        </div>
                     ))}
                  </div>
               </div>
            </div>

            <footer className="p-4 md:p-8 bg-slate-50 border-t border-slate-100 flex flex-row justify-end gap-2 md:gap-4">
               <button onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none px-4 py-3 md:px-8 md:py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
               <button onClick={handleSavePackage} disabled={loading} className="flex-[2] md:flex-none px-4 py-3 md:px-12 md:py-4 bg-[#00897B] text-white rounded-2xl font-black shadow-xl shadow-teal-500/20 active:scale-95 transition-all text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center">
                 {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-check-circle mr-2"></i>} 
                 {editingPackageId ? 'Salvar Alterações' : 'Gerar Pacote'}
               </button>
            </footer>
          </div>
        </div>
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
