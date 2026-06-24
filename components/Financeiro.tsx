
import React, { useState, useEffect } from 'react';
import { Unit } from '../types';
import { registrarAtividade } from '../services/logger';
import FiscalDraftModal from './FiscalDraftModal';
import FiscalHistory from './FiscalHistory';

interface FinanceiroProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: any;
}

const Financeiro: React.FC<FinanceiroProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const isMaster = userProfile?.cargo === 'master';
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'diaria' | 'auditoria' | 'fiscal'>('diaria');
  const [fiscalDraftTransaction, setFiscalDraftTransaction] = useState<any | null>(null);

  // Estado para o Modal de Ajuste
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    valor: 0,
    metodo: '',
    metodo2: '',
    valor2: 0
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayBR());
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totals, setTotals] = useState({
    bruto: 0,
    avulso: 0,
    pacotes: 0,
    transporte: 0,
    gastos: 0,
    pix: 0,
    dinheiro: 0,
    cartao: 0
  });

  const toNumber = (value: any) => Number.parseFloat(String(value ?? 0)) || 0;

  const normalizePaymentMethod = (method: string) => {
    const normalized = String(method || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    if (normalized.includes('pix')) return 'pix';
    if (normalized.includes('dinheiro')) return 'dinheiro';
    if (normalized.includes('debito')) return 'debito';
    if (normalized.includes('credito')) return 'credito';
    if (normalized.includes('transferencia')) return 'transferencia';
    return normalized ? 'outro' : '';
  };

  const addPaymentToTotals = (method: string, value: number) => {
    const normalized = normalizePaymentMethod(method);
    if (normalized === 'pix') return { pix: value, dinheiro: 0, cartao: 0 };
    if (normalized === 'dinheiro') return { pix: 0, dinheiro: value, cartao: 0 };
    if (normalized) return { pix: 0, dinheiro: 0, cartao: value };
    return { pix: 0, dinheiro: 0, cartao: 0 };
  };

  const canCreateFiscalDraft = ['master', 'financeiro', 'gerente', 'admin_unidade', 'administrador'].includes(userProfile?.cargo);
  const canViewFiscal = ['master', 'financeiro', 'gerente', 'admin_unidade', 'administrador'].includes(userProfile?.cargo);

  const isFinalizedStatus = (status?: string) => {
    const normalized = String(status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return normalized.includes('finalizado') || normalized.includes('concluido');
  };

  const canShowFiscalDraftAction = (transaction: any) => {
    if (!canCreateFiscalDraft) return false;
    if (!['agendamentos', 'pacotes'].includes(transaction?.sourceTable)) return false;
    if (transaction.sourceTable === 'pacotes') return Boolean(transaction.originalData?.pago);
    return Boolean(transaction.originalData?.pago) && isFinalizedStatus(transaction.originalData?.status);
  };

  useEffect(() => {
    fetchFinancialData();
  }, [unit.id, selectedDate]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      // 1. Buscar Agendamentos Avulsos Pagos (Onde pacote_id é NULO)
      const apptsPromise = supabaseClient
        .from('agendamentos')
        .select('id, unidade_id, cliente_id, pet_id, pacote_id, status, valor_total, valor_transporte, forma_pagamento, valor_pagamento_2, forma_pagamento_2, data_agendamento, pets(nome), agendamento_itens(servicos(nome))')
        .eq('unidade_id', unit.id)
        .eq('data_agendamento', selectedDate)
        .eq('pago', true)
        .is('pacote_id', null);

      // 2. Buscar Venda de Pacotes do Dia (Data de Pagamento)
      // Usando comparação estrita de string YYYY-MM-DD para evitar deslocamento de fuso
      const packsPromise = supabaseClient
        .from('pacotes')
        .select('id, valor_total, valor_transporte, forma_pagamento, valor_pagamento_2, forma_pagamento_2, data_pagamento, created_at, pets(nome)')
        .eq('unidade_id', unit.id)
        .eq('data_pagamento', selectedDate)
        .eq('pago', true);

      // 3. Buscar Despesas do Dia
      const expensesPromise = supabaseClient
        .from('despesas')
        .select('*')
        .eq('unidade_id', unit.id)
        .eq('data_despesa', selectedDate);

      // 4. Buscar Extras Pagos do Dia
      const extrasPromise = supabaseClient
        .from('agendamentos')
        .select('id, valor_extra_total, forma_pagamento_extra, data_pagamento_extra, pets(nome)')
        .eq('unidade_id', unit.id)
        .eq('data_pagamento_extra', selectedDate)
        .eq('status_pagamento_extra', 'PAGO');

      const financialMovementsPromise = supabaseClient
        .from('financeiro_movimentos')
        .select('id, unidade_id, cliente_id, pet_id, pacote_id, agendamento_id, tipo, categoria, descricao, valor_total, data_competencia, data_vencimento, status, origem, origem_id, financeiro_pagamentos(id, forma_pagamento, valor, pago_em, observacao)')
        .eq('unidade_id', unit.id)
        .eq('data_competencia', selectedDate)
        .eq('tipo', 'receita')
        .not('agendamento_id', 'is', null);

      const [
        { data: appts, error: apptErr },
        { data: packs, error: packErr },
        { data: expenses, error: expErr },
        { data: extras, error: extraErr },
        { data: financialMovements, error: financialMovementsErr }
      ] = await Promise.all([apptsPromise, packsPromise, expensesPromise, extrasPromise, financialMovementsPromise]);

      if (apptErr) throw apptErr;
      if (packErr) throw packErr;
      if (expErr) throw expErr;
      if (extraErr) throw extraErr;
      if (financialMovementsErr) throw financialMovementsErr;

      // 4. Mesclar e Processar
      const combined: any[] = [];
      let sumAvulso = 0;
      let sumPacotes = 0;
      let sumTransporte = 0;
      let sumGastos = 0;
      let pPix = 0;
      let pDinheiro = 0;
      let pCartao = 0;

      const adjustedMovementByAppointment = new Map<number, any>();
      financialMovements?.forEach((movement: any) => {
        if (!movement?.agendamento_id) return;
        if (movement?.origem === 'extras_agendamento' || movement?.categoria === 'extras') return;
        const current = adjustedMovementByAppointment.get(Number(movement.agendamento_id));
        if (!current || Number(movement.id) > Number(current.id)) {
          adjustedMovementByAppointment.set(Number(movement.agendamento_id), movement);
        }
      });

      appts?.forEach((a: any) => {
        try {
          // Se for de pacote, não conta como receita avulsa (já foi contado na venda do pacote)
          if (a?.pacote_id) return;

          const ajusteFinanceiro = adjustedMovementByAppointment.get(Number(a.id));
          const pagamentosAjuste = Array.isArray(ajusteFinanceiro?.financeiro_pagamentos)
            ? [...ajusteFinanceiro.financeiro_pagamentos].sort((pa: any, pb: any) => Number(pa.id) - Number(pb.id))
            : [];

          const v1 = ajusteFinanceiro ? toNumber(pagamentosAjuste[0]?.valor ?? ajusteFinanceiro.valor_total) : toNumber(a?.valor_total);
          const v2 = ajusteFinanceiro ? toNumber(pagamentosAjuste[1]?.valor) : toNumber(a?.valor_pagamento_2);
          const totalAtendimento = ajusteFinanceiro ? toNumber(ajusteFinanceiro.valor_total) : v1 + v2;
          
          const taxi = toNumber(a?.valor_transporte);
          sumAvulso += (totalAtendimento - taxi);
          sumTransporte += taxi;
          
          const m1 = ajusteFinanceiro ? (pagamentosAjuste[0]?.forma_pagamento || '') : (a?.forma_pagamento || '');
          const m2 = ajusteFinanceiro ? (pagamentosAjuste[1]?.forma_pagamento || '') : (a?.forma_pagamento_2 || '');

          // Contabilizar Valor 1
          const totalM1 = addPaymentToTotals(m1, v1);
          pPix += totalM1.pix;
          pDinheiro += totalM1.dinheiro;
          pCartao += totalM1.cartao;

          // Contabilizar Valor 2
          const totalM2 = addPaymentToTotals(m2, v2);
          pPix += totalM2.pix;
          pDinheiro += totalM2.dinheiro;
          pCartao += totalM2.cartao;

          // Processar lista de serviços com segurança
          const listaServicos = a?.agendamento_itens?.map((it: any) => it?.servicos?.nome).filter(Boolean).join(', ') || 'Serviço não especificado';

          const originalData = ajusteFinanceiro ? {
            ...a,
            ajuste_financeiro: ajusteFinanceiro,
            valor_total: v1,
            forma_pagamento: m1,
            valor_pagamento_2: v2,
            forma_pagamento_2: m2
          } : a;

          combined.push({
            id: a?.id || Math.random().toString(36).substr(2, 9),
            tipo: 'Receita (Avulso)',
            descricao: `Banho: ${a?.pets?.nome || 'Pet'}`,
            subDescricao: listaServicos,
            valor: totalAtendimento,
            metodo: m2 ? `${m1} + ${m2}` : (m1 || 'N/A'),
            hora: 'Atendimento',
            natureza: 'Entrada',
            sourceTable: 'agendamentos',
            originalData
          });
        } catch (innerErr) {
          console.error("Erro ao processar agendamento individual:", innerErr, a);
        }
      });

      packs?.forEach((p: any) => {
        try {
          const v1 = parseFloat(p?.valor_total) || 0;
          const v2 = parseFloat(p?.valor_pagamento_2) || 0;
          const totalPack = v1 + v2;
          
          const taxi = parseFloat(p?.valor_transporte) || 0;
          sumPacotes += (totalPack - taxi);
          sumTransporte += taxi;

          const m1 = (p?.forma_pagamento || '').toLowerCase();
          const m2 = (p?.forma_pagamento_2 || '').toLowerCase();

          // Contabilizar Valor 1
          if (m1 === 'pix') pPix += v1;
          else if (m1 === 'dinheiro') pDinheiro += v1;
          else if (m1) pCartao += v1;

          // Contabilizar Valor 2
          if (m2 === 'pix') pPix += v2;
          else if (m2 === 'dinheiro') pDinheiro += v2;
          else if (m2) pCartao += v2;

          combined.push({
            id: p?.id || Math.random().toString(36).substr(2, 9),
            tipo: 'Receita (Pacote)',
            descricao: `Venda Pacote: ${p?.pets?.nome || 'Pet'}`,
            subDescricao: 'Recorrência / Fidelidade',
            valor: totalPack,
            metodo: m2 ? `${p.forma_pagamento} + ${p.forma_pagamento_2}` : (p?.forma_pagamento || 'N/A'),
            hora: p?.created_at ? new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
            natureza: 'Entrada',
            sourceTable: 'pacotes',
            originalData: p
          });
        } catch (innerErr) {
          console.error("Erro ao processar pacote individual:", innerErr, p);
        }
      });

      expenses?.forEach((e: any) => {
        try {
          const val = parseFloat(e?.valor_total) || 0;
          sumGastos += val;
          combined.push({
            id: e?.id || Math.random().toString(36).substr(2, 9),
            tipo: 'Despesa',
            descricao: `Compra: ${e?.nome_item || 'Item'}`,
            subDescricao: e?.descricao || 'Insumos / Manutenção',
            valor: val,
            metodo: 'Caixa',
            hora: 'Lançamento',
            natureza: 'Saída',
            sourceTable: 'despesas',
            originalData: e
          });
        } catch (innerErr) {
          console.error("Erro ao processar despesa individual:", innerErr, e);
        }
      });

      extras?.forEach((ex: any) => {
        try {
          const val = parseFloat(ex?.valor_extra_total) || 0;
          const metodo = (ex?.forma_pagamento_extra || 'N/A').toLowerCase();
          
          sumAvulso += val;
          if (metodo === 'pix') pPix += val;
          else if (metodo === 'dinheiro') pDinheiro += val;
          else if (metodo !== 'n/a') pCartao += val;

          combined.push({
            id: `extra-${ex.id}`,
            tipo: 'Receita (Extra)',
            descricao: `Extra: ${ex?.pets?.nome || 'Pet'}`,
            subDescricao: 'Serviço adicional em agendamento',
            valor: val,
            metodo: ex.forma_pagamento_extra,
            hora: 'Lançamento',
            natureza: 'Entrada',
            sourceTable: 'agendamentos_extra',
            originalData: ex
          });
        } catch (innerErr) {
          console.error("Erro ao processar extra individual:", innerErr, ex);
        }
      });

      combined.sort((a, b) => (a?.natureza || '').localeCompare(b?.natureza || ''));

      setTransactions(combined);
      setTotals({
        bruto: sumAvulso + sumPacotes + sumTransporte,
        avulso: sumAvulso,
        pacotes: sumPacotes,
        transporte: sumTransporte,
        gastos: sumGastos,
        pix: pPix,
        dinheiro: pDinheiro,
        cartao: pCartao
      });

    } catch (err) {
      console.error("ERRO AO BUSCAR CAIXA:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateBR = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const saveAppointmentFinancialAdjustment = async (transaction: any, originalData: any) => {
    const valorPrincipal = toNumber(editForm.valor);
    const valorSecundario = toNumber(editForm.valor2);
    const valorTotal = valorPrincipal + valorSecundario;
    const metodoPrincipal = normalizePaymentMethod(editForm.metodo);
    const metodoSecundario = normalizePaymentMethod(editForm.metodo2);

    if (valorPrincipal <= 0) {
      throw new Error('Informe um valor principal maior que zero.');
    }

    if (!metodoPrincipal) {
      throw new Error('Informe o método de pagamento principal.');
    }

    if (valorSecundario > 0 && !metodoSecundario) {
      throw new Error('Informe o método do segundo pagamento.');
    }

    const baseMovement = {
      unidade_id: unit.id,
      cliente_id: originalData.cliente_id || null,
      pet_id: originalData.pet_id || null,
      pacote_id: originalData.pacote_id || null,
      agendamento_id: originalData.id,
      tipo: 'receita',
      categoria: 'banho_avulso',
      descricao: transaction.descricao,
      valor_total: valorTotal,
      data_competencia: originalData.data_agendamento || selectedDate,
      data_vencimento: originalData.data_agendamento || selectedDate,
      status: 'pago',
      origem: 'ajuste_agendamento',
      origem_id: String(originalData.id)
    };

    let movimento = originalData.ajuste_financeiro;

    if (!movimento?.id) {
      const { data: existingMovements, error: existingMovementError } = await supabaseClient
        .from('financeiro_movimentos')
        .select('id, origem, categoria')
        .eq('unidade_id', unit.id)
        .eq('agendamento_id', originalData.id)
        .order('id', { ascending: false });

      if (existingMovementError) throw existingMovementError;

      movimento = existingMovements?.find((item: any) => item?.origem !== 'extras_agendamento' && item?.categoria !== 'extras');
    }

    if (movimento?.id) {
      const { error: updateMovementError } = await supabaseClient
        .from('financeiro_movimentos')
        .update(baseMovement)
        .eq('id', movimento.id);

      if (updateMovementError) throw updateMovementError;
    } else {
      const { data: insertedMovement, error: insertMovementError } = await supabaseClient
        .from('financeiro_movimentos')
        .insert([baseMovement])
        .select('id')
        .single();

      if (insertMovementError) throw insertMovementError;
      movimento = insertedMovement;
    }

    const { data: existingPayments, error: paymentsFetchError } = await supabaseClient
      .from('financeiro_pagamentos')
      .select('id')
      .eq('movimento_id', movimento.id)
      .order('id', { ascending: true });

    if (paymentsFetchError) throw paymentsFetchError;

    const paidAt = `${originalData.data_agendamento || selectedDate}T12:00:00-03:00`;
    const desiredPayments = [
      {
        unidade_id: unit.id,
        movimento_id: movimento.id,
        forma_pagamento: metodoPrincipal,
        valor: valorPrincipal,
        pago_em: paidAt,
        observacao: `Pagamento principal ajustado do agendamento ${originalData.id}`
      }
    ];

    if (valorSecundario > 0) {
      desiredPayments.push({
        unidade_id: unit.id,
        movimento_id: movimento.id,
        forma_pagamento: metodoSecundario,
        valor: valorSecundario,
        pago_em: paidAt,
        observacao: `Pagamento complementar ajustado do agendamento ${originalData.id}`
      });
    }

    for (let index = 0; index < desiredPayments.length; index += 1) {
      const payment = desiredPayments[index];
      const existingPayment = existingPayments?.[index];

      if (existingPayment?.id) {
        const { error: updatePaymentError } = await supabaseClient
          .from('financeiro_pagamentos')
          .update(payment)
          .eq('id', existingPayment.id);

        if (updatePaymentError) throw updatePaymentError;
      } else {
        const { error: insertPaymentError } = await supabaseClient
          .from('financeiro_pagamentos')
          .insert([payment]);

        if (insertPaymentError) throw insertPaymentError;
      }
    }

    const stalePayments = existingPayments?.slice(desiredPayments.length) || [];
    for (const stalePayment of stalePayments) {
      const { error: stalePaymentError } = await supabaseClient
        .from('financeiro_pagamentos')
        .update({
          valor: 0,
          observacao: `Pagamento excedente zerado pelo ajuste financeiro do agendamento ${originalData.id}`
        })
        .eq('id', stalePayment.id);

      if (stalePaymentError) throw stalePaymentError;
    }
  };

  const handleSaveAdjustment = async () => {
    // Segurança Extra: Validação em tempo de execução
    if (!isMaster) {
      alert('Acesso negado. Apenas usuários MESTRE podem realizar ajustes financeiros.');
      setEditingTransaction(null);
      return;
    }

    if (!editingTransaction) return;
    
    setSavingEdit(true);
    try {
      const { sourceTable, originalData, valor: oldValor, metodo: oldMetodo } = editingTransaction;
      let updates: any = {};
      let targetTable = sourceTable;

      // Montar objeto de atualização baseado na origem
      if (sourceTable === 'agendamentos') {
        await saveAppointmentFinancialAdjustment(editingTransaction, originalData);
        targetTable = 'financeiro_movimentos';
      } else if (sourceTable === 'pacotes') {
        updates = {
          valor_total: editForm.valor,
          forma_pagamento: editForm.metodo,
          valor_pagamento_2: editForm.valor2,
          forma_pagamento_2: editForm.metodo2,
          pago: true,
          data_pagamento: originalData.data_pagamento || selectedDate
        };
      } else if (sourceTable === 'despesas') {
        updates = {
          valor_total: editForm.valor
        };
      } else if (sourceTable === 'agendamentos_extra') {
        targetTable = 'agendamentos';
        updates = {
          valor_extra_total: editForm.valor,
          forma_pagamento_extra: editForm.metodo,
          status_pagamento_extra: 'PAGO',
          data_pagamento_extra: originalData.data_pagamento_extra || selectedDate
        };
      }

      // Executar Atualização
      if (sourceTable !== 'agendamentos') {
        const { error } = await supabaseClient
          .from(targetTable)
          .update(updates)
          .eq('id', originalData.id);

        if (error) throw error;
      }

      // Gerar Log de Auditoria Detalhado
      const oldValDetailed = `${oldValor.toFixed(2)} (${oldMetodo})`;
      const newValDetailed = `${editForm.valor.toFixed(2)} (${editForm.metodo})${editForm.valor2 > 0 ? ` + ${editForm.valor2.toFixed(2)} (${editForm.metodo2})` : ''}`;
      
      const logMsg = `Ajuste Financeiro MESTRE: ${editingTransaction.descricao}. ` +
                     `DE: R$ ${oldValDetailed} PARA: R$ ${newValDetailed}. ` +
                     `ID Origem: ${originalData.id} (${targetTable})`;

      await registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'Alteração de Pagamento',
        logMsg,
        userProfile?.nome,
        userProfile?.cargo
      );

      setEditingTransaction(null);
      fetchFinancialData();
      alert('Ajuste financeiro salvo com sucesso.');
    } catch (err: any) {
      console.error('Erro ao salvar ajuste:', err);
      alert('Falha ao salvar ajuste financeiro: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {fiscalDraftTransaction && (
        <FiscalDraftModal
          supabaseClient={supabaseClient}
          unit={unit}
          transaction={fiscalDraftTransaction}
          userProfile={userProfile}
          onClose={() => setFiscalDraftTransaction(null)}
          onCreated={() => {
            setFiscalDraftTransaction(null);
            fetchFinancialData();
          }}
        />
      )}
      
      {/* Modal de Ajuste Financeiro (Restrito ao Mestre) */}
      {editingTransaction && (
        <div className="app-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="app-modal-panel bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="app-modal-header bg-indigo-600 p-8 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <i className="fa-solid fa-shield-halved text-xl"></i>
                </div>
                <button onClick={() => setEditingTransaction(null)} className="text-white/60 hover:text-white transition-all text-2xl">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Ajuste de Lançamento</h3>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">Apenas nível Mestre</p>
            </div>

            <div className="app-modal-body p-10 space-y-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 opacity-60">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Registro Original</p>
                 <p className="text-xs font-bold text-slate-700">{editingTransaction.descricao}</p>
                 <p className="text-[10px] text-slate-500 font-medium">Natureza: {editingTransaction.natureza} • Tabela: {editingTransaction.sourceTable}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor principal</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                    <input 
                      type="number"
                      step="0.01"
                      value={editForm.valor}
                      onChange={(e) => setEditForm({...editForm, valor: parseFloat(e.target.value) || 0})}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</label>
                  <select 
                    value={editForm.metodo}
                    onChange={(e) => setEditForm({...editForm, metodo: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                  >
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="PIX">PIX</option>
                    <option value="DÉBITO">Débito</option>
                    <option value="CRÉDITO">Crédito</option>
                    <option value="LINK">Link</option>
                    <option value="CAIXA">Caixa (Saída)</option>
                  </select>
                </div>
              </div>

              {(editingTransaction.sourceTable === 'agendamentos' || editingTransaction.sourceTable === 'pacotes') && (
                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor 2 (Opcional)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={editForm.valor2}
                          onChange={(e) => setEditForm({...editForm, valor2: parseFloat(e.target.value) || 0})}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método 2</label>
                      <select 
                        value={editForm.metodo2}
                        onChange={(e) => setEditForm({...editForm, metodo2: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                      >
                         <option value="">Nenhum</option>
                         <option value="DINHEIRO">Dinheiro</option>
                         <option value="PIX">PIX</option>
                         <option value="DÉBITO">Débito</option>
                         <option value="CRÉDITO">Crédito</option>
                         <option value="LINK">Link</option>
                      </select>
                    </div>
                 </div>
              )}

              <button 
                onClick={handleSaveAdjustment}
                disabled={savingEdit}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center disabled:opacity-50"
              >
                {savingEdit ? (
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                ) : (
                  <>
                    <i className="fa-solid fa-check mr-2"></i> Confirmar Ajuste
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header Financeiro */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-5">
           <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm">
              <i className="fa-solid fa-vault"></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Caixa da Unidade</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Controle Financeiro iG {unit.name}</p>
           </div>
        </div>

        <div className={`w-full lg:w-auto grid ${canViewFiscal ? 'grid-cols-3' : 'grid-cols-2'} md:flex items-stretch md:items-center bg-slate-100 p-1.5 rounded-2xl gap-1 md:gap-0 overflow-hidden`}>
           <button 
             onClick={() => setViewMode('diaria')}
             className={`min-w-0 min-h-[3rem] md:min-h-0 px-1.5 sm:px-2 md:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs leading-tight font-black uppercase tracking-[0.08em] md:tracking-widest transition-all text-center flex items-center justify-center whitespace-normal ${viewMode === 'diaria' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
           >Visão Diária</button>
           <button 
             onClick={() => setViewMode('auditoria')}
             className={`min-w-0 min-h-[3rem] md:min-h-0 px-1.5 sm:px-2 md:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs leading-tight font-black uppercase tracking-[0.08em] md:tracking-widest transition-all text-center flex items-center justify-center whitespace-normal ${viewMode === 'auditoria' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
           >Auditoria</button>
           {canViewFiscal && (
             <button
               onClick={() => setViewMode('fiscal')}
               className={`min-w-0 min-h-[3rem] md:min-h-0 px-1.5 sm:px-2 md:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs leading-tight font-black uppercase tracking-[0.08em] md:tracking-widest transition-all text-center flex items-center justify-center whitespace-normal ${viewMode === 'fiscal' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
             >Notas Fiscais</button>
           )}
        </div>

        <div className="flex items-center space-x-3">
           <input 
             type="date" 
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 transition-all"
           />
        </div>
      </header>

      {/* KPI Cards (Topo) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
         <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita Bruta</p>
            <p className="text-3xl font-black text-slate-800 tracking-tighter">R$ {totals.bruto.toFixed(2)}</p>
            <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-500">
               <i className="fa-solid fa-circle-arrow-up mr-1.5"></i> Entradas Totais
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Banho Avulso</p>
            <p className="text-3xl font-black text-slate-800 tracking-tighter">R$ {totals.avulso.toFixed(2)}</p>
            <div className="mt-4 flex items-center text-[10px] font-bold text-slate-400">
               Serviços fora de pacote
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Venda Pacotes</p>
            <p className="text-3xl font-black text-slate-800 tracking-tighter">R$ {totals.pacotes.toFixed(2)}</p>
            <div className="mt-4 flex items-center text-[10px] font-bold text-indigo-500">
               Contratos Novos
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Transportes / Táxi</p>
            <p className="text-3xl font-black text-slate-800 tracking-tighter">R$ {totals.transporte.toFixed(2)}</p>
            <div className="mt-4 flex items-center text-[10px] font-bold text-slate-400">
               Receita Leva/Traz
            </div>
         </div>
         <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gastos do Dia</p>
            <p className="text-3xl font-black text-rose-500 tracking-tighter">R$ {totals.gastos.toFixed(2)}</p>
            <div className="mt-4 flex items-center text-[10px] font-bold text-rose-300">
               <i className="fa-solid fa-chart-line-down mr-1.5 rotate-180"></i> Saídas registradas
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         
         {/* Coluna Esquerda: Consolidado Dark/Orange */}
         <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#1E1E1E] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-8">Recebimentos Brutos</h4>
                  <div className="space-y-6">
                     <div className="flex justify-between items-center group">
                        <span className="flex items-center text-slate-400 font-bold text-sm">
                           <div className="w-2 h-2 rounded-full bg-emerald-400 mr-3"></div> PIX
                        </span>
                        <span className="text-xl font-black tracking-tight">R$ {totals.pix.toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center group">
                        <span className="flex items-center text-slate-400 font-bold text-sm">
                           <div className="w-2 h-2 rounded-full bg-amber-400 mr-3"></div> DINHEIRO
                        </span>
                        <span className="text-xl font-black tracking-tight">R$ {totals.dinheiro.toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center group">
                        <span className="flex items-center text-slate-400 font-bold text-sm">
                           <div className="w-2 h-2 rounded-full bg-indigo-400 mr-3"></div> CARTÃO (C/D)
                        </span>
                        <span className="text-xl font-black tracking-tight">R$ {totals.cartao.toFixed(2)}</span>
                     </div>
                  </div>

                  <div className="mt-12 pt-10 border-t border-white/5">
                     <p className="text-[10px] font-black text-[#F59E0B] uppercase tracking-widest mb-2">Saldo Líquido Real</p>
                     <button className="w-full py-5 bg-[#F59E0B] text-white rounded-[1.8rem] font-black text-xl tracking-tighter shadow-2xl shadow-amber-500/30 hover:scale-[1.02] transition-all flex items-center justify-center">
                        R$ {(totals.bruto - totals.gastos).toFixed(2)}
                     </button>
                     <p className="mt-4 text-[9px] text-center text-slate-500 font-bold uppercase tracking-widest">Disponível em Caixa (Entradas - Saídas)</p>
                  </div>
               </div>
               <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <i className="fa-solid fa-coins text-[10rem]"></i>
               </div>
            </div>
         </div>

         {/* Coluna Direita: Visão Diária ou Auditoria */}
         <div className="lg:col-span-8">
            {viewMode === 'diaria' ? (
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
                 <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Movimentação Detalhada - {formatDateBR(selectedDate)}</h4>
                    <span className="text-[10px] font-bold text-slate-300">Total de {transactions.length} registros</span>
                 </div>
                 
                 {loading ? (
                   <div className="py-32 flex flex-col items-center justify-center">
                      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-amber-500"></i>
                   </div>
                 ) : transactions.length > 0 ? (
                   <div className="divide-y divide-slate-50">
                      {transactions.map(t => (
                        <div key={t.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-all group">
                           <div className="flex items-center space-x-5">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg shrink-0 ${t.natureza === 'Saída' ? 'bg-rose-50 text-rose-500' : t.tipo.includes('Pacote') ? 'bg-indigo-50 text-indigo-500' : 'bg-amber-50 text-amber-500'}`}>
                                 <i className={`fa-solid ${t.natureza === 'Saída' ? 'fa-minus' : t.tipo.includes('Pacote') ? 'fa-box-archive' : 'fa-paw'}`}></i>
                              </div>
                              <div className="min-w-0">
                                 <p className="font-black text-slate-800 truncate">{t.descricao}</p>
                                 {t.subDescricao && (
                                   <p className="text-[11px] text-slate-400 font-bold -mt-0.5 mb-1 truncate">
                                      {t.subDescricao}
                                   </p>
                                 )}
                                 <div className="flex items-center space-x-3">
                                    <span className="text-[10px] font-black uppercase text-slate-300 tracking-wider">{t.hora}</span>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${t.natureza === 'Saída' ? 'text-rose-400' : 'text-[#F59E0B]'}`}>{t.metodo}</span>
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center justify-between sm:justify-end sm:text-right shrink-0 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                              <div className="sm:hidden">
                                 <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${t.natureza === 'Saída' ? 'bg-rose-500 text-white' : t.tipo.includes('Pacote') ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {t.tipo}
                                 </span>
                              </div>
                              <div>
                                 <p className={`text-lg font-black ${t.natureza === 'Saída' ? 'text-rose-500' : 'text-slate-800'}`}>
                                    {t.natureza === 'Saída' ? '-' : ''} R$ {t.valor.toFixed(2)}
                                 </p>
                                 <div className="flex items-center justify-end space-x-2">
                                    <span className={`hidden sm:inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${t.natureza === 'Saída' ? 'bg-rose-500 text-white' : t.tipo.includes('Pacote') ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                       {t.tipo}
                                    </span>
                                    {isMaster && (
                                       <button 
                                          onClick={() => {
                                             setEditingTransaction(t);
                                             const d = t.originalData;
                                             if (t.sourceTable === 'agendamentos') {
                                                setEditForm({
                                                   valor: d.valor_total || 0,
                                                   metodo: d.forma_pagamento || '',
                                                   metodo2: d.forma_pagamento_2 || '',
                                                   valor2: d.valor_pagamento_2 || 0
                                                });
                                             } else if (t.sourceTable === 'pacotes') {
                                                setEditForm({
                                                   valor: d.valor_total || 0,
                                                   metodo: d.forma_pagamento || '',
                                                   metodo2: d.forma_pagamento_2 || '',
                                                   valor2: d.valor_pagamento_2 || 0
                                                });
                                             } else if (t.sourceTable === 'despesas') {
                                                setEditForm({
                                                   valor: d.valor_total || 0,
                                                   metodo: 'Caixa',
                                                   metodo2: '',
                                                   valor2: 0
                                                });
                                             } else if (t.sourceTable === 'agendamentos_extra') {
                                                setEditForm({
                                                   valor: d.valor_extra_total || 0,
                                                   metodo: d.forma_pagamento_extra || '',
                                                   metodo2: '',
                                                   valor2: 0
                                                });
                                             }
                                          }}
                                          className="w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-indigo-600 rounded-lg flex items-center justify-center transition-all shadow-sm group-hover:scale-110"
                                          title="Ajustar Lançamento (Mestre)"
                                       >
                                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                                       </button>
                                    )}
                                    {canShowFiscalDraftAction(t) && (
                                       <button
                                          onClick={() => setFiscalDraftTransaction(t)}
                                          className="h-8 px-3 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm group-hover:scale-105 font-black text-[9px] uppercase tracking-widest"
                                          title="Criar rascunho fiscal"
                                       >
                                          <i className="fa-solid fa-file-invoice-dollar text-xs"></i>
                                          <span className="hidden xl:inline">Criar rascunho fiscal</span>
                                       </button>
                                    )}
                                 </div>
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>
                 ) : (
                   <div className="py-32 flex flex-col items-center justify-center text-center opacity-30">
                      <i className="fa-solid fa-receipt text-6xl mb-4"></i>
                      <p className="font-black text-slate-400 uppercase tracking-widest">Nenhuma movimentação hoje</p>
                   </div>
                 )}
              </div>
            ) : viewMode === 'fiscal' && canViewFiscal ? (
              <FiscalHistory supabaseClient={supabaseClient} unit={unit} />
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Conferência de Entradas</h4>
                       <div className="space-y-4">
                          <div className="flex justify-between text-sm font-bold text-slate-500"><span>Banhos Avulsos</span><span>R$ {totals.avulso.toFixed(2)}</span></div>
                          <div className="flex justify-between text-sm font-bold text-slate-500 border-b border-slate-50 pb-4"><span>Pacotes Vendidos</span><span>R$ {totals.pacotes.toFixed(2)}</span></div>
                          <div className="flex justify-between pt-2">
                             <span className="text-xs font-black text-slate-800 uppercase">Soma de Entradas</span>
                             <span className="text-xl font-black text-emerald-500">R$ {totals.bruto.toFixed(2)}</span>
                          </div>
                       </div>
                    </div>
                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Conferência de Saídas</h4>
                       <div className="space-y-4">
                          <div className="flex justify-between text-sm font-bold text-slate-500"><span>Gastos Operacionais</span><span>R$ {totals.gastos.toFixed(2)}</span></div>
                          <div className="flex justify-between text-sm font-bold text-slate-500 border-b border-slate-50 pb-4"><span>Outras Despesas</span><span>R$ 0,00</span></div>
                          <div className="flex justify-between pt-2">
                             <span className="text-xs font-black text-slate-800 uppercase">Soma de Saídas</span>
                             <span className="text-xl font-black text-rose-500">R$ {totals.gastos.toFixed(2)}</span>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="bg-[#1E1E1E] p-12 rounded-[3rem] text-center shadow-2xl border border-white/5">
                    <h3 className="text-2xl font-black text-white mb-2 tracking-tighter">Balanço de Auditoria</h3>
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-8">Conferência Final de Fechamento</p>
                    
                    <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-12">
                       <div className="text-center">
                          <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Entradas</p>
                          <p className="text-3xl font-black text-emerald-400">R$ {totals.bruto.toFixed(2)}</p>
                       </div>
                       <div className="text-slate-700 text-3xl font-black"> - </div>
                       <div className="text-center">
                          <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Saídas</p>
                          <p className="text-3xl font-black text-rose-400">R$ {totals.gastos.toFixed(2)}</p>
                       </div>
                       <div className="text-slate-700 text-3xl font-black"> = </div>
                       <div className="text-center">
                          <p className="text-[10px] font-black text-[#F59E0B] uppercase mb-1">Saldo Final</p>
                          <p className="text-5xl font-black text-white tracking-tighter">R$ {(totals.bruto - totals.gastos).toFixed(2)}</p>
                       </div>
                    </div>

                    <button 
                      onClick={() => {
                        alert("Balanço de Auditoria gerado e enviado para a rede!");
                        registrarAtividade(
                          unit.id,
                          userProfile?.email || 'sistema',
                          'Fechamento de Caixa',
                          `Realizou o fechamento de caixa do dia. Saldo Final: R$ ${(totals.bruto - totals.gastos).toFixed(2)}`,
                          userProfile?.nome,
                          userProfile?.cargo
                        );
                      }}
                      className="px-16 py-5 bg-emerald-500 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all active:scale-95"
                    >
                       Confirmar Balanço de Caixa
                    </button>
                    <p className="mt-6 text-[9px] text-slate-600 font-bold uppercase">Esta ação gera um registro permanente na auditoria de rede.</p>
                 </div>
              </div>
            )}
         </div>

      </div>

    </div>
  );
};

export default Financeiro;
