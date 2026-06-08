
import React, { useState, useEffect } from 'react';
import { Unit } from '../types';
import GastosModal from './GastosModal';
import { registrarAtividade } from '../services/logger';

interface GastosProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: any;
}

const Gastos: React.FC<GastosProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayBR());
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ visivel: boolean, id: string | null }>({ visivel: false, id: null });

  useEffect(() => {
    fetchExpenses();
  }, [unit.id, selectedDate]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('despesas')
        .select('*')
        .eq('unidade_id', unit.id)
        .eq('data_despesa', selectedDate)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (err) {
      console.error("Erro ao buscar despesas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmacao.id) return;
    try {
      const { error } = await supabaseClient.from('despesas').delete().eq('id', confirmacao.id);
      if (error) throw error;

      // Log de Auditoria
      registrarAtividade(
        unit.id,
        userProfile?.email || 'sistema',
        'EXCLUIR_GASTO',
        `Excluiu um lançamento de gasto (ID: ${confirmacao.id})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      setConfirmacao({ visivel: false, id: null });
      fetchExpenses();
    } catch (err) {
      alert("Erro ao excluir lançamento.");
    }
  };

  const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.valor_total), 0);
  const totalItems = expenses.reduce((acc, curr) => acc + Number(curr.quantidade), 0);
  const avgPerItem = totalItems > 0 ? totalSpent / totalItems : 0;

  const formatDateBR = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.substring(2)}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* OVERLAY DE CONFIRMAÇÃO UI PARA EXCLUSÃO */}
      {confirmacao.visivel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 border border-slate-100 animate-in zoom-in duration-300">
             <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-rose-50 text-rose-500">
                   <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h3 className="text-xl font-black text-slate-800">Tem certeza?</h3>
                <p className="text-sm font-bold text-slate-500 leading-relaxed">Você deseja realmente excluir este lançamento financeiro? Esta ação é irreversível.</p>
                
                <div className="flex w-full gap-3 pt-4">
                   <button 
                     onClick={() => setConfirmacao({ visivel: false, id: null })}
                     className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                   >Voltar</button>
                   <button 
                     onClick={handleDelete}
                     className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                   >Confirmar</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Header Gastos */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-5">
           <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">
              <i className="fa-solid fa-cart-shopping"></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Gastos</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Insumos e Manutenção iG {unit.name}</p>
           </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <input 
             type="date" 
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900 transition-all text-xs"
          />
          {!isReadOnly && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-[#1E1E1E] hover:bg-black text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center"
            >
              <i className="fa-solid fa-plus mr-3"></i> Lançar Despesa
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
         
         {/* Tabela de Histórico (Esquerda) */}
         <div className="lg:col-span-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
            <div className="p-8 border-b border-slate-50">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Histórico de Compras</h4>
            </div>
            
            {loading && expenses.length === 0 ? (
              <div className="py-32 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-4xl text-slate-900"></i></div>
            ) : expenses.length > 0 ? (
              <div className="space-y-4">
                {/* Cabeçalho Oculto no Mobile */}
                <div className="hidden md:grid md:grid-cols-5 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest px-8 py-4 rounded-t-2xl">
                  <div>Data</div>
                  <div className="col-span-2">Item</div>
                  <div>Qtd / Valor</div>
                  <div className="text-right">Ação</div>
                </div>

                <div className="divide-y divide-slate-50 md:divide-y-0 space-y-4">
                  {expenses.map(exp => (
                    <div key={exp.id} className="bg-white md:bg-transparent p-6 md:p-0 rounded-3xl md:rounded-none border border-slate-100 md:border-none shadow-sm md:shadow-none hover:bg-slate-50/50 transition-colors group md:grid md:grid-cols-5 md:items-center md:px-8 md:py-5">
                      <div className="text-xs font-bold text-slate-400 mb-2 md:mb-0">{formatDateBR(exp.data_despesa)}</div>
                      <div className="md:col-span-2 mb-3 md:mb-0">
                        <p className="font-black text-slate-700">{exp.nome_item}</p>
                        {exp.descricao && <p className="text-[10px] text-slate-400 font-medium">{exp.descricao}</p>}
                      </div>
                      <div className="flex items-center justify-between md:block mb-4 md:mb-0">
                        <span className="text-sm font-bold text-slate-500 md:block">{exp.quantidade}x</span>
                        <span className="text-sm font-black text-slate-800 md:block">R$ {Number(exp.valor_total).toFixed(2)}</span>
                      </div>
                      <div className="text-right border-t md:border-t-0 border-slate-50 pt-3 md:pt-0">
                        {!isReadOnly && (
                          <button 
                            onClick={() => setConfirmacao({ visivel: true, id: exp.id })}
                            className="w-10 h-10 md:w-8 md:h-8 rounded-xl md:rounded-lg bg-rose-50 md:bg-transparent text-rose-500 md:text-slate-300 hover:text-rose-500 hover:bg-rose-100 md:hover:bg-rose-50 transition-all flex items-center justify-center ml-auto"
                          >
                            <i className="fa-solid fa-trash-can text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-40 text-center opacity-20">
                 <i className="fa-solid fa-box-open text-6xl mb-4"></i>
                 <p className="font-black uppercase tracking-widest">Sem despesas lançadas</p>
              </div>
            )}
         </div>

         {/* Sidebar de Resumo (Direita) */}
         <div className="lg:col-span-4 space-y-6 sticky top-24">
            <div className="bg-[#1E1E1E] rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                  <h4 className="text-[10px] font-black text-[#F59E0B] uppercase tracking-[0.2em] mb-4">Total Despendido</h4>
                  <p className="text-5xl font-black tracking-tighter mb-8">R$ {totalSpent.toFixed(2)}</p>
                  
                  <div className="space-y-4 pt-8 border-t border-white/5">
                     <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <span>Itens comprados</span>
                        <span className="text-white">{totalItems} unidades</span>
                     </div>
                     <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <span>Média por item</span>
                        <span className="text-white">R$ {avgPerItem.toFixed(2)}</span>
                     </div>
                  </div>
               </div>
               <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <i className="fa-solid fa-receipt text-[10rem]"></i>
               </div>
            </div>

            <div className="bg-[#FDF6E3] p-8 rounded-[2rem] border border-[#F1E0B0] space-y-4">
               <div className="flex items-center space-x-3 text-[#B45309]">
                  <i className="fa-solid fa-lightbulb"></i>
                  <span className="text-xs font-black uppercase tracking-widest">Dica de Gestão</span>
               </div>
               <p className="text-sm font-bold text-[#92400E] leading-relaxed">
                  O controle rigoroso de insumos (shampoos, perfumes e toalhas) pode aumentar sua margem de lucro em até 15%. Verifique sempre o rendimento dos produtos galão!
               </p>
            </div>
         </div>

      </div>

      {isModalOpen && (
        <GastosModal 
          unitId={unit.id}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          initialDate={selectedDate}
          onClose={() => setIsModalOpen(false)}
          onRefresh={fetchExpenses}
        />
      )}

    </div>
  );
};

export default Gastos;
