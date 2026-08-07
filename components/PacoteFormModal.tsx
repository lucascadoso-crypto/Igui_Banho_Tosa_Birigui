
import React, { useState, useEffect } from 'react';
import { Unit, Client, Pet, Service, UiId, UserProfile } from '../types';
import { registrarAtividade } from '../services/logger';
import { compareNomePtBr } from '../services/sorting';

interface PacoteFormModalProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
  editingPackage?: any | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const PacoteFormModal: React.FC<PacoteFormModalProps> = ({ unit, supabaseClient, userProfile, editingPackage, onClose, onSaved }) => {
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [catalogPackages, setCatalogPackages] = useState<any[]>([]);

  // Form States
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [availablePets, setAvailablePets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<UiId | ''>('');

  const [selectedServiceIds, setSelectedServiceIds] = useState<UiId[]>([]);
  const [packageTotalValue, setPackageTotalValue] = useState<number>(0);
  const [valorDesconto, setValorDesconto] = useState<number>(0);
  const [selectedCatalogId, setSelectedCatalogId] = useState<UiId | ''>('');
  // IDs pré-marcados automaticamente como base do pacote (Tosa Higiênica + Banho do porte)
  const [autoBaseIds, setAutoBaseIds] = useState<UiId[]>([]);
  const [selectedPorte, setSelectedPorte] = useState<string>('');

  const [startDate, setStartDate] = useState(getTodayBR());
  const [startTime, setStartTime] = useState('09:00');
  const [sessionCount, setSessionCount] = useState(4);
  const [interval, setInterval] = useState<'Weekly' | 'Bi-weekly'>('Weekly');
  const [generatedDates, setGeneratedDates] = useState<string[]>([]);
  const [editingPackageId] = useState<UiId | null>(editingPackage?.id ?? null);
  const [originalStructuralValues, setOriginalStructuralValues] = useState({
    sessionCount: 4,
    interval: 'Weekly' as 'Weekly' | 'Bi-weekly',
    startDate: getTodayBR()
  });

  const [isPetTaxi, setIsPetTaxi] = useState(false);
  const [valorTransportePacote, setValorTransportePacote] = useState<number>(0);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ nome: '', telefone: '', petNome: '' });

  useEffect(() => {
    const fetchDeps = async () => {
      const { data: srvData } = await supabaseClient.from('servicos').select('*').order('nome');
      setServices((srvData || []).slice().sort(compareNomePtBr));

      const { data: catalogData } = await supabaseClient
        .from('catalogo_pacotes')
        .select('*, catalogo_pacotes_unidade!inner(unidade_id, ativo)')
        .eq('ativo', true)
        .eq('catalogo_pacotes_unidade.unidade_id', unit.id)
        .eq('catalogo_pacotes_unidade.ativo', true)
        .order('nome');
      setCatalogPackages(catalogData || []);
    };
    fetchDeps();
  }, [unit.id]);

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

  useEffect(() => {
    generateDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, sessionCount, interval]);

  // Pré-preenchimento quando o modal é aberto em modo de edição (vindo de PacoteDetalhesModal)
  useEffect(() => {
    if (!editingPackage) return;
    const prefill = async () => {
      const p = editingPackage;
      setSelectedClient(p.clientes);
      setClientSearch(p.clientes?.nome || '');
      setSelectedPetId(p.pet_id);
      setSessionCount(p.qtd_sessoes);

      const taxiVal = Number(p.valor_transporte || 0);
      setValorTransportePacote(taxiVal);
      setValorDesconto(Number(p.valor_desconto || 0));
      setPackageTotalValue(Number(p.valor_total) - taxiVal + Number(p.valor_desconto || 0));
      setSelectedCatalogId('');

      const initialInterval = p.qtd_sessoes === 4 ? 'Weekly' : 'Bi-weekly';
      setInterval(initialInterval);

      const initialStartDate = p.agendamentos?.[0]?.data_agendamento || getTodayBR();

      setOriginalStructuralValues({
        sessionCount: p.qtd_sessoes,
        interval: initialInterval,
        startDate: initialStartDate
      });

      const { data: pets } = await supabaseClient.from('pets').select('*').eq('cliente_id', p.cliente_id);
      setAvailablePets(pets || []);

      if (p.agendamentos && p.agendamentos.length > 0) {
        const { data: items } = await supabaseClient
          .from('agendamento_itens')
          .select('servico_id')
          .eq('agendamento_id', p.agendamentos[0].id);

        if (items) {
          setSelectedServiceIds(items.filter((it: any) => !it.eh_extra && it.tipo !== 'adicional').map((it: any) => it.servico_id));
        }

        setStartTime(p.agendamentos[0].horario_inicio?.substring(0, 5) || '09:00');
        setStartDate(p.agendamentos[0].data_agendamento);
        setIsPetTaxi(p.agendamentos[0].tem_taxi || false);
      }
    };
    prefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIntervalChange = (val: 'Weekly' | 'Bi-weekly') => {
    setInterval(val);
    setSessionCount(val === 'Weekly' ? 4 : 2);
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
        .insert([{ nome: quickAddData.nome, telefone: quickAddData.telefone, unidade_id: unit.id, unidade_preferencial_id: unit.id }])
        .select().single();
      if (cErr) throw cErr;
      const { data: newPet, error: pErr } = await supabaseClient
        .from('pets')
        .insert([{ unidade_id: unit.id, cliente_id: newClient.id, nome: quickAddData.petNome, especie: 'Cachorro' }])
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
      const valorPacoteComDesconto = Math.max(0, packageTotalValue - valorDesconto);

      // Intervalo e dia da semana são fixados aqui e não devem ser re-adivinhados depois:
      // é o que trava a recorrência do pacote (ex.: sempre sexta-feira) nas renovações futuras.
      const stepDias = interval === 'Weekly' ? 7 : 14;
      const primeiraData = generatedDates[0] || startDate;
      const diaSemanaPreferido = new Date(primeiraData + 'T12:00:00').getDay();

      if (editingPackageId) {
        // Lógica de UPDATE
        const finalTotal = valorPacoteComDesconto + (isPetTaxi ? valorTransportePacote : 0);
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
            valor_desconto: valorDesconto,
            intervalo_dias: stepDias,
            dia_semana_preferido: diaSemanaPreferido
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

            const totalWithTaxi = valorPacoteComDesconto + (isPetTaxi ? valorTransportePacote : 0);
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
                const service = services.find(s => s.id === srvId);
                itemsPayload.push({ unidade_id: unit.id, agendamento_id: appt.id, servico_id: srvId, descricao: service?.nome || null, tipo: 'principal', eh_extra: false, valor: 0, valor_extra: 0, valor_cobrado: 0 });
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
            const totalWithTaxi = valorPacoteComDesconto + (isPetTaxi ? valorTransportePacote : 0);
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
              .in('agendamento_id', futureIds)
              .eq('eh_extra', false);

            if (dErr) throw dErr;

            // Inserir novos itens
            const newItems: any[] = [];
            futureIds.forEach((apptId: number | string) => {
              selectedServiceIds.forEach(srvId => {
                const service = services.find(s => s.id === srvId);
                newItems.push({ unidade_id: unit.id, agendamento_id: apptId, servico_id: srvId, descricao: service?.nome || null, tipo: 'principal', eh_extra: false, valor: 0, valor_extra: 0, valor_cobrado: 0 });
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
        const finalTotal = valorPacoteComDesconto + (isPetTaxi ? valorTransportePacote : 0);
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
            valor_desconto: valorDesconto,
            catalogo_pacote_id: selectedCatalogId || null,
            ativo: true,
            renovacao_automatica: true,
            intervalo_dias: stepDias,
            dia_semana_preferido: diaSemanaPreferido
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
            const service = services.find(s => s.id === srvId);
            itemsPayload.push({ unidade_id: unit.id, agendamento_id: appt.id, servico_id: srvId, descricao: service?.nome || null, tipo: 'principal', eh_extra: false, valor: 0, valor_extra: 0, valor_cobrado: 0 });
          });
        });
        await supabaseClient.from('agendamento_itens').insert(itemsPayload);
      }

      await onSaved();
      onClose();
    } catch (err) {
      console.error('[DEBUG] Falha crítica ao salvar pacote:', err);
    } finally {
      setLoading(false);
    }
  };

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Retorna os IDs dos serviços-base para o modelo selecionado:
  // sempre "Tosa Higiênica" + "Banho Porte <porte>" (se porte disponível)
  const resolveBaseIds = (petPorte?: string): UiId[] => {
    const ids: UiId[] = [];
    const tosa = services.find(s => norm(s.nome).includes('higienica'));
    if (tosa) ids.push(tosa.id);
    if (petPorte) {
      const banho = services.find(s =>
        norm(s.nome).includes('banho') &&
        norm(s.nome).includes(norm(petPorte))
      );
      if (banho) ids.push(banho.id);
    }
    return ids;
  };

  const applyCatalogPackage = (id: UiId | '') => {
    setSelectedCatalogId(id);
    if (!id) {
      // Personalizado — remove apenas os auto-base, limpa porte
      setSelectedServiceIds(prev => prev.filter(sid => !autoBaseIds.includes(sid)));
      setAutoBaseIds([]);
      setSelectedPorte('');
      return;
    }
    const tpl = catalogPackages.find(c => String(c.id) === String(id));
    if (!tpl) return;
    handleIntervalChange(tpl.frequencia);
    setSessionCount(tpl.qtd_sessoes);
    setPackageTotalValue(Number(tpl.valor_base));
    // Porte será escolhido manualmente — limpa base anterior até o usuário selecionar
    setSelectedServiceIds(prev => prev.filter(sid => !autoBaseIds.includes(sid)));
    setAutoBaseIds([]);
    setSelectedPorte('');
  };

  const handlePorteChange = (porte: string) => {
    setSelectedPorte(porte);
    const newBaseIds = resolveBaseIds(porte);
    setAutoBaseIds(newBaseIds);
    setSelectedServiceIds(prev => {
      const withoutOldBase = prev.filter(sid => !autoBaseIds.includes(sid));
      const merged = [...withoutOldBase];
      newBaseIds.forEach(bid => { if (!merged.includes(bid)) merged.push(bid); });
      return merged;
    });
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

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="app-modal-panel bg-white w-[95%] mx-auto md:max-w-5xl md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        <header className="app-modal-header bg-[#00897B] p-6 md:p-8 text-white flex justify-between items-center relative overflow-hidden shrink-0">
           <div className="relative z-10">
              <h3 className="text-xl md:text-2xl font-black">Novo Pacote de Fidelidade</h3>
              <p className="text-teal-100 text-[10px] md:text-sm font-medium mt-1">Defina a recorrência e gere o cronograma.</p>
           </div>
           <button onClick={onClose} className="relative z-10 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl"><i className="fa-solid fa-xmark"></i></button>
        </header>

        <div className="app-modal-body flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">

           {/* ── SEÇÃO 1: Tutor e pet ── */}
           <section className="space-y-3">
             <div className="flex items-center gap-3">
               <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
               <h4 className="font-black text-slate-700">Tutor e pet</h4>
             </div>
             {!selectedClient ? (
               <div className="relative">
                 <i className="fa-solid fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                 <input type="text" value={clientSearch} onChange={(e) => handleClientSearch(e.target.value)} className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-slate-700" placeholder="Buscar tutor..."/>
                 {(clientResults.length > 0 || (clientSearch.length >= 2 && !showQuickAdd)) && (
                   <div className="absolute w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 overflow-hidden">
                     {clientResults.map(c => (
                       <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-center space-x-4">
                         <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-xs">{c.nome.charAt(0)}</div>
                         <div><p className="font-bold text-slate-800 text-sm">{c.nome}</p><p className="text-[10px] text-slate-400">{c.telefone}</p></div>
                       </button>
                     ))}
                     <button onClick={() => { setQuickAddData({...quickAddData, nome: clientSearch}); setShowQuickAdd(true); }} className="w-full text-left px-5 py-4 hover:bg-teal-50 flex items-center space-x-4 border-t border-slate-100 text-teal-600">
                       <i className="fa-solid fa-plus-circle text-lg"></i>
                       <div><p className="font-black text-sm uppercase">Adicionar "{clientSearch}"</p></div>
                     </button>
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
               <div className="space-y-3">
                 {/* Card do tutor */}
                 <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-between gap-4">
                   <div className="flex items-center gap-3 min-w-0">
                     <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                       {selectedClient.nome.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('')}
                     </div>
                     <div className="min-w-0">
                       <p className="font-black text-slate-800 text-sm truncate">{selectedClient.nome}</p>
                       <p className="text-[11px] text-slate-400 font-bold">{selectedClient.telefone}</p>
                     </div>
                   </div>
                   <button onClick={() => setSelectedClient(null)} className="text-[10px] text-teal-600 font-black uppercase underline shrink-0">Trocar</button>
                 </div>
                 {/* Seletor de pet — sempre visível */}
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pet *</label>
                   {availablePets.length === 0 ? (
                     <p className="text-xs text-slate-400 font-bold px-1">Nenhum pet cadastrado para este tutor.</p>
                   ) : availablePets.length === 1 ? (
                     <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
                       <i className="fa-solid fa-paw text-teal-400 text-sm"></i>
                       <div>
                         <p className="text-sm font-black text-slate-700">{availablePets[0].nome}</p>
                         {(() => {
                           const pet = availablePets[0];
                           const parts = [pet.especie, pet.porte ? `porte ${pet.porte.toLowerCase()}` : ''].filter(Boolean);
                           return parts.length ? <p className="text-[10px] text-slate-400 font-bold">{parts.join(' · ')}</p> : null;
                         })()}
                       </div>
                     </div>
                   ) : (
                     <div className="flex flex-wrap gap-2">
                       {availablePets.map(p => (
                         <button
                           key={p.id}
                           type="button"
                           onClick={() => setSelectedPetId(p.id)}
                           className={`flex items-center gap-2 px-4 py-3 rounded-2xl border font-bold text-sm transition-all ${
                             String(selectedPetId) === String(p.id)
                               ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                               : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'
                           }`}
                         >
                           <i className="fa-solid fa-paw text-xs"></i>
                           <span>{p.nome}</span>
                           {p.porte && <span className="text-[10px] opacity-70">· {p.porte}</span>}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             )}
           </section>

           {/* ── SEÇÃO 2: Modelo e recorrência ── */}
           <section className="space-y-3">
             <div className="flex items-center gap-3">
               <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
               <h4 className="font-black text-slate-700">Modelo e recorrência</h4>
             </div>
             {catalogPackages.length > 0 && (
               <div className="space-y-3">
                 <select
                   value={selectedCatalogId}
                   onChange={(e) => applyCatalogPackage(e.target.value)}
                   className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-slate-700"
                 >
                   <option value="">Personalizado</option>
                   {catalogPackages.map(c => (
                     <option key={c.id} value={c.id}>{c.nome}</option>
                   ))}
                 </select>
                 {selectedCatalogId && (
                   <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                     <i className="fa-solid fa-circle-check text-teal-400"></i>
                     Preenche frequência, sessões e serviços-base automaticamente
                   </p>
                 )}
                 {selectedCatalogId && (
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Porte do Pet *</label>
                     <div className="flex gap-2">
                       {['Pequeno', 'Médio', 'Grande'].map(porte => (
                         <button
                           key={porte}
                           type="button"
                           onClick={() => handlePorteChange(porte)}
                           className={`flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest border transition-all ${
                             selectedPorte === porte
                               ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                               : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-teal-300'
                           }`}
                         >
                           {porte === 'Pequeno' ? 'P' : porte === 'Médio' ? 'M' : 'G'} · {porte}
                         </button>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
             )}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frequência</label>
                 <select value={interval} onChange={(e) => handleIntervalChange(e.target.value as any)} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm">
                   <option value="Weekly">Semanal</option>
                   <option value="Bi-weekly">Quinzenal</option>
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessões</label>
                 <input type="number" value={sessionCount} onChange={(e) => setSessionCount(Number(e.target.value))} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início</label>
                 <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</label>
                 <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
               </div>
             </div>
           </section>

           {/* ── SEÇÃO 3: Serviços ── */}
           <section className="space-y-3">
             <div className="flex items-center gap-3">
               <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
               <h4 className="font-black text-slate-700">Serviços</h4>
             </div>
             {selectedCatalogId ? (
               <div className="space-y-4">
                 {autoBaseIds.length > 0 && (
                   <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-3">
                     <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest flex items-center gap-1">
                       <i className="fa-solid fa-circle-check"></i> Base do pacote · incluída automaticamente
                     </p>
                     <div className="flex flex-wrap gap-2">
                       {services.filter(s => autoBaseIds.includes(s.id)).map(s => (
                         <label key={s.id} className={`px-4 py-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${selectedServiceIds.includes(s.id) ? 'bg-teal-100 border-teal-300 ring-1 ring-teal-200' : 'bg-white border-teal-100 opacity-60'}`}>
                           <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                           <span className="text-xs font-bold text-teal-800">{s.nome}</span>
                         </label>
                       ))}
                     </div>
                   </div>
                 )}
                 <div className="space-y-2">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extras (opcional — cobrado à parte)</p>
                   <div className="grid grid-cols-2 gap-3">
                     {services.filter(s => !autoBaseIds.includes(s.id)).map(s => (
                       <label key={s.id} className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${selectedServiceIds.includes(s.id) ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                         <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                         <span className="text-xs font-bold text-slate-700">{s.nome}</span>
                       </label>
                     ))}
                   </div>
                 </div>
               </div>
             ) : (
               <div className="grid grid-cols-2 gap-3">
                 {services.map(s => (
                   <label key={s.id} className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${selectedServiceIds.includes(s.id) ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                     <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                     <span className="text-xs font-bold text-slate-700">{s.nome}</span>
                   </label>
                 ))}
               </div>
             )}
           </section>

           {/* ── SEÇÃO 4: Logística ── */}
           <section className="space-y-3">
             <div className="flex items-center gap-3">
               <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">4</span>
               <h4 className="font-black text-slate-700">Logística</h4>
             </div>
             <div className="space-y-3">
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
               {isPetTaxi && (
                 <div className="space-y-1 px-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do Transporte (R$)</label>
                   <div className="relative">
                     <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                     <input type="number" value={valorTransportePacote} onChange={(e) => setValorTransportePacote(Number(e.target.value))} className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 transition-all" placeholder="0.00"/>
                   </div>
                 </div>
               )}
             </div>
           </section>

           {/* ── RESUMO: Valor + Cronograma ── */}
           <div className="bg-teal-50 p-6 rounded-[2rem] border border-teal-100 space-y-5">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest block">Valor do Pacote</label>
                 <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-teal-400">R$</span>
                   <input type="number" value={packageTotalValue} onChange={(e) => setPackageTotalValue(Number(e.target.value))} className="w-full pl-12 pr-4 py-4 bg-white border border-teal-200 rounded-2xl text-xl font-black text-teal-700 outline-none" placeholder="0.00"/>
                 </div>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block">Desconto</label>
                 <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-orange-400">R$</span>
                   <input type="number" min={0} value={valorDesconto} onChange={(e) => setValorDesconto(Math.max(0, Number(e.target.value) || 0))} className="w-full pl-12 pr-4 py-4 bg-white border border-orange-200 rounded-2xl font-bold text-orange-600 outline-none" placeholder="0.00"/>
                 </div>
               </div>
               <div className="space-y-1 text-center md:text-right">
                 <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Total {isPetTaxi ? 'c/ Transporte' : 'do Pacote'}</p>
                 <p className="text-3xl font-black text-slate-800">
                   R$ {(Math.max(0, packageTotalValue - valorDesconto) + (isPetTaxi ? Number(valorTransportePacote) : 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </p>
               </div>
             </div>
             <div className="pt-4 border-t border-teal-100 space-y-3">
               <h4 className="text-[10px] font-black text-teal-500 uppercase tracking-widest flex items-center gap-2">
                 <i className="fa-solid fa-calendar-check"></i> Cronograma Sugerido
               </h4>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                 {generatedDates.map((date, idx) => (
                   <div key={idx} className="p-3 bg-white border border-teal-100 rounded-xl text-center">
                     <p className="text-[9px] font-black text-teal-400 uppercase mb-1">{idx + 1}ª · {idx === 0 ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p>
                     <input type="date" value={date} onChange={(e) => { const newDates = [...generatedDates]; newDates[idx] = e.target.value; setGeneratedDates(newDates); }} className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:ring-0 w-full text-center"/>
                   </div>
                 ))}
               </div>
             </div>
           </div>

        </div>

        <footer className="app-modal-footer p-4 md:p-8 bg-slate-50 border-t border-slate-100 flex flex-row justify-end gap-2 md:gap-4">
           <button onClick={onClose} className="flex-1 md:flex-none px-4 py-3 md:px-8 md:py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 text-[10px] md:text-xs uppercase tracking-widest">Cancelar</button>
           <button onClick={handleSavePackage} disabled={loading} className="flex-[2] md:flex-none px-4 py-3 md:px-12 md:py-4 bg-[#00897B] text-white rounded-2xl font-black shadow-xl shadow-teal-500/20 active:scale-95 transition-all text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center">
             {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-check-circle mr-2"></i>}
             {editingPackageId ? 'Salvar Alterações' : 'Gerar Pacote'}
           </button>
        </footer>
      </div>
    </div>
  );
};

export default PacoteFormModal;
