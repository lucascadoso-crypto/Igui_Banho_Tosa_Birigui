
import React, { useState, useEffect } from 'react';
import { Unit, NavigationState, SubView, GlobalView, UserRole } from '../types';

interface SidebarProps {
  units: Unit[];
  currentNav: NavigationState;
  onNavigate: (nav: NavigationState) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  supabaseClient: any;
  userProfile?: any;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ units, currentNav, onNavigate, userRole, setUserRole, supabaseClient, userProfile, isOpen, onClose }) => {
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState({ nome: 'IGUI BANHO E TOSA', logo_url: '' });
  const [listaUnidades, setListaUnidades] = useState<Unit[]>([]);

  const isMaster = userRole === 'master' || userRole === 'financeiro';

  const fetchSidebarData = async () => {
    if (!supabaseClient) return;
    try {
      const { data: configData, error: configError } = await supabaseClient
        .from('config_sistema')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (!configError && configData) {
        setEmpresa({
          nome: (configData.nome_fantasia || 'IGUI BANHO E TOSA').toUpperCase(),
          logo_url: configData.logo_url || ''
        });
      }

      const { data: unitData, error: unitError } = await supabaseClient
        .from('unidades')
        .select('id, nome, endereco_completo, telefone, whatsapp_nome_instancia, whatsapp_token, whatsapp_url_servidor, whatsapp_ativo');
      
      if (!unitError && unitData) {
        let finalUnits = unitData.map(u => ({
          id: u.id,
          name: u.nome,
          endereco_completo: u.endereco_completo,
          phone: u.telefone,
          whatsapp_nome_instancia: u.whatsapp_nome_instancia,
          whatsapp_token: u.whatsapp_token,
          whatsapp_url_servidor: u.whatsapp_url_servidor,
          whatsapp_ativo: u.whatsapp_ativo
        }));

        // --- TRAVA DE UNIDADE (RBAC) ---
        // Se não for master ou financeiro, filtra para ver apenas a sua unidade
        if (userRole !== 'master' && userRole !== 'financeiro' && userProfile?.unidade_id) {
          finalUnits = finalUnits.filter(u => u.id === userProfile.unidade_id);
        }

        setListaUnidades(finalUnits);
      }
    } catch (err) {
      console.error("Erro ao sincronizar dados na Sidebar:", err);
    }
  };

  useEffect(() => {
    fetchSidebarData();
    const handleUpdate = () => fetchSidebarData();
    window.addEventListener('dadosGlobaisAtualizados', handleUpdate);
    return () => window.removeEventListener('dadosGlobaisAtualizados', handleUpdate);
  }, [supabaseClient, userRole, userProfile]);

  const getOrderedUnits = () => {
    const ordemPreferencial = ['Primavera', 'Birigui', 'Concórdia'];
    const getScore = (nome: string) => {
      const index = ordemPreferencial.findIndex(key => nome.includes(key));
      return index === -1 ? 999 : index;
    };

    return [...listaUnidades].sort((a, b) => {
      const scoreA = getScore(a.name);
      const scoreB = getScore(b.name);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.name.localeCompare(b.name);
    });
  };

  const globalMenus: { id: GlobalView; label: string; icon: string; roles: UserRole[] }[] = [
    { id: 'Painel Geral', label: 'Painel Geral', icon: 'fa-chart-pie', roles: ['master', 'financeiro'] },
    { id: 'Financeiro Geral', label: 'Financeiro Geral', icon: 'fa-sack-dollar', roles: ['master', 'financeiro'] },
    { id: 'Configurações', label: 'Configurações', icon: 'fa-gear', roles: ['master', 'financeiro'] },
    { id: 'Equipe', label: 'Equipe', icon: 'fa-users', roles: ['master', 'financeiro'] },
  ];

  const unitSubMenus: { label: SubView; roles: UserRole[] }[] = [
    { label: 'Agendamento', roles: ['master', 'financeiro', 'administrador', 'gerente', 'comum'] },
    { label: 'Clientes', roles: ['master', 'financeiro', 'administrador', 'gerente', 'comum'] },
    { label: 'Pacotes', roles: ['master', 'financeiro', 'administrador', 'gerente', 'comum'] },
    { label: 'Financeiro', roles: ['master', 'financeiro', 'administrador', 'gerente', 'comum'] },
    { label: 'Gastos', roles: ['master', 'financeiro', 'administrador', 'gerente', 'comum'] },
    { label: 'Auditoria', roles: ['master', 'financeiro'] }
  ];

  const filteredGlobalMenus = globalMenus.filter(menu => menu.roles.includes(userRole));
  const filteredUnitSubMenus = unitSubMenus.filter(sub => sub.roles.includes(userRole));

  const toggleUnit = (unitId: string) => {
    // Só permite expandir/trocar se for Master
    if (!isMaster) return;
    setExpandedUnit(expandedUnit === unitId ? null : unitId);
  };

  const getRoleBadgeLabel = (role: UserRole) => {
    switch(role) {
      case 'master': return 'USUÁRIO MASTER';
      case 'administrador': return 'ADMIN UNIDADE';
      case 'gerente': return 'GERENTE OPERAC.';
      default: return 'COLABORADOR';
    }
  };

  const handleLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      await supabaseClient.auth.signOut();
    } catch (error) {
      // Ignora erros de sessão
    }
    window.location.href = '/';
  };

  return (
    <>
      {/* Overlay para Mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      <div className={`w-72 bg-slate-900 h-screen text-white flex flex-col fixed left-0 top-0 z-40 shadow-2xl border-r border-slate-800 transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="pt-6 pb-4 px-6 flex flex-col items-center border-b border-slate-800/50 shrink-0 relative">
          {/* Botão fechar no mobile */}
          <button 
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-500 hover:text-white md:hidden"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>

          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center shadow-2xl border border-slate-700/50 overflow-hidden group transition-transform hover:scale-105">
          {empresa.logo_url ? (
            <img src={empresa.logo_url} className="w-full h-full object-cover" alt="Logo" />
          ) : (
            <i className="fa-solid fa-paw text-yellow-400 text-3xl"></i>
          )}
        </div>
        
        <h1 className="mt-4 text-lg font-black text-white uppercase tracking-tighter text-center leading-none">
          {empresa.nome}
        </h1>
        
        <div className="mt-2 bg-slate-800/80 px-4 py-1 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] border border-slate-700/50">
          {getRoleBadgeLabel(userRole)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll py-6 px-4 space-y-8">
        
        {filteredGlobalMenus.length > 0 && (
          <nav className="space-y-1">
            <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 opacity-50">Menu Global</p>
            {filteredGlobalMenus.map((menu) => {
              const isActive = currentNav.mode === 'global' && currentNav.view === menu.id;
              
              return (
                <button
                  key={menu.id}
                  onClick={() => {
                    onNavigate({ mode: 'global', view: menu.id as any });
                    if (onClose) onClose();
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <i className={`fa-solid ${menu.icon} text-lg ${isActive ? 'text-white' : 'group-hover:text-indigo-400'}`}></i>
                  <span className="font-bold text-sm">{menu.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="space-y-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 opacity-50">Nossas Unidades</p>
          
          {getOrderedUnits().length > 0 ? getOrderedUnits().map((unit) => (
            <div key={unit.id} className="space-y-1">
              <button
                onClick={() => toggleUnit(unit.id)}
                disabled={!isMaster}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                  expandedUnit === unit.id || currentNav.unitId === unit.id || !isMaster
                    ? 'bg-slate-800/50 text-white'
                    : 'text-slate-400 hover:bg-slate-800/30'
                } ${!isMaster ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <i className={`fa-solid fa-store text-sm shrink-0 ${currentNav.unitId === unit.id ? 'text-yellow-400' : ''}`}></i>
                  <span className="font-bold text-sm truncate">{unit.name.replace(/^iG\s+/i, '')}</span>
                </div>
                {isMaster && (
                  <i className={`fa-solid fa-chevron-down text-[9px] transition-transform duration-300 shrink-0 ${expandedUnit === unit.id ? 'rotate-180' : ''}`}></i>
                )}
              </button>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedUnit === unit.id || !isMaster ? 'max-h-80 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                <div className="pl-9 space-y-1 border-l border-slate-800 ml-6">
                  {filteredUnitSubMenus.map((sub) => (
                    <button
                      key={sub.label}
                      onClick={() => {
                        onNavigate({ mode: 'unit', view: sub.label, unitId: unit.id, unitName: unit.name });
                        if (onClose) onClose();
                      }}
                      className={`w-full text-left px-4 py-2 text-xs rounded-lg transition-colors font-bold ${
                        currentNav.unitId === unit.id && currentNav.view === sub.label
                          ? 'text-indigo-400 bg-indigo-500/10'
                          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )) : (
            <div className="px-4 py-3 text-xs text-slate-600 italic">Carregando lojas...</div>
          )}
        </div>
      </div>

      <div className="mt-auto p-4 bg-slate-900 border-t border-slate-800/50 space-y-2 shrink-0">
        <button
          onClick={() => {
            onNavigate({ mode: 'global', view: 'Meu Perfil' });
            if (onClose) onClose();
          }}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl transition-all duration-300 group ${
            currentNav.view === 'Meu Perfil'
              ? 'bg-orange-500 text-white shadow-xl shadow-orange-500/20 scale-[1.02]'
              : 'bg-orange-600/10 text-orange-500 hover:bg-orange-500 hover:text-white border border-orange-500/20'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            currentNav.view === 'Meu Perfil' ? 'bg-white/20' : 'bg-orange-500 text-white'
          }`}>
            <i className="fa-solid fa-user text-sm"></i>
          </div>
          <div className="text-left">
            <p className="text-xs font-black uppercase tracking-widest leading-none">Meu Perfil</p>
            <p className={`text-[9px] font-bold mt-1 uppercase ${
              currentNav.view === 'Meu Perfil' ? 'text-white/70' : 'text-slate-500'
            }`}>Configurações</p>
          </div>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-1 text-slate-500 hover:text-rose-500 transition-colors group"
        >
          <i className="fa-solid fa-right-from-bracket text-xs group-hover:-translate-x-1 transition-transform"></i>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sair do Sistema</span>
        </button>
      </div>
    </div>
  </>
);
};

export default Sidebar;
