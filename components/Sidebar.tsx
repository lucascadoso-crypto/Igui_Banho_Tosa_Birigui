
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

  useEffect(() => {
    if (currentNav.mode === 'unit' && currentNav.unitId && !expandedUnit) {
      setExpandedUnit(String(currentNav.unitId));
    }
  }, [currentNav.mode, currentNav.unitId, expandedUnit]);

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
    setExpandedUnit(expandedUnit === String(unitId) ? null : String(unitId));
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

  const getSubMenuIcon = (label: SubView) => {
    switch (label) {
      case 'Agendamento': return 'fa-calendar-check';
      case 'Clientes': return 'fa-address-book';
      case 'Pacotes': return 'fa-layer-group';
      case 'Financeiro': return 'fa-wallet';
      case 'Gastos': return 'fa-cart-shopping';
      case 'Auditoria': return 'fa-shield-halved';
      default: return 'fa-circle';
    }
  };

  return (
    <>
      {/* Overlay para Mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-30 md:hidden animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`w-[82vw] max-w-[22rem] md:w-72 md:max-w-none bg-slate-950 h-screen text-white flex flex-col fixed left-0 top-0 z-40 shadow-2xl shadow-slate-950/50 border-r border-white/10 transition-transform duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-5 flex flex-col items-center border-b border-white/10 shrink-0 relative bg-gradient-to-b from-slate-900 to-slate-950">
          {/* Botão fechar no mobile */}
          <button 
            onClick={onClose}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15 md:hidden"
            aria-label="Fechar menu"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>

          <div className="w-20 h-20 bg-white rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-black/30 border border-white/10 overflow-hidden group transition-transform hover:scale-105">
          {empresa.logo_url ? (
            <img src={empresa.logo_url} className="w-full h-full object-cover" alt="Logo" />
          ) : (
            <img src="/igui-logo-fallback.svg" className="w-full h-full object-cover" alt="Logo" />
          )}
        </div>
        
        <h1 className="mt-4 text-base font-black text-white uppercase tracking-tight text-center leading-tight line-clamp-2 max-w-full">
          {empresa.nome}
        </h1>
        
        <div className="mt-3 bg-teal-400/10 px-4 py-1.5 rounded-full text-[9px] font-black text-teal-200 uppercase tracking-[0.15em] border border-teal-300/20 shadow-inner">
          {getRoleBadgeLabel(userRole)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-5 px-4 space-y-7">
        
        {filteredGlobalMenus.length > 0 && (
          <nav className="space-y-2">
            <p className="px-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.22em] mb-3">Menu Global</p>
            {filteredGlobalMenus.map((menu) => {
              const isActive = currentNav.mode === 'global' && currentNav.view === menu.id;
              
              return (
                <button
                  key={menu.id}
                  onClick={() => {
                    onNavigate({ mode: 'global', view: menu.id as any });
                    if (onClose) onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group border ${
                    isActive 
                      ? 'bg-[#00BFA5] text-white shadow-xl shadow-teal-500/20 border-teal-300/30 translate-x-1' 
                      : 'bg-white/[0.045] text-slate-300 border-white/5 shadow-lg shadow-black/10 hover:bg-white/[0.075] hover:text-white hover:border-white/10'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-900/80 text-teal-300 group-hover:bg-teal-400/10'
                  }`}>
                    <i className={`fa-solid ${menu.icon} text-sm`}></i>
                  </div>
                  <span className="font-black text-sm flex-1 text-left truncate">{menu.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="space-y-2">
          <p className="px-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.22em] mb-3">Nossas Unidades</p>
          
          {getOrderedUnits().length > 0 ? getOrderedUnits().map((unit) => (
            <div key={unit.id} className="space-y-2">
              <button
                onClick={() => toggleUnit(String(unit.id))}
                disabled={!isMaster}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 border group ${
                  expandedUnit === String(unit.id) || currentNav.unitId === unit.id || !isMaster
                    ? 'bg-white/[0.08] text-white border-white/10 shadow-xl shadow-black/15'
                    : 'bg-white/[0.045] text-slate-300 border-white/5 shadow-lg shadow-black/10 hover:bg-white/[0.075] hover:text-white'
                } ${!isMaster ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    currentNav.unitId === unit.id ? 'bg-[#00BFA5] text-white shadow-lg shadow-teal-500/20' : 'bg-slate-900/80 text-teal-300'
                  }`}>
                    <i className="fa-solid fa-store text-sm"></i>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-black text-sm truncate leading-tight">{unit.name.replace(/^iG\s+/i, '')}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Unidade</p>
                  </div>
                </div>
                {isMaster && (
                  <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                    <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-300 ${expandedUnit === String(unit.id) ? 'rotate-180 text-teal-300' : 'text-slate-500'}`}></i>
                  </div>
                )}
              </button>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedUnit === String(unit.id) || !isMaster ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="space-y-2 pl-3 border-l border-teal-400/20 ml-5 pb-1">
                  {filteredUnitSubMenus.map((sub) => (
                    <button
                      key={sub.label}
                      onClick={() => {
                        onNavigate({ mode: 'unit', view: sub.label, unitId: unit.id, unitName: unit.name });
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 font-bold border ${
                        currentNav.unitId === unit.id && currentNav.view === sub.label
                          ? 'bg-[#00BFA5] text-white border-teal-300/30 shadow-xl shadow-teal-500/20 translate-x-1'
                          : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-white hover:bg-white/[0.07]'
                      }`}
                    >
                      <i className={`fa-solid ${getSubMenuIcon(sub.label)} w-4 text-center ${
                        currentNav.unitId === unit.id && currentNav.view === sub.label ? 'text-white' : 'text-teal-300'
                      }`}></i>
                      <span className="text-xs uppercase tracking-wide truncate">{sub.label}</span>
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

      <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-950 border-t border-white/10 space-y-3 shrink-0">
        <button
          onClick={() => {
            onNavigate({ mode: 'global', view: 'Meu Perfil' });
            if (onClose) onClose();
          }}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group border ${
            currentNav.view === 'Meu Perfil'
              ? 'bg-[#00BFA5] text-white shadow-xl shadow-teal-500/20 border-teal-300/30'
              : 'bg-white/[0.055] text-slate-200 hover:bg-white/[0.085] border-white/10 shadow-lg shadow-black/10'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            currentNav.view === 'Meu Perfil' ? 'bg-white/20 text-white' : 'bg-teal-400/10 text-teal-300'
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
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-slate-500 hover:text-rose-400 transition-colors group"
        >
          <i className="fa-solid fa-right-from-bracket text-xs group-hover:-translate-x-1 transition-transform"></i>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sair do Sistema</span>
        </button>
      </div>
    </aside>
  </>
);
};

export default Sidebar;
