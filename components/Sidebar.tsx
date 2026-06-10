
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
      case 'Agendamento': return 'fa-calendar-days';
      case 'Clientes': return 'fa-users';
      case 'Pacotes': return 'fa-gift';
      case 'Financeiro': return 'fa-dollar-sign';
      case 'Gastos': return 'fa-chart-column';
      case 'Auditoria': return 'fa-shield-halved';
      default: return 'fa-circle';
    }
  };

  const getSubMenuColor = (label: SubView) => {
    switch (label) {
      case 'Agendamento': return 'text-teal-300 bg-teal-400/10';
      case 'Clientes': return 'text-emerald-300 bg-emerald-400/10';
      case 'Pacotes': return 'text-orange-300 bg-orange-400/10';
      case 'Financeiro': return 'text-violet-300 bg-violet-400/10';
      case 'Gastos': return 'text-amber-300 bg-amber-400/10';
      case 'Auditoria': return 'text-sky-300 bg-sky-400/10';
      default: return 'text-slate-300 bg-slate-400/10';
    }
  };

  const getGlobalIconColor = (id: GlobalView) => {
    switch (id) {
      case 'Financeiro Geral': return 'text-violet-300 bg-violet-400/10';
      case 'Configurações': return 'text-teal-200 bg-teal-400/10';
      case 'Equipe': return 'text-sky-300 bg-sky-400/10';
      case 'Painel Geral': return 'text-amber-300 bg-amber-400/10';
      default: return 'text-slate-300 bg-slate-400/10';
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

      <aside className={`w-[82vw] max-w-[22rem] md:w-72 md:max-w-none bg-[#071426] h-screen text-white flex flex-col fixed left-0 top-0 z-40 shadow-2xl shadow-slate-950/60 transition-transform duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-5 px-5 flex flex-col items-center shrink-0 relative bg-gradient-to-b from-[#0b1d34] via-[#08182b] to-[#071426] shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
          {/* Botão fechar no mobile */}
          <button 
            onClick={onClose}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15 md:hidden"
            aria-label="Fechar menu"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>

          <div className="w-20 h-20 bg-white rounded-[1.35rem] flex items-center justify-center shadow-2xl shadow-black/30 overflow-hidden group transition-transform hover:scale-105">
          {empresa.logo_url ? (
            <img src={empresa.logo_url} className="w-full h-full object-cover" alt="Logo" />
          ) : (
            <img src="/igui-logo-fallback.svg" className="w-full h-full object-cover" alt="Logo" />
          )}
        </div>
        
        <h1 className="mt-4 text-base font-black text-white uppercase tracking-tight text-center leading-tight line-clamp-2 max-w-full">
          {empresa.nome}
        </h1>
        
        <div className="mt-3 bg-teal-400/10 px-4 py-1.5 rounded-full text-[9px] font-black text-teal-200 uppercase tracking-[0.15em] shadow-[0_4px_12px_rgba(0,0,0,0.18)]">
          {getRoleBadgeLabel(userRole)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-5 px-4 space-y-7 bg-[#071426]">
        
        {filteredGlobalMenus.length > 0 && (
          <nav className="space-y-2">
            <p className="px-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.24em] mb-3">Menu Global</p>
            {filteredGlobalMenus.map((menu) => {
              const isActive = currentNav.mode === 'global' && currentNav.view === menu.id;
              
              return (
                <button
                  key={menu.id}
                  onClick={() => {
                    onNavigate({ mode: 'global', view: menu.id as any });
                    if (onClose) onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[1.15rem] transition-all duration-200 group ${
                    isActive 
                      ? 'bg-gradient-to-r from-[#00BFA5] to-[#14D6B3] text-white shadow-[0_0_20px_rgba(0,220,180,0.18),0_10px_22px_rgba(0,0,0,0.18)] translate-x-1' 
                      : 'bg-[#0D1D3B] text-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.20)] hover:bg-[#13284b] hover:text-white hover:shadow-[0_8px_18px_rgba(0,0,0,0.24)]'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? 'bg-white/22 text-white shadow-inner' : getGlobalIconColor(menu.id)
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
          <p className="px-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.24em] mb-3">Nossas Unidades</p>
          
          {getOrderedUnits().length > 0 ? getOrderedUnits().map((unit) => (
            <div key={unit.id} className="rounded-[1.35rem] bg-[#0D1D3B] shadow-[0_4px_12px_rgba(0,0,0,0.20)] p-2 space-y-2">
              <button
                onClick={() => toggleUnit(String(unit.id))}
                disabled={!isMaster}
                className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-[1.05rem] transition-all duration-200 group ${
                  expandedUnit === String(unit.id) || currentNav.unitId === unit.id || !isMaster
                    ? 'bg-[#142b46] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)]'
                    : 'bg-transparent text-slate-300 hover:bg-[#142b46] hover:text-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.16)]'
                } ${!isMaster ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    currentNav.unitId === unit.id ? 'bg-gradient-to-br from-[#00BFA5] to-[#14D6B3] text-white shadow-lg shadow-teal-500/20' : 'bg-teal-400/10 text-teal-300'
                  }`}>
                    <i className="fa-solid fa-store text-sm"></i>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-black text-sm truncate leading-tight">{unit.name.replace(/^iG\s+/i, '')}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Unidade</p>
                  </div>
                </div>
                {isMaster && (
                  <div className="w-8 h-8 rounded-xl bg-white/6 flex items-center justify-center shrink-0 ml-auto">
                    <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-300 ${expandedUnit === String(unit.id) ? 'rotate-180 text-teal-300' : 'text-slate-500'}`}></i>
                  </div>
                )}
              </button>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedUnit === String(unit.id) || !isMaster ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="space-y-2 pl-2 pb-1">
                  {filteredUnitSubMenus.map((sub) => (
                    <button
                      key={sub.label}
                      onClick={() => {
                        onNavigate({ mode: 'unit', view: sub.label, unitId: unit.id, unitName: unit.name });
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-[1.05rem] transition-all duration-200 font-bold ${
                        currentNav.unitId === unit.id && currentNav.view === sub.label
                          ? 'bg-gradient-to-r from-[#00BFA5] to-[#14D6B3] text-white shadow-[0_0_20px_rgba(0,220,180,0.18),0_10px_22px_rgba(0,0,0,0.18)]'
                          : 'bg-[#10233a] text-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.18)] hover:text-white hover:bg-[#17314f] hover:shadow-[0_8px_18px_rgba(0,0,0,0.22)]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        currentNav.unitId === unit.id && currentNav.view === sub.label ? 'bg-white/20 text-white' : getSubMenuColor(sub.label)
                      }`}>
                        <i className={`fa-solid ${getSubMenuIcon(sub.label)} text-sm`}></i>
                      </span>
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

      <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-[#071426] space-y-3 shrink-0 shadow-[0_-8px_18px_rgba(0,0,0,0.16)]">
        <button
          onClick={() => {
            onNavigate({ mode: 'global', view: 'Meu Perfil' });
            if (onClose) onClose();
          }}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-[1.15rem] transition-all duration-300 group ${
            currentNav.view === 'Meu Perfil'
              ? 'bg-gradient-to-r from-[#00BFA5] to-[#14D6B3] text-white shadow-[0_0_20px_rgba(0,220,180,0.18),0_10px_22px_rgba(0,0,0,0.18)]'
              : 'bg-[#0D1D3B] text-slate-200 hover:bg-[#13284b] shadow-[0_4px_12px_rgba(0,0,0,0.20)] hover:shadow-[0_8px_18px_rgba(0,0,0,0.24)]'
          }`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            currentNav.view === 'Meu Perfil' ? 'bg-white/20 text-white' : 'bg-sky-400/10 text-sky-300'
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
