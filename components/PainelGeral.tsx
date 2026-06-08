
import React, { useState, useEffect } from 'react';
import { Unit } from '../types';

interface PainelGeralProps {
  units: Unit[];
  supabaseClient: any;
}

const PainelGeral: React.FC<PainelGeralProps> = ({ units, supabaseClient }) => {
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false); // Freio de segurança
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]); // Primeiro do mês
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]); // Hoje
  const [stats, setStats] = useState<any[]>([]);
  const [totalRede, setTotalRede] = useState(0);

  useEffect(() => {
    // Se houve erro crítico, não tenta carregar novamente para evitar loop
    if (hasError) return;
    
    fetchGlobalStats();
  }, [units.length, startDate, endDate]); // Usando units.length (primitivo)

  const fetchGlobalStats = async () => {
    if (!units.length || !supabaseClient) return;
    setLoading(true);
    try {
      // Buscar agendamentos do período (exceto cancelados)
      const { data, error } = await supabaseClient
        .from('agendamentos')
        .select('id, unidade_id, pacote_id, status')
        .gte('data_agendamento', startDate)
        .lte('data_agendamento', endDate)
        .neq('status', 'Cancelado');

      if (error) {
        console.error("Erro Supabase (Painel Geral):", error);
        throw error;
      }

      // Processar estatísticas por unidade
      const unitStats = units.map(unit => {
        const unitAppts = data?.filter((a: any) => a.unidade_id === unit.id) || [];
        const avulsos = unitAppts.filter((a: any) => a.pacote_id === null).length;
        const pacotes = unitAppts.filter((a: any) => a.pacote_id !== null).length;
        const total = unitAppts.length;

        return {
          id: unit.id,
          nome: unit.name.toUpperCase(),
          total,
          avulsos,
          pacotes,
          proporcao: total > 0 ? (pacotes / total) * 100 : 0
        };
      });

      setStats(unitStats);
      setTotalRede(data?.length || 0);
      setHasError(false); // Reset de erro em caso de sucesso
    } catch (err) {
      console.error("Erro detalhado do Supabase (Painel Geral):", err);
      setHasError(true); // Ativa o freio
    } finally {
      setLoading(false); // Garante o destravamento da tela
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Cabeçalho Operacional */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-4">
           <div className="w-14 h-14 bg-slate-900 text-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
              <i className="fa-solid fa-chart-line"></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Painel Operacional</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Volume de atendimentos por unidade</p>
           </div>
        </div>

        <div className="flex items-center space-x-4">
           <div className="flex flex-col">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Início</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
           </div>
           <div className="flex flex-col">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Fim</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
           </div>
        </div>
      </header>

      {hasError && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center justify-between">
           <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg"><i className="fa-solid fa-exclamation-triangle"></i></div>
              <div>
                 <p className="text-sm font-black text-rose-800 uppercase">Erro de Sincronização</p>
                 <p className="text-xs font-bold text-rose-500">O sistema encontrou um problema ao buscar os dados da rede.</p>
              </div>
           </div>
           <button onClick={() => { setHasError(false); fetchGlobalStats(); }} className="bg-rose-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-md">Tentar Reconectar</button>
        </div>
      )}

      {/* KPI Central - Total Rede */}
      <div className="flex justify-center">
         <div className="bg-slate-900 w-full max-w-2xl p-10 rounded-[3rem] shadow-2xl text-center relative overflow-hidden group">
            <div className="relative z-10">
               <h3 className="text-amber-500 text-sm font-black uppercase tracking-[0.3em] mb-4">Total da Rede no Período</h3>
               <p className="text-8xl font-black text-white tracking-tighter transition-transform group-hover:scale-105 duration-500">
                  {loading ? <i className="fa-solid fa-circle-notch fa-spin text-5xl"></i> : totalRede}
               </p>
            </div>
            <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
               <i className="fa-solid fa-paw text-[15rem]"></i>
            </div>
         </div>
      </div>

      {/* Grid de Unidades */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
         {stats.map(unit => (
            <div key={unit.id} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 hover:shadow-xl hover:border-amber-100 transition-all group">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center space-x-3">
                     <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center text-lg group-hover:bg-amber-50 group-hover:text-amber-500 transition-colors">
                        <i className="fa-solid fa-store"></i>
                     </div>
                     <h4 className="font-black text-slate-800 text-sm tracking-tight">IGUI {unit.nome}</h4>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               </div>

               <div className="text-center mb-10">
                  <p className="text-6xl font-black text-slate-900 tracking-tighter">{unit.total}</p>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">Atendimentos Totais</p>
               </div>

               <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50 flex items-center space-x-3">
                     <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm">
                        <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                     </div>
                     <div>
                        <p className="text-xs font-black text-slate-800">{unit.avulsos}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Avulsos</p>
                     </div>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100/50 flex items-center space-x-3">
                     <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-500 shadow-sm">
                        <i className="fa-solid fa-box-archive text-xs"></i>
                     </div>
                     <div>
                        <p className="text-xs font-black text-amber-600">{unit.pacotes}</p>
                        <p className="text-[8px] font-bold text-amber-400 uppercase">Pacotes</p>
                     </div>
                  </div>
               </div>

               {/* Barra de Proporção */}
               <div className="space-y-2">
                  <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                     <span className="text-slate-300">Mix de Vendas</span>
                     <span className="text-amber-500">{unit.proporcao.toFixed(0)}% Fidelidade</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                     <div 
                        className="h-full bg-slate-300 transition-all duration-1000" 
                        style={{ width: `${100 - unit.proporcao}%` }}
                     ></div>
                     <div 
                        className="h-full bg-amber-500 transition-all duration-1000" 
                        style={{ width: `${unit.proporcao}%` }}
                     ></div>
                  </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  );
};

export default PainelGeral;
