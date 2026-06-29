import React, { useState, useEffect } from 'react';
import { Unit, NavigationState, SubView, GlobalView, UserRole, UserProfile } from '../types';

interface SidebarProps {
  units: Unit[];
  currentNav: NavigationState;
  onNavigate: (nav: NavigationState) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  supabaseClient: any;
  userProfile?: UserProfile;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentNav, onNavigate, userRole, supabaseClient, userProfile, isOpen, onClose }) => {
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState({ nome: 'IGUI BANHO E TOSA', logo_url: '' });
  const [listaUnidades, setListaUnidades] = useState<Unit[]>([]);

  const isMaster = userRole === 'master';

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
        let finalUnits = unitData.map((u: any) => ({
          id: u.id,
          name: u.nome,
          endereco_completo: u.endereco_completo,
          phone: u.telefone,
          whatsapp_nome_instancia: u.whatsapp_nome_instancia,
          whatsapp_token: u.whatsapp_token,
          whatsapp_url_servidor: u.whatsapp_url_servidor,
          whatsapp_ativo: u.whatsapp_ativo
        }));

        if (userRole !== 'master' && userProfile?.unidade_id) {
          finalUnits = finalUnits.filter((u: Unit) => u.id === userProfile.unidade_id);
        }

        setListaUnidades(finalUnits);
      }
    } catch (err) {
      console.error('Erro ao sincronizar dados na Sidebar:', err);
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
    { id: 'Painel Geral', label: 'Painel Geral', icon: 'fa-chart-pie', roles: ['master'] },
    { id: 'Financeiro Geral', label: 'Financeiro Geral', icon: 'fa-sack-dollar', roles: ['master'] },
    { id: 'Marketing', label: 'Marketing', icon: 'fa-bullhorn', roles: ['master', 'admin_unidade', 'gerente'] },
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
  const orderedUnits = getOrderedUnits();

  const toggleUnit = (unitId: string) => {
    if (!isMaster) return;
    setExpandedUnit(expandedUnit === String(unitId) ? null : String(unitId));
  };

  const getRoleBadgeLabel = (role: UserRole) => {
    switch (role) {
      case 'master': return 'USUÁRIO MASTER';
      case 'administrador': return 'ADMIN UNIDADE';
      case 'admin_unidade': return 'ADMIN UNIDADE';
      case 'gerente': return 'GERENTE OPERAC.';
      case 'financeiro': return 'FINANCEIRO';
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
      case 'Agendamento': return 'text-teal-600 bg-teal-50';
      case 'Clientes': return 'text-emerald-600 bg-emerald-50';
      case 'Pacotes': return 'text-orange-600 bg-orange-50';
      case 'Financeiro': return 'text-violet-600 bg-violet-50';
      case 'Gastos': return 'text-amber-600 bg-amber-50';
      case 'Auditoria': return 'text-sky-600 bg-sky-50';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  const getGlobalIconColor = (id: GlobalView) => {
    switch (id) {
      case 'Financeiro Geral': return 'text-violet-600 bg-violet-50';
      case 'Marketing': return 'text-emerald-600 bg-emerald-50';
      case 'Configurações': return 'text-teal-600 bg-teal-50';
      case 'Equipe': return 'text-sky-600 bg-sky-50';
      case 'Painel Geral': return 'text-amber-600 bg-amber-50';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  const navigateGlobal = (view: GlobalView) => {
    onNavigate({ mode: 'global', view });
    if (onClose) onClose();
  };

  const navigateUnit = (unit: Unit, view: SubView) => {
    onNavigate({ mode: 'unit', view, unitId: unit.id, unitName: unit.name });
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`w-[86vw] max-w-[21rem] md:w-60 md:max-w-none bg-[#F8FAFC] h-screen text-slate-800 flex flex-col fixed left-0 top-0 z-40 border-r border-slate-200/80 shadow-2xl md:shadow-[8px_0_28px_rgba(15,23,42,0.04)] transition-transform duration-300 ease-in-out md:translate-x-0 overflow-hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="pt-[max(1.1rem,env(safe-area-inset-top))] pb-4 px-4 md:pt-3 md:pb-2 md:px-3 flex flex-col items-center shrink-0 relative bg-white border-b border-slate-100">
          <button
            onClick={onClose}
            className="absolute right-3 top-[max(0.85rem,env(safe-area-inset-top))] w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 md:hidden"
            aria-label="Fechar menu"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>

          <div className="w-16 h-16 md:w-14 md:h-14 bg-white rounded-[1.15rem] md:rounded-full flex items-center justify-center shadow-sm ring-1 ring-slate-100 overflow-hidden group transition-transform hover:scale-105">
            <img
              src={empresa.logo_url || '/igui-logo-fallback.svg'}
              className="w-full h-full object-cover"
              alt="Logo"
            />
          </div>

          <h1 className="mt-3 md:mt-2 text-sm md:text-[13px] font-black text-slate-900 uppercase tracking-tight text-center leading-tight line-clamp-2 max-w-full">
            {empresa.nome}
          </h1>

          <div className="mt-2 md:mt-1.5 bg-teal-50 px-3 py-1.5 md:py-1 rounded-full text-[9px] font-black text-teal-700 uppercase tracking-[0.13em] border border-teal-100">
            {getRoleBadgeLabel(userRole)}
          </div>

        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden sidebar-scroll py-4 px-3 space-y-5 md:py-2.5 md:px-2.5 md:space-y-3 bg-[#F8FAFC]">
          {filteredGlobalMenus.length > 0 && (
            <nav className="space-y-2 md:space-y-1.5">
              <p className="px-3 text-[10px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.22em] mb-2 md:mb-1.5">Operação</p>
              {filteredGlobalMenus.map((menu) => {
                const isActive = currentNav.mode === 'global' && currentNav.view === menu.id;
                return (
                  <button
                    key={menu.id}
                    onClick={() => navigateGlobal(menu.id)}
                    className={`w-full flex items-center gap-3 px-4 md:px-3 py-3 md:py-2.5 rounded-[1.05rem] transition-all duration-200 group ${
                      isActive
                        ? 'bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-100'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
                    }`}
                  >
                    <span className={`w-9 h-9 md:w-8 md:h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20' : getGlobalIconColor(menu.id)
                    }`}>
                      <i className={`fa-solid ${menu.icon} text-sm`}></i>
                    </span>
                    <span className="font-black text-sm md:text-[13px] flex-1 text-left truncate">{menu.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="space-y-2 md:space-y-1.5">
            <p className="px-3 text-[10px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.22em] mb-2 md:mb-1.5">Nossas Unidades</p>

            {orderedUnits.length > 0 ? orderedUnits.map((unit) => (
              <div key={unit.id} className="rounded-[1.25rem] bg-white border border-slate-100 shadow-sm p-2 md:p-1.5 space-y-2 md:space-y-1.5">
                <button
                  onClick={() => toggleUnit(String(unit.id))}
                  disabled={!isMaster}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-3 md:py-2.5 rounded-[1.05rem] transition-all duration-200 group ${
                    expandedUnit === String(unit.id) || currentNav.unitId === unit.id || !isMaster
                      ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-100'
                      : 'bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  } ${!isMaster ? 'cursor-default' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-10 md:w-8 md:h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      currentNav.unitId === unit.id ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20' : 'bg-teal-50 text-teal-600'
                    }`}>
                      <i className="fa-solid fa-store text-sm"></i>
                    </span>
                    <span className="text-left min-w-0">
                      <span className="font-black text-sm md:text-[12px] truncate leading-tight block">{unit.name.replace(/^iG\s+/i, '')}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5 block">Unidade</span>
                    </span>
                  </div>
                  {isMaster && (
                    <span className="w-8 h-8 md:w-7 md:h-7 rounded-xl bg-white flex items-center justify-center shrink-0 ml-auto border border-slate-100">
                      <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-300 ${expandedUnit === String(unit.id) ? 'rotate-180 text-teal-600' : 'text-slate-400'}`}></i>
                    </span>
                  )}
                </button>

                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedUnit === String(unit.id) || !isMaster ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="space-y-2 md:space-y-1.5 pl-1 pb-1">
                    {filteredUnitSubMenus.map((sub) => {
                      const isActive = currentNav.unitId === unit.id && currentNav.view === sub.label;
                      return (
                        <button
                          key={sub.label}
                          onClick={() => navigateUnit(unit, sub.label)}
                          className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-[1.05rem] transition-all duration-200 font-bold ${
                            isActive
                              ? 'bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-100'
                              : 'bg-slate-50/70 text-slate-600 hover:text-slate-900 hover:bg-white'
                          }`}
                        >
                          <span className={`w-8 h-8 md:w-7 md:h-7 rounded-xl flex items-center justify-center shrink-0 ${
                            isActive ? 'bg-teal-600 text-white' : getSubMenuColor(sub.label)
                          }`}>
                            <i className={`fa-solid ${getSubMenuIcon(sub.label)} text-sm`}></i>
                          </span>
                          <span className="text-xs md:text-[11px] uppercase tracking-wide truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )) : (
              <div className="px-4 py-3 text-xs text-slate-400 italic">Carregando lojas...</div>
            )}
          </div>
        </div>

        <div className="mt-auto p-3 md:p-2 pb-[max(0.9rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-100 space-y-2.5 md:space-y-1.5 shrink-0">
          <button
            onClick={() => navigateGlobal('Meu Perfil')}
            className={`w-full flex items-center gap-3 px-4 md:px-3 py-3 md:py-2 rounded-[1.05rem] transition-all duration-200 group ${
              currentNav.view === 'Meu Perfil'
                ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className={`w-8 h-8 md:w-7 md:h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              currentNav.view === 'Meu Perfil' ? 'bg-teal-600 text-white' : 'bg-sky-50 text-sky-600'
            }`}>
              <i className="fa-solid fa-user text-sm"></i>
            </span>
            <span className="text-left">
              <span className="text-xs md:text-[11px] font-black uppercase tracking-widest leading-none block">Meu Perfil</span>
              <span className={`text-[9px] md:text-[8px] font-bold mt-1 uppercase block ${
                currentNav.view === 'Meu Perfil' ? 'text-teal-600/80' : 'text-slate-400'
              }`}>Configurações</span>
            </span>
          </button>

          <button
            className="w-full flex items-center gap-3 px-4 md:px-3 py-2.5 md:py-2 rounded-[1rem] text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Ajuda"
          >
            <i className="fa-regular fa-circle-question w-8 text-center"></i>
            <span className="text-xs md:text-[11px] font-black uppercase tracking-widest">Ajuda</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 md:py-1.5 text-slate-400 hover:text-rose-500 transition-colors group"
          >
            <i className="fa-solid fa-right-from-bracket text-xs group-hover:-translate-x-1 transition-transform"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sair do Sistema</span>
          </button>
          <p className="text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest">Versão 2.4.0</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
