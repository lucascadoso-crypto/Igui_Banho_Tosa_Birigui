
// Add missing React import
import React, { useState, useEffect } from 'react';
import { Unit, Appointment, Transaction } from '../types';
import { getBusinessInsights } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  unit: Unit;
  appointments: Appointment[];
  transactions: Transaction[];
}

const Dashboard: React.FC<DashboardProps> = ({ unit, appointments, transactions }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [errorType, setErrorType] = useState<'quota' | 'generic' | null>(null);

  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    setErrorType(null);
    setInsight(null);
    
    try {
      const res = await getBusinessInsights(unit, appointments, transactions);
      
      if (res === "LIMITE_ATINGIDO") {
        setErrorType('quota');
      } else if (res === "ERRO_GENERICO") {
        setErrorType('generic');
      } else {
        setInsight(res);
      }
    } catch (e) {
      setErrorType('generic');
    } finally {
      setLoadingInsight(false);
    }
  };

  // Data prep for calculations
  const totalIncome = (transactions || []).filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = (transactions || []).filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
  
  // New metrics for visual refactoring
  const banhosRealizados = appointments?.length || 0;
  const ticketMedio = banhosRealizados > 0 ? totalIncome / banhosRealizados : 0;
  const novosClientes = new Set(appointments?.map(a => a.petId)).size;

  const financeData = [
    { name: 'Receitas', value: totalIncome, color: '#10b981' },
    { name: 'Despesas', value: totalExpense, color: '#ef4444' }
  ];

  const hasFinanceData = totalIncome > 0 || totalExpense > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <header className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Painel de Gestão: {unit?.name || 'Geral'}</h2>
          <p className="text-slate-500 font-medium text-sm mt-1">
            <i className="fa-solid fa-location-dot mr-2 text-indigo-400"></i>
            {unit?.endereco_completo || 'Visão consolidada da rede'}
          </p>
        </div>
        <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 flex items-center space-x-2">
           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
           <span className="text-indigo-700 text-xs font-bold uppercase tracking-widest">Atualizado agora</span>
        </div>
      </header>

      {/* Seção de Totalizadores Unificada (Refatoração Visual) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x lg:divide-x divide-gray-100 p-2">
        
        {/* Item 1: Banhos Realizados */}
        <div className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl shrink-0">
            <i className="fa-solid fa-droplet"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Banhos Realizados</p>
            <p className="text-2xl font-black text-gray-800 leading-none">{banhosRealizados}</p>
          </div>
        </div>

        {/* Item 2: Faturamento Total */}
        <div className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xl shrink-0">
            <i className="fa-solid fa-dollar-sign"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Faturamento Total</p>
            <p className="text-2xl font-black text-gray-800 leading-none">R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Item 3: Ticket Médio */}
        <div className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-xl shrink-0">
            <i className="fa-solid fa-tags"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Ticket Médio</p>
            <p className="text-2xl font-black text-gray-800 leading-none">R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Item 4: Novos Clientes */}
        <div className="flex items-center gap-4 p-6">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-xl shrink-0">
            <i className="fa-solid fa-user-plus"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Novos Clientes</p>
            <p className="text-2xl font-black text-gray-800 leading-none">{novosClientes}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gemini Insight Card */}
        <div className="lg:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-800 text-white p-8 rounded-3xl shadow-xl shadow-indigo-200 relative overflow-hidden flex flex-col min-h-[350px]">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <i className="fa-solid fa-brain text-9xl"></i>
          </div>
          <h3 className="text-xl font-black mb-6 flex items-center">
            <i className="fa-solid fa-sparkles mr-3 text-indigo-300"></i> Insights do Consultor IA
          </h3>
          
          <div className="flex-1">
            {loadingInsight ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <i className="fa-solid fa-circle-notch fa-spin text-4xl text-indigo-200"></i>
                <p className="text-sm font-bold animate-pulse">Analisando dados do banco...</p>
              </div>
            ) : insight ? (
              <div className="text-sm leading-relaxed space-y-3 whitespace-pre-line font-medium text-indigo-50 animate-in fade-in duration-500">
                {insight}
              </div>
            ) : errorType === 'quota' ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
                  <i className="fa-solid fa-hourglass-half text-3xl text-amber-300"></i>
                </div>
                <p className="text-sm font-bold text-amber-100">Limite de consultas atingido.</p>
                <p className="text-xs text-indigo-200">A cota gratuita do Gemini expirou. Aguarde alguns minutos e tente novamente.</p>
                <button 
                  onClick={handleGenerateInsight}
                  className="mt-4 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                >
                  Tentar novamente
                </button>
              </div>
            ) : errorType === 'generic' ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <i className="fa-solid fa-triangle-exclamation text-3xl text-rose-300"></i>
                <p className="text-sm font-bold text-rose-100">Erro na conexão com a IA.</p>
                <button 
                  onClick={handleGenerateInsight}
                  className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-black transition-all"
                >
                  Recarregar
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-bolt-lightning text-3xl text-indigo-300 animate-pulse"></i>
                </div>
                <div>
                  <p className="text-sm font-bold mb-2">Pronto para analisar?</p>
                  <p className="text-xs text-indigo-200">Clique no botão abaixo para gerar recomendações baseadas no desempenho da unidade.</p>
                </div>
                <button 
                  onClick={handleGenerateInsight}
                  className="w-full py-4 bg-white text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-black/20 hover:scale-[1.02] transition-all flex items-center justify-center"
                >
                  <i className="fa-solid fa-wand-magic-sparkles mr-3"></i> Gerar Insights IA
                </button>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-indigo-300">
             <span>Gemini 3 Flash</span>
             <i className="fa-solid fa-robot"></i>
          </div>
        </div>

        {/* Financial Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100 min-h-[400px]">
          <h3 className="text-lg font-black text-slate-800 mb-8 flex items-center justify-between">
            <span>Saúde Financeira da Loja</span>
            <div className="flex space-x-2">
               <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase"><div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div> Entradas</div>
               <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase"><div className="w-2 h-2 bg-rose-500 rounded-full mr-2"></div> Saídas</div>
            </div>
          </h3>
          
          <div className="h-[280px] w-full relative">
            {hasFinanceData ? (
              <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                <BarChart data={financeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]} barSize={60}>
                    {financeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                <i className="fa-solid fa-chart-simple text-6xl mb-4 opacity-20"></i>
                <p className="font-bold text-sm">Sem dados financeiros para exibir.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Appointment Distribution */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-black text-slate-800 mb-8">Status Atual dos Agendamentos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
           {[
             { name: 'Concluído', value: (appointments || []).filter(a => a.status === 'Completed').length },
             { name: 'Agendado', value: (appointments || []).filter(a => a.status === 'Scheduled').length },
             { name: 'Cancelado', value: (appointments || []).filter(a => a.status === 'Cancelled').length }
           ].map(stat => (
             <div key={stat.name} className="bg-slate-50 p-6 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-slate-100 cursor-default">
                <div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{stat.name}</p>
                  <p className="text-3xl font-black text-slate-800">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm ${
                  stat.name === 'Concluído' ? 'bg-emerald-100 text-emerald-600' : 
                  stat.name === 'Agendado' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'
                }`}>
                   <i className={`fa-solid ${
                     stat.name === 'Concluído' ? 'fa-check-double' : 
                     stat.name === 'Agendado' ? 'fa-calendar-day' : 'fa-calendar-xmark'
                   }`}></i>
                </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
