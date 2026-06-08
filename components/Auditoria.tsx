
import React, { useState, useEffect } from 'react';
import { Unit } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { formatarErroWhatsApp } from '../lib/errorParser';

interface AuditoriaProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: any;
}

const Auditoria: React.FC<AuditoriaProps> = ({ unit, supabaseClient, userProfile }) => {
  const isMaster = userProfile?.cargo === 'master';
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'sistema'>('whatsapp');
  const [logs, setLogs] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  
  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchLogs();
    } else {
      fetchSystemLogs();
    }
  }, [unit.id, activeTab]);

  useEffect(() => {
    const handleRefresh = () => {
      if (activeTab === 'whatsapp') {
        fetchLogs();
      } else {
        fetchSystemLogs();
      }
    };
    window.addEventListener('refreshAuditoria', handleRefresh);
    return () => window.removeEventListener('refreshAuditoria', handleRefresh);
  }, [activeTab, unit.id]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabaseClient
        .from('whatsapp_mensagens')
        .select(`
          id, 
          criado_em, 
          nome_cliente, 
          nome_pet, 
          telefone, 
          tipo_agendamento, 
          status, 
          mensagem, 
          detalhe_erro,
          unidade_id
        `)
        .eq('unidade_id', unit.id)
        .order('criado_em', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar logs de auditoria WhatsApp:', err);
      alert('Erro ao carregar logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemLogs = async () => {
    setLoading(true);
    try {
      let query = supabaseClient
        .from('auditoria_logs')
        .select('id, criado_em, usuario_nome, usuario_email, acao, descricao, unidade_id')
        .eq('unidade_id', unit.id)
        .order('criado_em', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setSystemLogs(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar logs do sistema:', err);
      alert('Erro ao carregar logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderWhatsAppLogs = () => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data/Hora</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cliente / Pet</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tipo</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Telefone</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center space-y-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando rastro...</span>
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center space-y-3 opacity-30">
                    <i className="fa-solid fa-ghost text-4xl"></i>
                    <span className="text-xs font-bold uppercase tracking-widest">Nenhum log encontrado</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-700">
                        {log.criado_em ? new Date(log.criado_em).toLocaleDateString('pt-BR') : '-'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {log.criado_em ? new Date(log.criado_em).toLocaleTimeString('pt-BR') : '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700">{log.nome_cliente || 'N/A'}</span>
                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tight">{log.nome_pet || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-tighter">
                      {log.tipo_agendamento || '-'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs font-bold text-slate-600">{log.telefone}</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center">
                      <span 
                        title={log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error' ? log.detalhe_erro : undefined}
                        onClick={() => {
                          if ((log.status?.toUpperCase() === 'ERRO' || log.status?.toLowerCase() === 'error') && log.detalhe_erro) {
                            setSelectedError(log.detalhe_erro);
                          }
                        }}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-black text-center min-w-[120px] transition-all cursor-pointer active:scale-95 ${
                          (log.status?.toUpperCase() === 'SUCESSO' || log.status?.toLowerCase() === 'success')
                            ? 'bg-emerald-100 text-emerald-700 uppercase tracking-widest'
                            : 'bg-rose-100 text-rose-700 uppercase tracking-widest'
                        }`}
                      >
                        {(log.status?.toUpperCase() === 'SUCESSO' || log.status?.toLowerCase() === 'success') ? 'Enviado' : 'Falha no Envio'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSystemLogs = () => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data/Hora</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Usuário</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ação</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Descrição Detalhada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center space-y-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando rastro...</span>
                  </div>
                </td>
              </tr>
            ) : systemLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center space-y-3 opacity-30">
                    <i className="fa-solid fa-ghost text-4xl"></i>
                    <span className="text-xs font-bold uppercase tracking-widest">Nenhuma atividade registrada na auditoria</span>
                  </div>
                  {!isMaster && <p className="text-[10px] text-rose-500 mt-2">Acesso restrito a administradores master.</p>}
                </td>
              </tr>
            ) : (
              systemLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-700">
                        {log.criado_em ? new Date(log.criado_em).toLocaleDateString('pt-BR') : '-'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {log.criado_em ? new Date(log.criado_em).toLocaleTimeString('pt-BR') : '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs font-bold text-slate-700">
                      {log.usuario_nome || log.usuario_email || 'N/A'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-2 py-1 bg-slate-900 text-white rounded text-[9px] font-black uppercase tracking-tighter whitespace-nowrap">
                      {log.acao || '-'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-xs text-slate-600 font-medium max-w-lg leading-relaxed">{log.descricao}</p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
            {activeTab === 'whatsapp' ? 'Auditoria de Mensagens' : 'Auditoria do Sistema'}
          </h2>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
            Histórico da unidade: {unit.nome}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex items-center">
             <button 
               onClick={() => setActiveTab('whatsapp')}
               className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'whatsapp' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
             >
               WhatsApp
             </button>
             {isMaster && (
               <button 
                 onClick={() => setActiveTab('sistema')}
                 className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sistema' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 Sistema
               </button>
             )}
          </div>
          <button 
            onClick={activeTab === 'whatsapp' ? fetchLogs : fetchSystemLogs}
            className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            title="Atualizar Logs"
          >
            <i className="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
           key={activeTab}
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -10 }}
           transition={{ duration: 0.2 }}
        >
          {activeTab === 'whatsapp' ? renderWhatsAppLogs() : renderSystemLogs()}
        </motion.div>
      </AnimatePresence>

      {/* Modal de Detalhe do Erro */}
      <AnimatePresence>
        {selectedError && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedError(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-rose-500 p-6 text-white flex items-center space-x-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <i className="fa-solid fa-circle-exclamation text-2xl"></i>
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Falha no WhatsApp</h3>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Detalhes técnicos do erro</p>
                </div>
              </div>
              <div className="p-8">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-6">
                  <p className="text-slate-700 font-bold text-sm leading-relaxed">
                    {formatarErroWhatsApp(selectedError)}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedError(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auditoria;
