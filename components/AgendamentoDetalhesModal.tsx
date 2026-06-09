
import React, { useState } from 'react';
import { Appointment, Client, Pet } from '../types';
import { registrarAtividade } from '../services/logger';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';

interface AgendamentoDetalhesModalProps {
  appt: any;
  userProfile?: any;
  onClose: () => void;
  onEdit: (appt: any) => void;
  onFinalize: (appt: any) => void;
  onFinalizeNoNotice?: (appt: any) => void;
  onStartAtendimento?: (appt: any) => void;
  onReactivate?: (appt: any) => void;
  onCancel: (appt: any) => void;
  onQuickReceive: (data: { method1: string, val1: number, method2?: string, val2?: number }) => void;
  supabaseClient: any;
  onRefresh: () => void;
}

const AgendamentoDetalhesModal: React.FC<AgendamentoDetalhesModalProps> = ({ 
  appt, 
  userProfile,
  onClose, 
  onEdit, 
  onFinalize, 
  onFinalizeNoNotice,
  onStartAtendimento,
  onReactivate,
  onCancel,
  onQuickReceive,
  supabaseClient,
  onRefresh
}) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [showMenu, setShowMenu] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [toast, setToast] = useState<{ visivel: boolean; mensagem: string; tipo: 'sucesso' | 'erro' | 'carregando' }>({ visivel: false, mensagem: '', tipo: 'carregando' });
  const [loadingReminder, setLoadingReminder] = useState(false);

  // Estados para Extras
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [extraServices, setExtraServices] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [showExtraPayment, setShowExtraPayment] = useState(false);
  const [extraPaymentMethod, setExtraPaymentMethod] = useState('Pix');
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);

  // Estados para Pagamento Dividido
  const [isDividirPagamento, setIsDividirPagamento] = useState(false);
  const [valor1, setValor1] = useState(parseFloat(appt.valor_total) || 0);
  const [valor2, setValor2] = useState(0);
  const [formaPagamento2, setFormaPagamento2] = useState('Dinheiro');

  if (!appt) return null;

  const services = appt.agendamento_itens || [];
  const isExtraItem = (item: any) => item?.eh_extra === true || item?.tipo === 'adicional' || item?.tipo === 'extra';
  const getItemValue = (item: any) => Number(item?.valor_extra ?? item?.valor ?? item?.valor_cobrado ?? item?.servicos?.preco_base ?? 0);
  const mainItems = services.filter((it: any) => !isExtraItem(it));
  const extraItems = services.filter(isExtraItem);
  const valorTransporte = Number(appt.valor_transporte || 0);
  const valorDesconto = Number(appt.valor_desconto || appt.desconto || 0);
  const valorServicos = Number(appt.valor_servicos ?? Math.max(0, Number(appt.valor_total || 0) - valorTransporte));
  const totalExtraItens = extraItems.reduce((acc: number, item: any) => acc + getItemValue(item), 0);
  const totalExtra = extraItems.length > 0 ? totalExtraItens : 0;
  const totalBaseAgendamento = Number(appt.valor_total || 0);
  const totalGeral = appt.pacote_id ? totalBaseAgendamento : Math.max(0, valorServicos + valorTransporte + totalExtra - valorDesconto);
  const isSomaValida = !isDividirPagamento || (Math.abs((valor1 + valor2) - totalGeral) < 0.01);
  const client = appt.pets?.clientes;
  const pet = appt.pets;
  const showToast = (mensagem: string, tipo: 'sucesso' | 'erro' | 'carregando' = 'sucesso') => {
    setToast({ visivel: true, mensagem, tipo });
    setTimeout(() => setToast(prev => ({ ...prev, visivel: false })), 3000);
  };

  const normalizeFormaPagamento = (method: string) => {
    const normalized = method
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('pix')) return 'pix';
    if (normalized.includes('dinheiro')) return 'dinheiro';
    if (normalized.includes('debito')) return 'debito';
    if (normalized.includes('credito')) return 'credito';
    if (normalized.includes('transfer')) return 'transferencia';
    return 'outro';
  };

  const fetchExtraServices = async () => {
    if (extraServices.length > 0) return;
    const { data } = await supabaseClient.from('servicos').select('*').order('nome');
    setExtraServices(data || []);
  };

  const handleAddExtra = async (srv: any) => {
    const alreadyAdded = extraItems.some((item: any) => Number(item.servico_id) === Number(srv.id));
    if (alreadyAdded && !window.confirm(`${srv.nome} já está nos adicionais. Deseja adicionar outra unidade mesmo assim?`)) {
      return;
    }

    setLoadingExtra(true);
    try {
      const extraValue = Number(srv.preco_base || 0);
      const { error: itemErr } = await supabaseClient.from('agendamento_itens').insert([{
        unidade_id: appt.unidade_id,
        agendamento_id: appt.id,
        servico_id: srv.id,
        descricao: srv.nome,
        tipo: 'adicional',
        eh_extra: true,
        valor: extraValue,
        valor_extra: extraValue,
        valor_cobrado: extraValue
      }]);

      if (itemErr) throw itemErr;

      const newExtraTotal = totalExtra + extraValue;
      const { error: apptErr } = await supabaseClient.from('agendamentos').update({
        valor_extra_total: newExtraTotal,
        status_pagamento_extra: 'PENDENTE',
        forma_pagamento_extra: null,
        data_pagamento_extra: null
      }).eq('id', appt.id);

      if (apptErr) throw apptErr;

      registrarAtividade(
        appt.unidade_id,
        userProfile?.email || 'sistema',
        'ADICIONAR_EXTRA',
        `Adicionou o serviço extra ${srv.nome} (R$ ${srv.preco_base.toFixed(2)}) ao agendamento de ${appt.pets?.clientes?.nome || 'Cliente'} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setIsAddingExtra(false);
      showToast("Serviço adicional incluído.");
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao adicionar serviço extra:", err);
    } finally {
      setLoadingExtra(false);
    }
  };

  const handleReceiveExtra = async () => {
    if (totalExtra <= 0 || appt.status_pagamento_extra === 'PAGO') return;

    setLoadingExtra(true);
    try {
      const paymentDate = new Date().toISOString().split('T')[0];
      const { error } = await supabaseClient.from('agendamentos').update({
        status_pagamento_extra: 'PAGO',
        forma_pagamento_extra: extraPaymentMethod,
        data_pagamento_extra: paymentDate,
        valor_extra_total: totalExtra
      }).eq('id', appt.id);

      if (error) throw error;

      const { data: movimento, error: movimentoErr } = await supabaseClient
        .from('financeiro_movimentos')
        .insert([{
          unidade_id: appt.unidade_id,
          cliente_id: client?.id || appt.cliente_id || null,
          pet_id: pet?.id || appt.pet_id || null,
          pacote_id: appt.pacote_id || null,
          agendamento_id: appt.id,
          tipo: 'receita',
          categoria: 'extras',
          descricao: `Extras do agendamento ${appt.id} - ${pet?.nome || 'Pet'}`,
          valor_total: totalExtra,
          data_competencia: paymentDate,
          data_vencimento: paymentDate,
          status: 'pago',
          origem: 'extras_agendamento',
          origem_id: String(appt.id)
        }])
        .select()
        .single();

      if (movimentoErr) throw movimentoErr;

      const { error: pagamentoErr } = await supabaseClient
        .from('financeiro_pagamentos')
        .insert([{
          unidade_id: appt.unidade_id,
          movimento_id: movimento.id,
          forma_pagamento: normalizeFormaPagamento(extraPaymentMethod),
          valor: totalExtra,
          observacao: `Pagamento de extras do agendamento ${appt.id}`
        }]);

      if (pagamentoErr) throw pagamentoErr;

      registrarAtividade(
        appt.unidade_id,
        userProfile?.email || 'sistema',
        'RECEBER_PAGAMENTO_EXTRA',
        `Recebeu pagamento de serviços extras no valor de R$ ${appt.valor_extra_total?.toFixed(2)} via ${extraPaymentMethod} para o cliente ${appt.pets?.clientes?.nome || 'Cliente'} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setShowExtraPayment(false);
      showToast("Pagamento dos extras registrado.");
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao receber pagamento de extras:", err);
      showToast(err.message || "Erro ao registrar pagamento dos extras.", "erro");
    } finally {
      setLoadingExtra(false);
    }
  };

  const handleRemoverExtra = async (itemId: number | string) => {
    const removedItem = services.find((it: any) => it.id === itemId);
    if (appt.status_pagamento_extra === 'PAGO') {
      showToast("Este extra já foi recebido. Cancele o recebimento antes de remover.", "erro");
      return;
    }
    const extraName = removedItem?.servicos?.nome || 'Serviço Extra';

    setLoadingExtra(true);
    try {
      const { error: delErr } = await supabaseClient.from('agendamento_itens').delete().eq('id', itemId);
      if (delErr) throw delErr;

      const remainingExtras = extraItems.filter((it: any) => it.id !== itemId);
      const newExtraTotal = remainingExtras.reduce((acc: number, cur: any) => acc + getItemValue(cur), 0);

      const updateData: any = {
        valor_extra_total: newExtraTotal
      };

      if (newExtraTotal === 0) {
        updateData.status_pagamento_extra = 'NÃO POSSUI';
      }

      if (newExtraTotal > 0) {
        updateData.status_pagamento_extra = 'PENDENTE';
      }
      updateData.forma_pagamento_extra = null;
      updateData.data_pagamento_extra = null;

      const { error: apptErr } = await supabaseClient.from('agendamentos').update(updateData).eq('id', appt.id);
      if (apptErr) throw apptErr;

      registrarAtividade(
        appt.unidade_id,
        userProfile?.email || 'sistema',
        'REMOVER_EXTRA',
        `Removeu o serviço extra "${extraName}" do agendamento de ${appt.pets?.clientes?.nome || 'Cliente'} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      onRefresh();
    } catch (err) {
      console.error("Erro ao remover serviço extra:", err);
    } finally {
      setLoadingExtra(false);
    }
  };

  const handleExcluirExtra = async (item: any) => {
    if (appt.status_pagamento_extra === 'PAGO') {
      showToast("Este extra já foi recebido. Cancele o recebimento antes de remover.", "erro");
      return;
    }

    if (!item || !isExtraItem(item)) {
      showToast("Somente serviços adicionais podem ser removidos por aqui.", "erro");
      return;
    }

    const extraName = item.descricao || item.servicos?.nome || 'Serviço Extra';
    if (!window.confirm(`Remover o extra "${extraName}" deste agendamento?`)) {
      return;
    }

    setLoadingExtra(true);
    try {
      const { error: delErr } = await supabaseClient
        .from('agendamento_itens')
        .delete()
        .eq('agendamento_id', appt.id)
        .eq('id', item.id)
        .or('eh_extra.eq.true,tipo.eq.extra,tipo.eq.adicional');
      if (delErr) throw delErr;

      const remainingExtras = extraItems.filter((it: any) => it.id !== item.id);
      const newExtraTotal = remainingExtras.reduce((acc: number, cur: any) => acc + getItemValue(cur), 0);

      const { error: apptErr } = await supabaseClient
        .from('agendamentos')
        .update({
          valor_extra_total: newExtraTotal,
          status_pagamento_extra: newExtraTotal === 0 ? 'NÃO POSSUI' : 'PENDENTE',
          forma_pagamento_extra: null,
          data_pagamento_extra: null
        })
        .eq('id', appt.id);
      if (apptErr) throw apptErr;

      registrarAtividade(
        appt.unidade_id,
        userProfile?.email || 'sistema',
        'REMOVER_EXTRA',
        `Removeu o serviço extra "${extraName}" do agendamento de ${appt.pets?.clientes?.nome || 'Cliente'} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showToast("Serviço adicional removido.");
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao remover serviço extra:", err);
      showToast(err.message || "Erro ao remover serviço adicional.", "erro");
    } finally {
      setLoadingExtra(false);
    }
  };

  const handleCancelarTodosExtras = async () => {
    if (appt.status_pagamento_extra === 'PAGO') {
      showToast("Este extra já foi recebido. Cancele o recebimento antes de remover.", "erro");
      return;
    }

    setLoadingExtra(true);
    try {
      // 1. Deletar todos os itens extras do agendamento
      const { error: delErr } = await supabaseClient
        .from('agendamento_itens')
        .delete()
        .eq('agendamento_id', appt.id)
        .or('eh_extra.eq.true,tipo.eq.extra,tipo.eq.adicional');
      
      if (delErr) throw delErr;

      // 2. Atualizar agendamento limpando campos de extras
      const { error: apptErr } = await supabaseClient
        .from('agendamentos')
        .update({
          status_pagamento_extra: 'NÃO POSSUI',
          valor_extra_total: 0,
          forma_pagamento_extra: null,
          data_pagamento_extra: null,
          valor_pagamento_extra: 0
        })
        .eq('id', appt.id);

      if (apptErr) throw apptErr;

      registrarAtividade(
        appt.unidade_id,
        userProfile?.email || 'sistema',
        'REMOVER_TODOS_EXTRAS',
        `Cancelou todos os serviços extras do agendamento de ${appt.pets?.clientes?.nome || 'Cliente'} (Pet: ${appt.pets?.nome || 'Pet'})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setShowConfirmDeleteAll(false);
      showToast("Extras removidos.");
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao cancelar todos os extras:", err);
      showToast(err.message || "Erro ao remover extras.", "erro");
    } finally {
      setLoadingExtra(false);
    }
  };

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '--/--/----';
    try {
      // Regra Crucial: Limpa o Timezone (T00:00...) e inverte a string do banco (YYYY-MM-DD)
      const dataLimpa = dateStr.split('T')[0];
      const parts = dataLimpa.split('-');
      if (parts.length !== 3) return dateStr;
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    } catch (e) {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Finalizado': return 'text-emerald-700';
      case 'Em Andamento': return 'text-blue-700';
      case 'Cancelado': return 'text-rose-700';
      default: return 'text-amber-700';
    }
  };

  const handleOpenRecibo = () => {
    window.open(`/?view=recibo&id=${appt.id}`, '_blank');
  };

  const handleRemindWhatsApp = async () => {
    const clientPhone = appt.pets?.clientes?.telefone?.replace(/\D/g, '');
    if (!clientPhone) {
      alert('Cliente sem telefone cadastrado.');
      return;
    }

    const clientName = appt.pets?.clientes?.nome || 'Cliente';
    const petName = appt.pets?.nome || 'seu Pet';
    const [y, m, d] = appt.data_agendamento.split('-');
    const dataFormatada = `${d}/${m}`;
    const horaFormatada = String(appt.horario_inicio || '').substring(0, 5);
    
    const hasTaxi = appt.tem_taxi || appt.pet_taxi || appt.agendamento_itens?.some((it: any) => 
      it.servicos?.nome?.toLowerCase().includes('táxi') || 
      it.servicos?.nome?.toLowerCase().includes('taxi')
    );

    const message = `Olá! 🐾 Passando para confirmar o banho do(a) ${petName} amanhã às ${horaFormatada}. Confirmado?`;

    setToast({ visivel: true, mensagem: 'Enviando lembrete...', tipo: 'carregando' });
    setLoadingReminder(true);

    try {
      const result = await enviarNotificacaoWhatsApp({
        telefone: clientPhone,
        mensagem: message,
        unidadeId: appt.unidade_id,
        supabaseClient,
        agendamentoId: appt.id,
        tipo: 'manual',
        forceDirect: true
      });

      if (result?.ok) {
        setToast({ visivel: true, mensagem: 'Lembrete enviado com sucesso!', tipo: 'sucesso' });
        
        registrarAtividade(
          appt.unidade_id,
          userProfile?.email || 'sistema',
          'LEMBRETE_MANUAL_WA',
          `Enviou lembrete manual via WhatsApp para ${clientName} (Pet: ${petName})`,
          userProfile?.nome,
          userProfile?.cargo
        );
      } else {
        console.error('Falha no WhatsApp ao enviar lembrete:', result?.error);
        setToast({ 
          visivel: true, 
          mensagem: result?.error || 'Aviso de WhatsApp não enviado.', 
          tipo: 'erro' 
        });
      }
    } catch (err) {
      console.error(err);
      setToast({ visivel: true, mensagem: 'Erro inesperado ao enviar.', tipo: 'erro' });
    } finally {
      setLoadingReminder(false);
      setTimeout(() => {
        setToast(prev => ({ ...prev, visivel: false }));
      }, 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-[95%] mx-auto md:max-w-4xl md:w-full rounded-[1.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
        
        {/* Header Laranja */}
        <header className="bg-orange-500 p-4 md:p-6 text-white shrink-0 relative">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Banho e tosa &rarr; Detalhes</p>
              <h2 className="text-lg md:text-xl font-black tracking-tight">Venda: #{String(appt.id).substring(0, 8).toUpperCase()}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-xl">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        {/* Sub-Header Amarelo (Status) */}
        <div className="bg-yellow-300 py-2 text-center shadow-inner">
           <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] ${getStatusColor(appt.status)}`}>
             {appt.status}
           </span>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 custom-scrollbar bg-slate-50/30">
          
          {/* Coluna Esquerda: Serviços e Financeiro */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Seção de Serviços */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center">
                   <i className="fa-solid fa-list-check mr-2"></i> Itens do Agendamento
                </h3>
                {!isReadOnly && (
                  <button 
                    onClick={() => { setIsAddingExtra(!isAddingExtra); fetchExtraServices(); }}
                    className="text-[9px] font-black text-[#00897B] uppercase tracking-widest bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100 hover:bg-teal-100 transition-all flex items-center"
                  >
                    <i className={`fa-solid fa-${isAddingExtra ? 'xmark' : 'plus'} mr-1`}></i> {isAddingExtra ? 'Fechar' : 'Adicionar Extra'}
                  </button>
                )}
              </div>
              
              {isAddingExtra && (
                <div className="bg-teal-50/50 p-4 rounded-xl border border-dashed border-teal-200 animate-in slide-in-from-top-2 duration-300">
                  <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-3">Selecione o serviço adicional</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {extraServices.map(srv => (
                      <button
                        key={srv.id}
                        disabled={loadingExtra}
                        onClick={() => handleAddExtra(srv)}
                        className="bg-white p-3 rounded-lg border border-teal-100 text-left hover:border-teal-400 transition-all group"
                      >
                        <p className="text-[10px] font-bold text-slate-700 group-hover:text-teal-600 truncate">{srv.nome}</p>
                        <p className="text-[9px] font-black text-teal-500">R$ {Number(srv.preco_base).toFixed(2)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {services.length > 0 ? (
                <div className="space-y-2">
                  {[...mainItems, ...extraItems].map((it: any, idx: number) => (
                    <div key={it.id || idx} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm relative overflow-hidden">
                       <div className="flex items-center space-x-3">
                         <span className="font-bold text-slate-700">{it.descricao || it.servicos?.nome}</span>
                         {isExtraItem(it) && (
                           <div className="flex items-center gap-2">
                             <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border border-amber-200">EXTRA</span>
                             {!isReadOnly && (
                               <button 
                                 onClick={() => handleExcluirExtra(it)}
                                 disabled={loadingExtra}
                                 className="text-slate-400 hover:text-red-500 transition-colors"
                                 title="Remover Extra"
                               >
                                 <i className="fa-solid fa-trash-can text-[10px]"></i>
                               </button>
                             )}
                           </div>
                         )}
                       </div>
                       <span className="font-black text-slate-900">R$ {Number(isExtraItem(it) ? getItemValue(it) : (it.valor_cobrado || it.valor || it.servicos?.preco_base || 0)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                   <i className="fa-regular fa-file-lines text-4xl text-slate-300 mb-3"></i>
                   <p className="text-xs font-bold text-slate-400 uppercase">Nenhum serviço selecionado</p>
                </div>
              )}
            </div>

            {/* SEÇÃO PET TÁXI (INFORMATIVA) */}
            {appt.pet_taxi && (
              <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 space-y-3 animate-in fade-in duration-500">
                <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center">
                   <i className="fa-solid fa-taxi mr-2"></i> Serviço de Transporte Ativo
                </h3>
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm shrink-0">
                    <i className="fa-solid fa-map-pin"></i>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Endereço de Coleta/Entrega</p>
                    <p className="font-bold text-slate-700">{appt.pet_taxi_endereco || 'Não informado no momento do agendamento'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Seção Recibo */}
            <div className="space-y-4">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recibo</h3>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Serviços</p>
                     <p className="font-black text-slate-800">R$ {valorServicos.toFixed(2)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Extras</p>
                     <p className={`font-black ${totalExtra > 0 ? 'text-amber-600' : 'text-slate-800'}`}>R$ {totalExtra.toFixed(2)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Pet Táxi</p>
                     <p className="font-black text-slate-800">R$ {valorTransporte.toFixed(2)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                     <p className="text-[9px] font-black text-orange-500 uppercase mb-1">Desconto</p>
                     <p className="font-black text-orange-500">R$ {valorDesconto.toFixed(2)}</p>
                  </div>
               </div>

               <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-orange-500">
                  <span className="text-sm font-black text-slate-400 uppercase">Total {appt.pacote_id ? '(Pacote)' : 'Geral'}</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-900 tracking-tighter">R$ {totalGeral.toFixed(2)}</p>
                  </div>
               </div>

               {totalExtra > 0 && (
                  <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-amber-500 flex flex-col space-y-4 animate-in slide-in-from-left-2 duration-500">
                     <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-slate-400 uppercase">Total Extras a Pagar</span>
                        <p className="text-2xl font-black text-amber-600 tracking-tighter">R$ {totalExtra.toFixed(2)}</p>
                     </div>

                     {appt.status_pagamento_extra === 'PAGO' ? (
                       <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-100 inline-block self-end text-center">
                          EXTRAS PAGOS via {appt.forma_pagamento_extra} em {appt.data_pagamento_extra ? appt.data_pagamento_extra.split('-').reverse().join('/') : '--/--'}
                       </p>
                     ) : (
                       <div className="flex items-center space-x-3 w-full max-w-sm ml-auto">
                          {showConfirmDeleteAll ? (
                             <div className="flex items-center space-x-2 w-full animate-in zoom-in duration-300">
                               <button 
                                 onClick={() => setShowConfirmDeleteAll(false)}
                                 className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200"
                               >
                                 Cancelar
                               </button>
                               <button 
                                 onClick={handleCancelarTodosExtras}
                                 className="flex-[2] py-3 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                               >
                                 Sim, remover todos
                               </button>
                             </div>
                           ) : showExtraPayment ? (
                            <div className="flex items-center space-x-2 w-full animate-in slide-in-from-right-2 duration-300">
                              <button 
                                onClick={() => setShowExtraPayment(false)}
                                className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all shrink-0"
                                title="Voltar"
                              >
                                <i className="fa-solid fa-chevron-left"></i>
                              </button>
                              <select 
                                value={extraPaymentMethod}
                                onChange={(e) => setExtraPaymentMethod(e.target.value)}
                                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-xs"
                              >
                                <option value="Pix">Pix</option>
                                <option value="Dinheiro">Dinheiro</option>
                                <option value="Crédito">Crédito</option>
                                <option value="Débito">Débito</option>
                              </select>
                              <button 
                                disabled={loadingExtra}
                                onClick={handleReceiveExtra}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                              >
                                 {loadingExtra ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'CONFIRMAR'}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2 w-full">
                               <button 
                                 onClick={() => setShowExtraPayment(true)}
                                 className="flex-1 py-4 bg-amber-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all"
                               >
                                  RECEBER EXTRAS
                               </button>
                               {!isReadOnly && (
                                 <button 
                                   onClick={() => setShowConfirmDeleteAll(true)}
                                   className="w-14 h-14 flex items-center justify-center bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl border border-slate-200 hover:bg-rose-50 transition-all shrink-0 shadow-sm"
                                   title="Cancelar todos os extras"
                                 >
                                    <i className="fa-solid fa-trash-can text-lg"></i>
                                 </button>
                               )}
                            </div>
                          )}
                       </div>
                     )}
                  </div>
               )}

               <div className="flex justify-end pt-2">
                  {(appt.pacote_id ? appt.pacotes?.pago : appt.pago) ? (
                    <div className="flex flex-col items-end space-y-2">
                       <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
                          {appt.pacote_id && appt.pacotes?.pago 
                            ? `PAGO (PACOTE) via ${appt.pacotes.forma_pagamento} em ${formatDateBR(appt.pacotes.data_pagamento)}` 
                            : `Pago via ${appt.forma_pagamento} em ${formatDateBR(appt.data_agendamento)}`}
                       </p>
                       <button 
                        onClick={handleOpenRecibo}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-cyan-500/20 transition-all flex items-center"
                      >
                        <i className="fa-solid fa-receipt mr-2"></i> RECIBO
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-3 w-full max-w-md bg-slate-100/50 p-4 rounded-2xl border border-slate-200">
                       {!isDividirPagamento ? (
                         <div className="flex items-center space-x-3 w-full">
                           <select 
                             value={formaPagamento}
                             onChange={(e) => setFormaPagamento(e.target.value)}
                             className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                           >
                             <option value="Pix">Pix</option>
                             <option value="Dinheiro">Dinheiro</option>
                             <option value="Crédito">Crédito</option>
                             <option value="Débito">Débito</option>
                           </select>
                           <button 
                             onClick={() => onQuickReceive({ method1: formaPagamento, val1: totalGeral })}
                             className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-green-500/20 transition-all flex items-center active:scale-95 whitespace-nowrap"
                           >
                             <i className="fa-solid fa-check mr-2 text-sm"></i> CONFIRMAR
                           </button>
                         </div>
                       ) : (
                         <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Valor 1</label>
                                  <input 
                                    type="number" 
                                    value={valor1}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      setValor1(v);
                                      setValor2(Math.max(0, totalGeral - v));
                                    }}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Método 1</label>
                                  <select 
                                    value={formaPagamento}
                                    onChange={(e) => setFormaPagamento(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs"
                                  >
                                    <option value="Pix">Pix</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="Crédito">Crédito</option>
                                    <option value="Débito">Débito</option>
                                  </select>
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Valor 2</label>
                                  <input 
                                    type="number" 
                                    value={valor2}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      setValor2(v);
                                      setValor1(Math.max(0, totalGeral - v));
                                    }}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">Método 2</label>
                                  <select 
                                    value={formaPagamento2}
                                    onChange={(e) => setFormaPagamento2(e.target.value)}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs"
                                  >
                                    <option value="Pix">Pix</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="Crédito">Crédito</option>
                                    <option value="Débito">Débito</option>
                                  </select>
                               </div>
                            </div>
                            
                            {!isSomaValida && (
                              <p className="text-[10px] font-bold text-rose-500 text-center uppercase tracking-widest">A soma ({valor1 + valor2}) deve ser {totalGeral.toFixed(2)}</p>
                            )}

                            <button 
                              disabled={!isSomaValida}
                              onClick={() => onQuickReceive({ method1: formaPagamento, val1: valor1, method2: formaPagamento2, val2: valor2 })}
                              className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center justify-center ${isSomaValida ? 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
                            >
                               <i className="fa-solid fa-check mr-2 text-sm"></i> CONFIRMAR DIVIDIDO
                            </button>
                         </div>
                       )}

                       <button 
                         onClick={() => {
                            const newState = !isDividirPagamento;
                            setIsDividirPagamento(newState);
                            if (newState) {
                               setValor1(totalGeral / 2);
                               setValor2(totalGeral / 2);
                            } else {
                               setValor1(totalGeral);
                               setValor2(0);
                            }
                         }}
                         className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-[#8E44AD] transition-colors pt-1"
                       >
                         {isDividirPagamento ? '- Voltar ao Pagamento Único' : '+ Dividir Pagamento'}
                       </button>
                    </div>
                  )}
               </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Agendamento</label>
                  <p className="text-sm font-black text-slate-700">
                    {formatDateBR(appt.data_agendamento)} • {String(appt.horario_inicio).substring(0, 5)} - {String(appt.horario_fim || '00:00').substring(0, 5)}
                  </p>
               </div>
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Vencimento</label>
                  <p className="text-sm font-black text-slate-700">{formatDateBR(appt.data_agendamento)}</p>
               </div>

               {(appt.data_inicio_real || appt.data_fim_real) && (
                 <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                    <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest block">Cronometragem Real</label>
                    <div className="grid grid-cols-2 gap-4">
                      {appt.data_inicio_real && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Início</p>
                          <p className="text-sm font-black text-slate-700">{new Date(appt.data_inicio_real).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      )}
                      {appt.data_fim_real && (
                        <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                          <p className="text-[8px] font-black text-emerald-600 uppercase">Fim</p>
                          <p className="text-sm font-black text-emerald-700">{new Date(appt.data_fim_real).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      )}
                    </div>
                 </div>
               )}
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Responsável</label>
               <p className="text-sm font-black text-slate-600">
                 {appt.funcionarios?.nome || 'Nenhum responsável selecionado'}
               </p>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cliente</label>
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm">
                    {client?.nome?.charAt(0) || 'C'}
                  </div>
                  <div className="min-w-0">
                     <p className="font-black text-slate-800 text-sm truncate">{client?.nome || 'Não identificado'}</p>
                     <p className="text-[9px] font-bold text-slate-400 uppercase">{client?.telefone}</p>
                  </div>
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pet</label>
               <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center space-x-3 mb-3">
                     <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 text-xl border-2 border-white shadow-sm overflow-hidden">
                        {pet?.foto_url ? <img src={pet.foto_url} className="w-full h-full object-cover" /> : <i className="fa-solid fa-paw"></i>}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 text-base truncate leading-none mb-1">{pet?.nome}</p>
                        <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase border border-emerald-100">Ativo</span>
                     </div>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed">
                    Pet criado em {pet?.created_at ? formatDateBR(pet.created_at.split('T')[0]) : '--/--/----'}
                  </p>
               </div>
            </div>

          </div>
        </div>

        <footer className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0 gap-2">
          <div className="flex gap-2 flex-1 md:flex-none">
            {!isReadOnly && (
              <button 
                onClick={() => onEdit(appt)}
                className="flex-1 md:flex-none bg-orange-500 hover:bg-orange-600 text-white px-4 py-3 md:px-8 md:py-3.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-[0.15em] shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
              >
                ALTERAR
              </button>
            )}
            
            <button 
              onClick={handleRemindWhatsApp}
              disabled={loadingReminder}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 md:px-8 md:py-3.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-[0.15em] shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {loadingReminder ? (
                <i className="fa-solid fa-circle-notch fa-spin mr-2"></i>
              ) : (
                <i className="fa-brands fa-whatsapp mr-2 text-sm"></i>
              )}
              ENVIAR LEMBRETE
            </button>
          </div>
          
          <div className="relative">
             <button 
               onClick={() => setShowMenu(!showMenu)}
               className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
             >
                <i className="fa-solid fa-ellipsis-vertical text-xl"></i>
             </button>
 
             {showMenu && (
               <div className="absolute bottom-16 right-0 w-52 bg-white !opacity-100 rounded-xl shadow-2xl border border-slate-100 z-[9999] py-2 animate-in slide-in-from-bottom-2 duration-200">
                  {appt.status === 'Agendado' && onStartAtendimento && (
                    <button onClick={() => { onStartAtendimento(appt); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-amber-600 hover:bg-amber-50 flex items-center border-b border-slate-50">
                       <i className="fa-solid fa-play mr-3"></i> Iniciar Atendimento
                    </button>
                  )}
                  {appt.status === 'Cancelado' && onReactivate && (
                    <button onClick={() => { onReactivate(appt); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center border-b border-slate-50">
                       <i className="fa-solid fa-rotate-left mr-3"></i> Reativar Agendamento
                    </button>
                  )}
                  {appt.status !== 'Finalizado' && appt.status !== 'Cancelado' && (
                    <>
                       <button onClick={() => { onFinalize(appt); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center border-b border-slate-50">
                          <i className="fa-solid fa-check-double mr-3"></i> Concluir e Avisar
                       </button>
                       {onFinalizeNoNotice && (
                         <button onClick={() => { onFinalizeNoNotice(appt); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-blue-500 hover:bg-blue-50 flex items-center border-b border-slate-50">
                            <i className="fa-solid fa-check mr-3"></i> Finalizar Sem Aviso
                         </button>
                       )}
                    </>
                  )}
                  {appt.status !== 'Cancelado' && (
                    <button onClick={() => { onCancel(appt); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center">
                       <i className="fa-solid fa-ban mr-3"></i> Cancelar Agend.
                    </button>
                  )}
                  <button onClick={() => { window.print(); setShowMenu(false); }} className="w-full text-left px-5 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center">
                     <i className="fa-solid fa-print mr-3"></i> Imprimir Ficha
                  </button>
               </div>
             )}
          </div>
        </footer>
      </div>

      {toast.visivel && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`${
            toast.tipo === 'sucesso' ? 'bg-emerald-500' : 
            toast.tipo === 'erro' ? 'bg-rose-500' : 'bg-slate-800'
          } text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 font-bold text-xs uppercase tracking-widest`}>
            {toast.tipo === 'carregando' && <i className="fa-solid fa-circle-notch fa-spin"></i>}
            {toast.tipo === 'sucesso' && <i className="fa-solid fa-circle-check"></i>}
            {toast.tipo === 'erro' && <i className="fa-solid fa-circle-exclamation"></i>}
            <span>{toast.mensagem}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendamentoDetalhesModal;
