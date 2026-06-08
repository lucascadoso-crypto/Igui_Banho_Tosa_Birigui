import React, { useState, useEffect } from 'react';
import { Unit } from '../types';

interface FinanceiroGlobalProps {
  units: Unit[];
  supabaseClient: any;
}

const FinanceiroGlobal: React.FC<FinanceiroGlobalProps> = ({ units, supabaseClient }) => {
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false); 
  const getTodayBR = () => {
    const dataLocalBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [dia, mes, ano] = dataLocalBR.split('/');
    return `${ano}-${mes}-${dia}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const today = getTodayBR();
    const [y, m] = today.split('-');
    return `${y}-${m}-01`;
  }); 
  const [endDate, setEndDate] = useState(getTodayBR()); 
  
  const [globalKPIs, setGlobalKPIs] = useState({
    receitaBruta: 0,
    despesasTotais: 0,
    cartoes: 0,
    pixDinheiro: 0,
    lucroLiquido: 0
  });

  const [unitData, setUnitData] = useState<any[]>([]);

  useEffect(() => {
    if (hasError) return;
    fetchGlobalFinance();
  }, [units.length, startDate, endDate]); 

  const fetchGlobalFinance = async () => {
    if (!units.length || !supabaseClient) return;
    setLoading(true);
    
    try {
      let appts: any[] = [];
      let packs: any[] = [];
      let expenses: any[] = [];
      const dataInicioFull = `${startDate}T00:00:00Z`;
      const dataFimFull = `${endDate}T23:59:59Z`;

      // 1. Buscar Agendamentos (Traz tudo e filtra no JS para evitar erro 400 de coluna ausente)
      const { data: dAppts, error: errAppts } = await supabaseClient
        .from('agendamentos')
        .select('*')
        .gte('data_agendamento', startDate)
        .lte('data_agendamento', endDate);
      
      if (errAppts) {
        console.warn("Aviso (Agendamentos):", errAppts);
      } else {
        // Filtra os pagos e que não fazem parte de um pacote
        appts = (dAppts || []).filter(a => (a.pago === true || a.pago === 'true') && !a.pacote_id);
      }

      // 2. Buscar Pacotes
      // Usando comparação estrita de string YYYY-MM-DD para evitar deslocamento de fuso
      const { data: dPacks, error: errPacks } = await supabaseClient
        .from('pacotes')
        .select('*')
        .gte('data_pagamento', startDate)
        .lte('data_pagamento', endDate);

      if (errPacks) {
        console.warn("Aviso (Pacotes):", errPacks);
      } else {
        // Filtra apenas os pacotes pagos
        packs = (dPacks || []).filter(p => p.pago === true || p.pago === 'true');
      }

      // 3. Buscar Despesas (A prova de falhas: Tenta por data_despesa, se der erro, tenta por created_at)
      let { data: dExp, error: errExp } = await supabaseClient
        .from('despesas')
        .select('*')
        .gte('data_despesa', startDate)
        .lte('data_despesa', endDate);

      if (errExp) {
        console.warn("Tentando buscar despesas de forma alternativa...", errExp);
        const { data: dExpAlt } = await supabaseClient
          .from('despesas')
          .select('*')
          .gte('created_at', dataInicioFull)
          .lte('created_at', dataFimFull);
        expenses = dExpAlt || [];
      } else {
        expenses = dExp || [];
      }

      // 4. Agregação e Matemática
      let gReceita = 0;
      let gDespesa = 0;
      let gCartoes = 0;
      let gPixDinheiro = 0;

      const breakdown = units.map(unit => {
        const uAppts = appts.filter((a: any) => a.unidade_id === unit.id);
        const uPacks = packs.filter((p: any) => p.unidade_id === unit.id);
        const uExpenses = expenses.filter((e: any) => e.unidade_id === unit.id);

        const receita = uAppts.reduce((acc, curr) => acc + (parseFloat(curr.valor_total) || 0) + (parseFloat(curr.valor_pagamento_2) || 0), 0) + 
                        uPacks.reduce((acc, curr) => acc + (parseFloat(curr.valor_total) || 0) + (parseFloat(curr.valor_pagamento_2) || 0), 0);
        
        // Cobre tanto o nome 'valor_total' quanto 'valor' caso a tabela despesas seja diferente
        const despesa = uExpenses.reduce((acc, curr) => acc + (parseFloat(curr.valor_total || curr.valor) || 0), 0);

        gReceita += receita;
        gDespesa += despesa;

        [...uAppts, ...uPacks].forEach((item: any) => {
          const method = (item.forma_pagamento || '').toLowerCase();
          const v1 = (parseFloat(item.valor_total) || 0);
          
          if (method.includes('cartão') || method.includes('credito') || method.includes('debito') || method.includes('crédito') || method.includes('débito')) {
            gCartoes += v1;
          } else if (method.includes('pix') || method.includes('dinheiro')) {
            gPixDinheiro += v1;
          }

          // Adicionar Valor 2 se existir
          const method2 = (item.forma_pagamento_2 || '').toLowerCase();
          const v2 = (parseFloat(item.valor_pagamento_2) || 0);
          if (v2 > 0) {
            if (method2.includes('cartão') || method2.includes('credito') || method2.includes('debito') || method2.includes('crédito') || method2.includes('débito')) {
              gCartoes += v2;
            } else if (method2.includes('pix') || method2.includes('dinheiro')) {
              gPixDinheiro += v2;
            }
          }
        });

        return {
          id: unit.id,
          nome: unit.name.toUpperCase(),
          receita,
          despesa,
          resultado: receita - despesa
        };
      });

      setGlobalKPIs({
        receitaBruta: gReceita,
        despesasTotais: gDespesa,
        cartoes: gCartoes,
        pixDinheiro: gPixDinheiro,
        lucroLiquido: gReceita - gDespesa
      });

      setUnitData(breakdown);
      setHasError(false);

    } catch (err: any) {
      console.error("Erro Fatal no Javascript (Consolidação Global):", err);
      setHasError(true); 
    } finally {
      setLoading(false); 
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Cabeçalho */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-5">
           <div className="w-14 h-14 bg-slate-900 text-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
              <i className="fa-solid fa-wallet"></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Faturamento Global</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rede de Lojas • Balanço Consolidado</p>
           </div>
        </div>

        <div className="flex items-center space-x-4">
           <div className="flex flex-col">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Início</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500"
              />
           </div>
           <div className="flex flex-col">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Fim</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500"
              />
           </div>
        </div>
      </header>

      {hasError && (
        <div className="bg-rose-50 border border-rose-100 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><i className="fa-solid fa-cloud-bolt text-xl"></i></div>
              <div>
                 <p className="text-sm font-black text-rose-800 uppercase tracking-tight">Falha Parcial nos Dados</p>
                 <p className="text-xs font-bold text-rose-500">Algumas tabelas não retornaram dados, mas os cálculos disponíveis foram feitos.</p>
              </div>
           </div>
           <button onClick={() => { setHasError(false); fetchGlobalFinance(); }} className="bg-rose-500 hover:bg-rose-600 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all">Tentar Novamente</button>
        </div>
      )}

      {/* KPIs Globais */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita Bruta</p>
            <p className="text-2xl font-black text-emerald-600">R$ {globalKPIs.receitaBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <div className="mt-3 flex items-center text-[9px] font-bold text-emerald-500">
               <i className="fa-solid fa-arrow-trend-up mr-1"></i> Entradas Totais
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Despesas Totais</p>
            <p className="text-2xl font-black text-rose-500">R$ {globalKPIs.despesasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <div className="mt-3 flex items-center text-[9px] font-bold text-rose-400">
               <i className="fa-solid fa-arrow-trend-down mr-1"></i> Saídas Gastos
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cartões (C+D)</p>
            <p className="text-2xl font-black text-slate-800">R$ {globalKPIs.cartoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <div className="mt-3 text-[9px] font-bold text-slate-400">Taxas não deduzidas</div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Pix / Dinheiro</p>
            <p className="text-2xl font-black text-slate-800">R$ {globalKPIs.pixDinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <div className="mt-3 text-[9px] font-bold text-slate-400">Liquidez imediata</div>
         </div>
         <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl relative overflow-hidden group">
            <div className="relative z-10">
               <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Lucro Líquido Rede</p>
               <p className="text-2xl font-black text-white">R$ {globalKPIs.lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
               <div className="mt-3 text-[9px] font-black text-amber-500/50 uppercase">Resultado Final</div>
            </div>
            <i className="fa-solid fa-sack-dollar absolute -right-2 -bottom-2 text-5xl opacity-5 text-white group-hover:scale-110 transition-transform"></i>
         </div>
      </div>

      {/* Performance por Unidade */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
         {unitData.map(unit => (
            <div key={unit.id} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-all group">
               <div className="flex items-center space-x-3 mb-8">
                  <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center text-lg group-hover:bg-amber-50 group-hover:text-amber-500 transition-colors">
                     <i className="fa-solid fa-store"></i>
                  </div>
                  <h4 className="font-black text-slate-800 text-sm tracking-tight">IGUI {unit.nome}</h4>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Entradas</span>
                     <span className="font-black text-emerald-500">R$ {unit.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Saídas</span>
                     <span className="font-black text-rose-500">R$ {unit.despesa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <hr className="border-slate-50" />
                  <div className="flex justify-between items-end pt-2">
                     <span className="text-xs font-black text-slate-900 uppercase">Resultado</span>
                     <div className="text-right">
                        <p className={`text-2xl font-black ${unit.resultado >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                           R$ {unit.resultado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
         ))}
      </div>

      {loading && !hasError && (
        <div className="fixed bottom-10 right-10 bg-white p-5 rounded-2xl shadow-2xl border border-slate-100 flex items-center space-x-3 animate-bounce">
           <i className="fa-solid fa-circle-notch fa-spin text-amber-500"></i>
           <span className="text-xs font-black text-slate-500 uppercase">Calculando Rede...</span>
        </div>
      )}
    </div>
  );
};

export default FinanceiroGlobal;