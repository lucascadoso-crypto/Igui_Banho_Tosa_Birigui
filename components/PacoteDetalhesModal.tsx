
import React, { useState, useEffect, useRef } from 'react';
import { Pet, Client, Service, Unit, UserProfile } from '../types';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';
import { registrarAtividade } from '../services/logger';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface PacoteDetalhesModalProps {
  pack: any;
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
  onRefresh: () => void;
  onEdit: (pack: any) => void;
}

const PacoteDetalhesModal: React.FC<PacoteDetalhesModalProps> = ({ pack: initialPack, unit, supabaseClient, userProfile, onClose, onRefresh, onEdit }) => {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [pack, setPack] = useState(initialPack);
  const [empresa, setEmpresa] = useState<any>({ nome_fantasia: 'IGUI BANHO E TOSA', logo_url: '', endereco: '', telefone: '' });
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const receiptRef = useRef<HTMLDivElement>(null);

  // Estados para Registro de Pagamento Inline
  const [isPaying, setIsPaying] = useState(false);
  const [isRetroactiveMode, setIsRetroactiveMode] = useState(false);
  
  // Função para pegar data hoje no fuso de Brasília (America/Sao_Paulo)
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [paymentDate, setPaymentDate] = useState(getTodayBR());
  const [paymentMethod, setPaymentMethod] = useState('Pix');

  // Estados para Pagamento Dividido
  const [isDividirPagamento, setIsDividirPagamento] = useState(false);
  const [valor1, setValor1] = useState(parseFloat(pack.valor_total) || 0);
  const [valor2, setValor2] = useState(0);
  const [paymentMethod2, setPaymentMethod2] = useState('Dinheiro');

  const totalGeral = parseFloat(pack.valor_total) || 0;
  const isSomaValida = !isDividirPagamento || (Math.abs((valor1 + valor2) - totalGeral) < 0.01);

  // Sistema de Confirmação UI
  const [confirmacao, setConfirmacao] = useState<{
    visivel: boolean,
    acao: 'cancelar' | 'renovar' | 'erro' | 'info' | null,
    mensagem: string,
    callback?: () => void
  }>({ visivel: false, acao: null, mensagem: '' });

  useEffect(() => {
    fetchSessionDetails();
    fetchCompanyConfig();
  }, [pack.id]);

  const fetchCompanyConfig = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('config_sistema')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (!error && data) {
        setEmpresa(data);
        if (data.logo_url) {
          convertImageToBase64(data.logo_url);
        }
      }
    } catch (err) {
      console.error("Erro ao buscar config:", err);
    }
  };

  const convertImageToBase64 = (url: string) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        setLogoBase64(dataURL);
      }
    };
    img.src = url;
  };

  const handleGenerateReceipt = async () => {
    if (!receiptRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      // Abre o diálogo de impressão do navegador ou salva
      const blobURL = pdf.output('bloburl');
      window.open(blobURL.toString(), '_blank');
      
      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'RECIBO_GERADO',
        `Gerou recibo para o pacote ${pack.nome_pacote || pack.id}`,
        userProfile?.nome,
        userProfile?.cargo
      );
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Erro ao gerar o recibo.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionDetails = async () => {
    setLoading(true);
    try {
      // Recarregar dados do pacote para garantir que temos as atualizações de pagamento
      const { data: packData } = await supabaseClient
        .from('pacotes')
        .select('*, pets(*), clientes(*)')
        .eq('id', pack.id)
        .single();
      
      if (packData) setPack(packData);

      const { data: appts, error: apptErr } = await supabaseClient
        .from('agendamentos')
        .select('*, agendamento_itens(servicos(nome, preco_base))')
        .eq('pacote_id', pack.id)
        .order('data_agendamento', { ascending: true })
        .order('horario_inicio', { ascending: true });

      if (apptErr) throw apptErr;
      setSessions(appts || []);

      if (appts && appts.length > 0 && appts[0].agendamento_itens) {
        const uniqueServices = appts[0].agendamento_itens.map((it: any) => it.servicos);
        setServices(uniqueServices);
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes:", err);
    } finally {
      setLoading(false);
    }
  };

  const concludedCount = sessions.filter(s => s.status === 'Finalizado').length;
  const totalCount = sessions.length || pack.qtd_sessoes || 4;

  const handleSendReminder = (s: any, idx: number) => {
    const clientName = pack.clientes?.nome || 'Cliente';
    const petName = pack.pets?.nome || 'seu pet';
    const hora = String(s.horario_inicio || '').substring(0, 5);
    const n = idx + 1;
    const total = totalCount;
    const phoneRaw = pack.clientes?.telefone?.replace(/\D/g, '') || '';
    const phone = phoneRaw.startsWith('55') ? phoneRaw : `55${phoneRaw}`;

    const msg = `Olá ${clientName}! 🐾 Passando para confirmar o banho do(a) ${petName} amanhã às ${hora}. Confirmado?`;
    
    if (phone) {
      // Envio assíncrono com registro de log
      (async () => {
        const result = await enviarNotificacaoWhatsApp({
          telefone: phone,
          mensagem: msg,
          unidadeId: pack.unidade_id,
          supabaseClient,
          agendamentoId: s.id,
          tipo: 'manual',
          forceDirect: true,
          whatsapp_nome_instancia: unit.whatsapp_nome_instancia,
          whatsapp_token: unit.whatsapp_token,
          whatsapp_ativo: unit.whatsapp_ativo
        });

        // Registro de Auditoria (Manual)
        try {
          await supabaseClient.from('whatsapp_mensagens').insert([{
            status: result?.ok ? 'SUCESSO' : 'ERRO',
            nome_cliente: clientName,
            nome_pet: petName,
            telefone: phone,
            unidade_id: pack.unidade_id,
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
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Telefone do cliente não encontrado para enviar o WhatsApp.' });
    }
  };

  const handleRegisterPayment = async () => {
    setLoading(true);
    
    // Se não for retroativo, força a data de hoje (Brasília)
    const finalDate = isRetroactiveMode ? paymentDate : getTodayBR();
    
    const payload: any = {
      pago: true,
      data_pagamento: finalDate,
      forma_pagamento: paymentMethod,
      valor_total: valor1 // Na coluna original salvamos o valor principal se houver divisão
    };

    if (isDividirPagamento) {
      payload.forma_pagamento_2 = paymentMethod2;
      payload.valor_pagamento_2 = valor2;
      // O valor total do pacote permanece o mesmo, mas podemos registrar no log a divisão
    } else {
      payload.forma_pagamento_2 = null;
      payload.valor_pagamento_2 = 0;
    }

    try {
      const { error } = await supabaseClient
        .from('pacotes')
        .update(payload)
        .eq('id', pack.id);

      if (error) throw error;
      
      // Log de Auditoria
      const logMsg = isDividirPagamento 
        ? `Pet: ${pack.pets?.nome} - Pagamento Dividido para Pacote ${pack.nome_pacote || pack.id}, V1: ${valor1} (${paymentMethod}), V2: ${valor2} (${paymentMethod2})`
        : `Pet: ${pack.pets?.nome} - Pagamento Registrado para Pacote ${pack.nome_pacote || pack.id}, Método: ${paymentMethod}`;

      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'Alteração de Pagamento',
        logMsg,
        userProfile?.nome,
        userProfile?.cargo
      );

      setIsPaying(false);
      await fetchSessionDetails();
      onRefresh(); // Notificar pai (lista de pacotes)
    } catch (err: any) {
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Erro ao registrar pagamento: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSessionDate = async (sessionId: number | string, newDate: string) => {
    try {
      const { error } = await supabaseClient
        .from('agendamentos')
        .update({ data_agendamento: newDate })
        .eq('id', sessionId);
      
      if (error) throw error;
      fetchSessionDetails();
      onRefresh();
    } catch (err) {
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Erro ao atualizar data da sessão.' });
    }
  };

  const triggerCancelPack = () => {
    setConfirmacao({
      visivel: true,
      acao: 'cancelar',
      mensagem: 'Deseja realmente cancelar este pacote e todos os agendamentos futuros?',
      callback: () => performCancel()
    });
  };

  const triggerRenewPack = () => {
    setConfirmacao({
      visivel: true,
      acao: 'renovar',
      mensagem: 'Deseja renovar este pacote antecipadamente?',
      callback: () => performRenew()
    });
  };

  const performCancel = async () => {
    setConfirmacao({ visivel: true, acao: 'info', mensagem: 'Lógica de exclusão em cascata já implementada no componente pai (Pacotes.tsx). Feche este modal para excluir na lista principal.' });
  };

  const performRenew = () => {
    setConfirmacao({ visivel: true, acao: 'info', mensagem: 'A funcionalidade de renovação automática está sendo processada pela rede.' });
  };

  const handleRenovacaoManual = async () => {
    setLoading(true);
    try {
      // 1. Recuperar o cliente_id diretamente do cadastro do pet (Gatilho de Segurança)
      let clientId = null;
      if (pack.pet_id) {
        const { data: petData, error: petErr } = await supabaseClient
          .from('pets')
          .select('cliente_id, nome')
          .eq('id', pack.pet_id)
          .single();
        
        if (petErr || !petData?.cliente_id) {
          console.error("ERRO CRÍTICO: Pet sem dono vinculado interrompendo renovação manual.", { pet_id: pack.pet_id });
          throw new Error(`Falha Crítica: O pet "${petData?.nome || 'desconhecido'}" não possui um tutor vinculado no cadastro. Por favor, ajuste o cadastro do pet antes de renovar o pacote.`);
        }
        clientId = petData.cliente_id;
      }

      if (!clientId) {
        throw new Error("Não foi possível identificar o ID do cliente proprietário do pet.");
      }

      // 2. Finalizar pacote atual
      const { error: updateErr } = await supabaseClient
        .from('pacotes')
        .update({ status: 'FINALIZADO', renovacao_automatica: false })
        .eq('id', pack.id);
      
      if (updateErr) throw updateErr;

      // 3. Calcular intervalo (padrão 7 dias)
      let intervalDays = 7;
      if (sessions.length >= 2) {
        try {
          const d1 = new Date(sessions[0].data_agendamento + 'T12:00:00');
          const d2 = new Date(sessions[1].data_agendamento + 'T12:00:00');
          const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
          if (diff > 0) intervalDays = diff;
        } catch (e) {
          console.error("Erro ao calcular intervalo:", e);
        }
      }

      const lastSession = sessions[sessions.length - 1];
      const newCiclo = (Number(pack.ciclo_renovacao) || 1) + 1;

      // 4. Criar novo pacote (Clone)
      const newPackData = {
        cliente_id: clientId,
        pet_id: pack.pet_id,
        unidade_id: pack.unidade_id,
        qtd_sessoes: pack.qtd_sessoes,
        valor_total: pack.valor_total,
        valor_transporte: pack.valor_transporte,
        nome_pacote: `${pack.nome_pacote || pack.nome} (RENOVAÇÃO CICLO ${newCiclo})`,
        nome: `${pack.nome_pacote || pack.nome} (RENOVAÇÃO CICLO ${newCiclo})`,
        pago: false, // PENDENTE
        ativo: true,
        renovacao_automatica: true,
        status: 'ATIVO',
        pacote_anterior_id: pack.id,
        ciclo_renovacao: newCiclo
      };

      const { data: newPack, error: pErr } = await supabaseClient
        .from('pacotes')
        .insert([newPackData])
        .select().single();

      if (pErr) throw pErr;

      // 5. Gerar as novas sessões
      const newApptsPayload = [];
      let nextDate = new Date(lastSession.data_agendamento + 'T12:00:00');
      
      for (let i = 1; i <= pack.qtd_sessoes; i++) {
        nextDate.setDate(nextDate.getDate() + intervalDays);
        const dateStr = nextDate.toISOString().split('T')[0];
        
        newApptsPayload.push({
          pet_id: pack.pet_id,
          cliente_id: clientId, // Adicionado cliente_id para redundância segura
          pacote_id: newPack.id,
          unidade_id: pack.unidade_id,
          data_agendamento: dateStr,
          horario_inicio: lastSession.horario_inicio,
          valor_total: parseFloat(pack.valor_total) / pack.qtd_sessoes,
          valor_transporte: parseFloat(pack.valor_transporte) / pack.qtd_sessoes,
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

      // 6. Clonar itens de serviço (da primeira sessão do ciclo anterior)
      const { data: oldItems } = await supabaseClient
        .from('agendamento_itens')
        .select('servico_id')
        .eq('agendamento_id', sessions[0].id);

      if (oldItems && oldItems.length > 0) {
        const itemsToInsert: any[] = [];
        createdAppts.forEach(appt => {
          oldItems.forEach(item => {
            itemsToInsert.push({
              unidade_id: pack.unidade_id,
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

      // Log de Auditoria
      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'Edição de Pacote',
        `Pet: ${pack.pets?.nome} - Renovação manual executada. Ciclo ${newCiclo} gerado.`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setConfirmacao({ 
        visivel: true, 
        acao: 'info', 
        mensagem: 'Pacote finalizado e novo ciclo gerado! Um novo ciclo foi criado com status pendente.',
        callback: () => {
          onRefresh();
          onClose();
        }
      });

    } catch (err: any) {
      setConfirmacao({ visivel: true, acao: 'erro', mensagem: 'Erro na renovação manual: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRenovacao = async (val: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabaseClient
        .from('pacotes')
        .update({ renovacao_automatica: val })
        .eq('id', pack.id);

      if (error) throw error;
      
      setPack({ ...pack, renovacao_automatica: val });
      onRefresh();
    } catch (err: any) {
      alert('Erro ao atualizar renovação automática: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDateBR = (dateString?: string) => {
    if (!dateString) return 'Data não informada';
    // Regra Crucial: Apenas inverte a string do banco (YYYY-MM-DD) para evitar conflitos de fuso do objeto Date
    try {
      const parts = dateString.split('T')[0].split('-');
      if (parts.length !== 3) return dateString;
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 overflow-y-auto overflow-x-hidden">
      
      {/* OVERLAY DE CONFIRMAÇÃO UI */}
      {confirmacao.visivel && (
        <div className="app-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="app-modal-panel bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 border border-slate-100 animate-in zoom-in duration-300">
             <div className="flex flex-col items-center text-center space-y-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${
                  confirmacao.acao === 'cancelar' ? 'bg-rose-50 text-rose-500' : 
                  confirmacao.acao === 'renovar' ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'
                }`}>
                   <i className={`fa-solid ${confirmacao.acao === 'cancelar' ? 'fa-ban' : confirmacao.acao === 'renovar' ? 'fa-arrows-rotate' : 'fa-circle-info'}`}></i>
                </div>
                <h3 className="text-xl font-black text-slate-800">Confirmação</h3>
                <p className="text-sm font-bold text-slate-500 leading-relaxed">{confirmacao.mensagem}</p>
                <div className="flex w-full gap-3 pt-4">
                   {confirmacao.acao === 'info' ? (
                     <button 
                       onClick={() => {
                         if (confirmacao.callback) confirmacao.callback();
                         setConfirmacao({ visivel: false, acao: null, mensagem: '' });
                       }} 
                       className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase"
                     >
                       Entendi
                     </button>
                   ) : (
                     <>
                      <button onClick={() => setConfirmacao({ visivel: false, acao: null, mensagem: '' })} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase">Voltar</button>
                      <button onClick={() => confirmacao.callback && confirmacao.callback()} className={`flex-1 py-4 text-white rounded-2xl font-black text-xs uppercase shadow-lg ${confirmacao.acao === 'cancelar' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>Confirmar</button>
                     </>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      <div className="app-modal-panel bg-gray-50 w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] mx-auto md:max-w-7xl md:w-full rounded-[2rem] shadow-2xl overflow-y-auto overflow-x-hidden md:overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[calc(100vh-24px)] md:max-h-[90vh]">
        <header className="app-modal-header bg-[#8E44AD] px-5 md:px-12 py-5 md:py-10 pr-16 md:pr-12 text-white shrink-0 relative overflow-hidden">
          <div className="relative z-10 text-left min-w-0">
            <span className="block text-[8px] md:text-[10px] font-black opacity-60 uppercase tracking-[0.3em] mb-1 md:mb-2">Venda: #{String(pack.id).substring(0, 8).toUpperCase()}</span>
            <h3 className="text-xl md:text-4xl font-black tracking-tighter leading-tight break-words">Prontuário de Fidelidade</h3>
          </div>
          <button 
            onClick={onClose} 
            className="absolute right-4 md:right-10 top-4 md:top-10 z-50 p-2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl cursor-pointer transition-all active:scale-95"
          >
            <i className="fa-solid fa-xmark pointer-events-none"></i>
          </button>
        </header>

        <div className="app-modal-body flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 custom-scrollbar">
          <div className="lg:col-span-5 space-y-6 md:space-y-10 min-w-0">
            <div className="bg-white p-5 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Serviços do Pacote</h4>
              {services.map((s, idx) => (<div key={idx} className="flex items-center space-x-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-2 min-w-0"><i className="fa-solid fa-scissors text-[#8E44AD] shrink-0"></i><span className="font-bold text-slate-700 min-w-0 break-words">{s.nome}</span></div>))}
            </div>

            <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Consolidado</p>
              <p className="text-[clamp(42px,13vw,72px)] md:text-5xl font-black text-[#8E44AD] tracking-tighter mb-6 md:mb-8 leading-none max-w-full break-words">R$ {(parseFloat(pack.valor_total) || 0).toFixed(2)}</p>
              
              <div className="border-t border-slate-50 pt-6 md:pt-8">
                {pack.pago ? (
                  <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center space-x-4 text-emerald-800 animate-in fade-in duration-300">
                     <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <i className="fa-solid fa-check"></i>
                     </div>
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Pagamento Confirmado</p>
                        <p className="text-sm font-bold">PAGO via {pack.forma_pagamento} em {formatDateBR(pack.data_pagamento)}</p>
                     </div>
                  </div>
                ) : isPaying ? (
                   <div className="bg-slate-50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 space-y-5 animate-in slide-in-from-top-4 duration-300 overflow-hidden">
                     <h5 className="text-xs font-black text-slate-800 uppercase tracking-widest text-center">
                       {isRetroactiveMode ? 'Registrar Recebimento Retroativo' : 'Registrar Recebimento (Hoje)'}
                     </h5>
                     <div className={`grid ${isRetroactiveMode ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                        {isRetroactiveMode && (
                          <div className="space-y-1.5">
                             <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Data Real</label>
                             <input 
                               type="date" 
                               value={paymentDate}
                               onChange={(e) => setPaymentDate(e.target.value)}
                               className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                             />
                          </div>
                        )}
                        <div className="space-y-1.5">
                           <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Forma de Pagamento</label>
                           {!isDividirPagamento ? (
                             <select 
                               value={paymentMethod}
                               onChange={(e) => setPaymentMethod(e.target.value)}
                               className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                             >
                                <option value="Pix">Pix</option>
                                <option value="Dinheiro">Dinheiro</option>
                                <option value="Cartão Crédito">Cartão Crédito</option>
                                <option value="Cartão Débito">Cartão Débito</option>
                             </select>
                           ) : (
                             <div className="space-y-4 pt-2">
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Valor 1</label>
                                      <input type="number" value={valor1} onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        setValor1(v);
                                        setValor2(Math.max(0, totalGeral - v));
                                      }} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold"/>
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Método 1</label>
                                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold">
                                         <option value="Pix">Pix</option>
                                         <option value="Dinheiro">Dinheiro</option>
                                         <option value="Cartão Crédito">Cartão Crédito</option>
                                         <option value="Cartão Débito">Cartão Débito</option>
                                      </select>
                                   </div>
                                </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Valor 2</label>
                                      <input type="number" value={valor2} onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        setValor2(v);
                                        setValor1(Math.max(0, totalGeral - v));
                                      }} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold"/>
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Método 2</label>
                                      <select value={paymentMethod2} onChange={(e) => setPaymentMethod2(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold">
                                         <option value="Pix">Pix</option>
                                         <option value="Dinheiro">Dinheiro</option>
                                         <option value="Cartão Crédito">Cartão Crédito</option>
                                         <option value="Cartão Débito">Cartão Débito</option>
                                      </select>
                                   </div>
                                </div>
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
                             className="text-[10px] font-black text-slate-400 hover:text-[#8E44AD] uppercase mt-2 block"
                           >
                             {isDividirPagamento ? '- Pagamento Único' : '+ Dividir Pagamento'}
                           </button>

                           {!isSomaValida && (
                             <p className="text-[10px] font-bold text-rose-500 mt-2">A soma deve ser R$ {totalGeral.toFixed(2)}</p>
                           )}
                        </div>
                     </div>
                     <div className="flex flex-col-reverse md:flex-row gap-2">
                        <button 
                          onClick={() => setIsPaying(false)}
                          className="w-full md:flex-1 py-3 bg-white text-slate-400 font-bold text-xs uppercase rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors"
                        >Cancelar</button>
                        <button 
                          disabled={!isSomaValida || loading}
                          onClick={() => handleRegisterPayment()}
                          className={`w-full md:flex-[2] py-3 text-white font-black text-xs uppercase rounded-xl shadow-lg transition-all flex items-center justify-center ${isSomaValida ? 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
                        >
                           {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-check-circle mr-2"></i>}
                           {!isSomaValida ? 'Valor Incorreto' : (isRetroactiveMode ? 'Confirmar Retroativo' : 'Confirmar Pagamento')}
                        </button>
                     </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        setIsRetroactiveMode(false);
                        setPaymentDate(getTodayBR());
                        setIsPaying(true);
                      }}
                      className="w-full bg-[#00BFA5] hover:opacity-90 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-xl shadow-[#00BFA5]/20 transition-all active:scale-95 flex items-center justify-center"
                    >
                       <i className="fa-solid fa-hand-holding-dollar mr-3 text-lg"></i>
                       Registrar Pagamento (Hoje)
                    </button>
                    <button 
                      onClick={() => {
                        setIsRetroactiveMode(true);
                        setIsPaying(true);
                      }}
                      className="w-full py-2 text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest underline decoration-dotted underline-offset-4 transition-all"
                    >
                      Registrar pagamento retroativo (Data Manual)
                    </button>
                  </div>
                )}
              </div>

              <button 
                disabled={!pack.pago || loading}
                onClick={handleGenerateReceipt}
                className={`mt-6 w-full py-4 rounded-2xl font-black text-xs uppercase shadow-xl transition-all flex items-center justify-center ${pack.pago ? 'bg-slate-800 text-white hover:bg-black' : 'bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200 shadow-none'}`}
              >
                {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-3"></i> : <i className="fa-solid fa-print mr-3"></i>}
                {pack.pago ? 'EMITIR RECIBO FINAL' : 'PAGAMENTO PENDENTE'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6 md:space-y-10 min-w-0">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <span className="bg-[#8E44AD]/10 text-[#8E44AD] px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-sm">
                {concludedCount} de {totalCount} Concluídos
              </span>
              
              {(pack.status === 'ATIVO' || pack.status === 'Em Execução' || !pack.status) && (
                <span className="bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20">Em Execução</span>
              )}

              {pack.status === 'FINALIZADO' && (
                <span className="bg-slate-500 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-slate-500/20">Finalizado</span>
              )}

              {/* BOTÃO MANUAL DE RENOVAÇÃO (Se todas concluídas e pacote ainda Ativo) */}
              {concludedCount === totalCount && (pack.status === 'ATIVO' || pack.status === 'Em Execução' || !pack.status) && (
                <button 
                  onClick={handleRenovacaoManual}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 md:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-xl animate-bounce flex items-center space-x-2"
                >
                  <i className="fa-solid fa-arrows-rotate"></i>
                  <span>Finalizar e Renovar</span>
                </button>
              )}
            </div>
            
            <div className="space-y-4">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center">
                 <i className="fa-solid fa-list-check mr-2 text-[#8E44AD]"></i> 
                 Cronograma de Sessões
               </h4>
               {sessions.map((s, idx) => (
                 <div key={s.id} className="bg-white p-4 md:p-6 rounded-[1.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4 md:gap-0 group overflow-hidden">
                    <div className="w-full md:w-20 text-left md:text-center border-b md:border-b-0 md:border-r border-slate-50 pb-3 md:pb-0 md:mr-8">
                       <p className="text-2xl font-black text-slate-800">{idx + 1}</p>
                    </div>
                    <div className="w-full min-w-0 flex-1 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                       <div className="space-y-2 min-w-0">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${s.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                             {s.status}
                          </span>
                          <div className="flex items-center w-full">
                             <input 
                               type="date" 
                               value={s.data_agendamento} 
                               onChange={(e) => handleUpdateSessionDate(s.id, e.target.value)} 
                               className="w-full md:w-auto bg-transparent text-sm font-bold text-slate-700 outline-none border-b border-transparent hover:border-slate-200 transition-all"
                             />
                          </div>
                       </div>
                       
                       <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                          {s.status === 'Agendado' && (
                            <button 
                              onClick={() => handleSendReminder(s, idx)}
                              className="w-full md:w-auto flex items-center justify-center space-x-2 px-3 py-3 md:py-2 border border-emerald-100 rounded-xl text-emerald-500 hover:bg-emerald-50 transition-all group/btn"
                              title="Enviar lembrete via WhatsApp"
                            >
                               <i className="fa-brands fa-whatsapp text-lg"></i>
                               <span className="text-[10px] font-black uppercase tracking-widest">Lembrar</span>
                            </button>
                          )}
                          <div className="text-left md:text-right">
                             <p className="text-[10px] font-black text-slate-300 uppercase">Horário Previsto</p>
                             <p className="font-bold text-slate-600">{String(s.horario_inicio || '').substring(0, 5)}</p>
                          </div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        </div>

        <footer className="app-modal-footer p-4 md:p-10 bg-white border-t border-slate-100 flex flex-col md:flex-row md:justify-between md:items-center shrink-0 gap-3 md:gap-2">
           <div className="w-full md:w-auto grid grid-cols-1 md:flex gap-2">
            <button onClick={triggerCancelPack} className="w-full md:w-auto px-4 py-3 md:px-10 md:py-4 bg-white text-rose-500 rounded-2xl font-black text-[10px] md:text-xs uppercase border-2 border-rose-100 hover:bg-rose-50 transition-all flex items-center justify-center">
                <i className="fa-solid fa-ban mr-2 md:mr-3"></i> CANCELAR
            </button>
            <button onClick={() => onEdit(pack)} className="w-full md:w-auto px-4 py-3 md:px-10 md:py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] md:text-xs uppercase border-2 border-slate-200 hover:bg-slate-200 transition-all flex items-center justify-center">
                <i className="fa-solid fa-pencil mr-2 md:mr-3"></i> EDITAR PACOTE
            </button>
           </div>

           <div className="w-full md:w-auto flex items-center justify-between md:justify-start md:space-x-4 bg-slate-50 px-4 md:px-6 py-3 rounded-2xl border border-slate-100">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Renovação Automática</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Gera novo pacote ao finalizar</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={pack.renovacao_automatica || false} 
                    onChange={(e) => handleToggleRenovacao(e.target.checked)} 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
           </div>
        </footer>
      </div>

      {/* TEMPLATE DO RECIBO (HIDDEN) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={receiptRef} style={{ width: '210mm', padding: '20mm', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          {/* Cabeçalho */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #eee', paddingBottom: '10mm', marginBottom: '10mm' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               {logoBase64 ? (
                 <img src={logoBase64} style={{ width: '35mm', height: '35mm', objectFit: 'contain', borderRadius: '50%' }} alt="Logo" />
               ) : (
                 <div style={{ width: '30mm', height: '30mm', borderRadius: '50%', background: '#ffde00', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                   <span style={{ margin: 'auto', fontSize: '20px' }}>🐾</span>
                 </div>
               )}
               <div style={{ marginLeft: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '24pt', fontWeight: '900' }}>{empresa.nome_fantasia || 'IGUI BANHO E TOSA'}</h2>
                <p style={{ margin: '2mm 0', fontSize: '10pt', color: '#666' }}>{empresa.endereco || 'Endereço não informado'}</p>
                <p style={{ margin: 0, fontSize: '10pt', color: '#666' }}>Contato: {empresa.telefone || unit.phone || '(18) 0000-0000'}</p>
               </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12pt', fontWeight: 'bold', color: '#8E44AD' }}>RECIBO DE SERVIÇOS</span>
              <p style={{ margin: '2mm 0', fontSize: '10pt', fontWeight: 'bold' }}>#{String(pack.id).substring(0, 8).toUpperCase()}</p>
            </div>
          </div>

          {/* Dados do Cliente / Pet */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10mm', marginBottom: '10mm' }}>
            <div style={{ background: '#f9f9f9', padding: '5mm', borderRadius: '10px' }}>
              <h4 style={{ margin: '0 0 3mm 0', fontSize: '9pt', color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>Dados do Cliente</h4>
              <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold' }}>{pack.clientes?.nome || 'N/A'}</p>
              <p style={{ margin: '2mm 0 0 0', fontSize: '10pt', color: '#666' }}>{pack.clientes?.telefone || 'N/A'}</p>
            </div>
            <div style={{ background: '#f9f9f9', padding: '5mm', borderRadius: '10px' }}>
              <h4 style={{ margin: '0 0 3mm 0', fontSize: '9pt', color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>Identificação do Pet</h4>
              <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold' }}>{pack.pets?.nome || 'N/A'}</p>
              <p style={{ margin: '2mm 0 0 0', fontSize: '10pt', color: '#666' }}>Raça: {pack.pets?.raca || 'SRD'}</p>
            </div>
          </div>

          {/* Detalhes Financeiros */}
          <div style={{ background: '#8E44AD', padding: '6mm', borderRadius: '15px', color: '#fff', marginBottom: '10mm' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: '10pt', opacity: 0.8 }}>Forma de Pagamento</p>
                <p style={{ margin: '1mm 0 0 0', fontSize: '12pt', fontWeight: 'bold' }}>{pack.forma_pagamento} {pack.valor_pagamento_2 ? `+ ${pack.forma_pagamento_2}` : ''}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '10pt', opacity: 0.8 }}>Valor Total</p>
                <p style={{ margin: '1mm 0 0 0', fontSize: '24pt', fontWeight: '900' }}>R$ {(parseFloat(pack.valor_total) || 0).toFixed(2)}</p>
              </div>
            </div>
            <div style={{ marginTop: '4mm', paddingTop: '4mm', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '9pt', opacity: 0.9 }}>
              Pago em: {formatDateBR(pack.data_pagamento)}
            </div>
          </div>

          {/* Cronograma de Sessões */}
          <div>
            <h4 style={{ margin: '0 0 5mm 0', fontSize: '11pt', fontWeight: '900', textTransform: 'uppercase', borderBottom: '2px solid #8E44AD', display: 'inline-block', paddingBottom: '2mm' }}>Cronograma de Sessões</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '5mm' }}>
              <thead>
                <tr style={{ background: '#f4f4f4' }}>
                  <th style={{ padding: '4mm', textAlign: 'center', fontSize: '10pt', width: '20mm', fontWeight: 'bold' }}>#</th>
                  <th style={{ padding: '4mm', textAlign: 'left', fontSize: '10pt', fontWeight: 'bold' }}>Data</th>
                  <th style={{ padding: '4mm', textAlign: 'left', fontSize: '10pt', fontWeight: 'bold' }}>Serviços</th>
                  <th style={{ padding: '4mm', textAlign: 'center', fontSize: '10pt', fontWeight: 'bold' }}>Horário</th>
                  <th style={{ padding: '4mm', textAlign: 'center', fontSize: '10pt', fontWeight: 'bold' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '4mm', textAlign: 'center', fontSize: '10pt', fontWeight: 'bold' }}>{idx + 1}</td>
                    <td style={{ padding: '4mm', textAlign: 'left', fontSize: '10pt' }}>{formatDateBR(s.data_agendamento)}</td>
                    <td style={{ padding: '4mm', textAlign: 'left', fontSize: '10pt', color: '#666' }}>
                      {services.map(ser => ser.nome).join(' + ')}
                    </td>
                    <td style={{ padding: '4mm', textAlign: 'center', fontSize: '10pt' }}>{String(s.horario_inicio || '').substring(0, 5)}</td>
                    <td style={{ padding: '4mm', textAlign: 'center' }}>
                      <span style={{ padding: '1mm 3mm', borderRadius: '4px', fontSize: '8pt', fontWeight: 'black', background: s.status === 'Finalizado' ? '#e6f6f0' : '#fff9e6', color: s.status === 'Finalizado' ? '#10b981' : '#d97706', textTransform: 'uppercase' }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé */}
          <div style={{ marginTop: '20mm', textAlign: 'center', borderTop: '1px dashed #ccc', paddingTop: '10mm' }}>
            <p style={{ margin: 0, fontSize: '12pt', fontWeight: 'bold', color: '#333' }}>Obrigado pela preferência e confiança em nossos cuidados!</p>
            <p style={{ margin: '2mm 0 0 0', fontSize: '9pt', color: '#999', textTransform: 'uppercase', letterSpacing: '2px' }}>Recibo não fiscal</p>
            <div style={{ marginTop: '8mm', fontSize: '8pt', color: '#bbb' }}>
              Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR').substring(0, 5)}
              <br />
              Powered by iG ERP
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PacoteDetalhesModal;
