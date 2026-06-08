
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Unit, NavigationState, UserRole } from './types';
import { supabase } from './services/supabaseClient';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Appointments from './components/Appointments';
import Settings from './components/Settings';
import SQLViewer from './components/SQLViewer';
import Clients from './components/Clients';
import Pacotes from './components/Pacotes';
import Financeiro from './components/Financeiro';
import Gastos from './components/Gastos';
import PainelGeral from './components/PainelGeral';
import FinanceiroGlobal from './components/FinanceiroGlobal';
import Equipe from './components/Equipe';
import ReciboView from './components/ReciboView';
import Login from './components/Login';
import Perfil from './components/Perfil';
import Auditoria from './components/Auditoria';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [userRole, setUserRole] = useState<UserRole>('comum');
  const [navState, setNavState] = useState<NavigationState>({ 
    mode: 'global', 
    view: 'Painel Geral' 
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const lastEmailRef = useRef<string | null>(null);

  // --- LOGOUT BLINDADO (HARD REFRESH) ---
  const handleLogout = useCallback(async () => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Ignora erros de sessão
    }
    window.location.href = '/';
  }, []);

  // Global safety timeout: No loading screen can last more than 6 seconds
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setLoading(false);
        console.warn("Loading safety timeout reached. Releasing UI.");
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const normalizeRole = (role?: string): UserRole => {
    switch (role) {
      case 'admin_unidade':
        return 'administrador';
      case 'atendente':
      case 'tosador':
      case 'somente_leitura':
        return 'comum';
      default:
        return (role || 'comum') as UserRole;
    }
  };

  // Busca unidades - Dependência zero para evitar recriação
  const fetchUnits = useCallback(async () => {
    try {
      const { data, error: sbError } = await supabase.from('unidades').select('*');
      if (sbError) throw sbError;
      
      if (data) {
        const mappedUnits = data.map(u => ({ 
          id: u.id, 
          name: u.nome, 
          endereco_completo: u.endereco_completo, 
          phone: u.telefone,
          whatsapp_nome_instancia: u.whatsapp_nome_instancia,
          whatsapp_token: u.whatsapp_token,
          whatsapp_url_servidor: u.whatsapp_url_servidor,
          whatsapp_ativo: u.whatsapp_ativo
        }));
        setUnits(mappedUnits);
        return mappedUnits;
      }
      return [];
    } catch (err: any) {
      console.error("ERRO AO CARREGAR UNIDADES:", err);
      // Permitimos renderização degradada (sem unidades) em vez de travar tudo
      return [];
    }
  }, []);

  // Busca perfil - Removido 'units' das dependências para quebrar o loop
  const fetchProfile = useCallback(async (email: string, currentUnits: Unit[]) => {
    try {
const { data, error: profileError } = await supabase
        .from('funcionarios')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (profileError) throw profileError;
      
      if (data) {
        const normalizedProfile = { ...data, ativo: data.ativo ?? false };
        const normalizedRole = normalizeRole(data.cargo);
        setUserProfile(normalizedProfile);
        setUserRole(normalizedRole);
        
        // Se o usuário não for master nem financeiro, trava ele na unidade dele
        if (normalizedRole !== 'master' && normalizedRole !== 'financeiro' && data.unidade_id) {
          const userUnit = currentUnits.find(u => u.id === data.unidade_id);
          setNavState({
            mode: 'unit',
            view: 'Agendamento',
            unitId: data.unidade_id,
            unitName: userUnit?.name || 'Sua Unidade'
          });
        }
      } else {
        // ROLLBACK: Temporariamente permitindo acesso básico se o perfil não for encontrado para evitar loops
        console.warn("Usuário não encontrado na tabela de funcionários. Usando perfil padrão.");
        setUserProfile({ cargo: 'comum', ativo: true });
        setUserRole('comum');
      }
    } catch (err) {
      console.error("ERRO AO CARREGAR PERFIL:", err);
      setHasError(true);
      throw err; // Re-throw para o initializeApp capturar
    }
  }, [handleLogout]);

  const initializeApp = useCallback(async (email: string) => {
    // Se já inicializamos para este email, não fazemos de novo
    if (lastEmailRef.current === email && userProfile) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const loadedUnits = await fetchUnits();
      await fetchProfile(email, loadedUnits);
      lastEmailRef.current = email;
      setHasError(false);
    } catch (err) {
      console.error("FALHA NA INICIALIZAÇÃO DO APP:", err);
      setHasError(true);
      showToast('Erro de conexão. Algumas funções podem estar limitadas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [fetchUnits, fetchProfile, userProfile]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          // Se o token de refresh falhar, limpamos tudo para forçar novo login
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid_refresh_token')) {
            console.warn("Sessão expirada ou token inválido. Limpando cache...");
            await handleLogout();
            return;
          }
          throw error;
        }

        if (!mounted) return;
        setSession(session);
        if (session?.user?.email) {
          await initializeApp(session.user.email);
        }
      } catch (err: any) {
        console.error("Erro ao buscar sessão:", err);
        // Se for erro de rede, não desloga, apenas avisa
        if (err.message !== 'Failed to fetch') {
          showToast('Sessão expirada. Por favor, faça login novamente.', 'error');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Escuta mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Tratamento de erro de refresh token no evento
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        lastEmailRef.current = null;
        localStorage.clear();
        return;
      }

      // Armadura contra disparos repetitivos de foco de aba
      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && lastEmailRef.current === session?.user?.email && userProfile) {
        return;
      }

      setSession(session);

      try {
        if (session?.user?.email) {
          // Só dispara inicialização se for um novo email ou se ainda não temos o perfil
          if (lastEmailRef.current !== session.user.email || !userProfile) {
            await initializeApp(session.user.email);
          }
        } else {
          // Se não há sessão, limpa tudo (Logout)
          lastEmailRef.current = null;
          setUnits([]);
          setUserProfile(null);
        }
      } catch (err) {
        console.error("Erro no listener de auth:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initializeApp]);

  if (!session && !loading) {
    return <Login supabaseClient={supabase} onLoginSuccess={() => {}} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center mb-6 animate-bounce shadow-2xl shadow-yellow-400/20">
          <i className="fa-solid fa-paw text-slate-900 text-4xl"></i>
        </div>
        <div className="flex flex-col items-center space-y-3">
           <div className="flex items-center space-x-3 text-white/50 font-black text-xs uppercase tracking-[0.3em]">
              <i className="fa-solid fa-circle-notch fa-spin"></i>
              <span>Sincronizando...</span>
           </div>
        </div>
      </div>
    );
  }
  const effectiveUserRole = userRole;
  const effectiveUserProfile = userProfile;

  if (effectiveUserProfile && (!effectiveUserProfile.ativo || effectiveUserProfile.cargo === 'pendente')) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="bg-white w-full max-w-md rounded-[2.5rem] p-12 shadow-2xl animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <i className="fa-solid fa-hourglass-half text-4xl animate-pulse"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4 uppercase">Acesso em Analise</h2>
          <p className="text-slate-500 font-bold text-sm leading-relaxed mb-10">
            Seu cadastro foi recebido, mas seu acesso ainda nao esta liberado.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all"
          >
            <i className="fa-solid fa-right-from-bracket mr-2"></i> Sair do Sistema
          </button>
        </div>
      </div>
    );
  }

  const queryParams = new URLSearchParams(window.location.search);
  const isReciboView = queryParams.get('view') === 'recibo';
  const reciboApptId = queryParams.get('id');

  if (isReciboView && reciboApptId) {
    return <ReciboView apptId={reciboApptId} supabaseClient={supabase} />;
  }

  const renderContent = () => {
    const activeUnit = units.find(u => u.id === navState.unitId);

    switch (navState.view) {
      case 'Painel Geral':
        return <PainelGeral units={units} supabaseClient={supabase} />;
      case 'Financeiro Geral':
        return <FinanceiroGlobal units={units} supabaseClient={supabase} />;
      case 'Equipe':
        return <Equipe units={units} supabaseClient={supabase} currentUserRole={effectiveUserRole} userProfile={effectiveUserProfile} />;
      case 'Meu Perfil':
        return <Perfil supabaseClient={supabase} />;
      case 'Configuracoes':
      case 'Configurações':
        return <Settings supabaseClient={supabase} units={units} refreshUnits={fetchUnits} userProfile={effectiveUserProfile} />;
      case 'Clientes':
        return activeUnit ? <Clients unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      case 'Pacotes':
        return activeUnit ? <Pacotes unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      case 'Agendamento':
        return activeUnit ? <Appointments unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      case 'Financeiro':
        return activeUnit ? <Financeiro unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      case 'Gastos':
        return activeUnit ? <Gastos unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      case 'Auditoria':
        return activeUnit ? <Auditoria unit={activeUnit} supabaseClient={supabase} userProfile={effectiveUserProfile} /> : <div>Selecione uma unidade</div>;
      default:
        return <div className="text-center py-20 font-bold text-slate-400 uppercase">Modulo Indisponivel</div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[9999] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 flex items-center space-x-3 text-white font-bold ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
          <i className={`fa-solid ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-check-circle'} text-xl`}></i>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Topbar Mobile */}
      <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-30 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center">
            <i className="fa-solid fa-paw text-slate-900 text-xl"></i>
          </div>
          <span className="font-black text-sm uppercase tracking-tighter">IGUI ERP</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400"
        >
          <i className="fa-solid fa-bars"></i>
        </button>
      </header>

      <Sidebar 
        units={units} 
        currentNav={navState} 
        onNavigate={setNavState} 
        userRole={effectiveUserRole}
        setUserRole={setUserRole}
        supabaseClient={supabase}
        userProfile={effectiveUserProfile}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      <main className="flex-1 min-h-screen md:ml-72 overflow-y-auto relative hide-scrollbar">
        {hasError && (
          <div className="bg-rose-50 border-b border-rose-100 px-10 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3 text-rose-600 font-bold text-sm">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>Modo Offline/Degradado: Falha ao sincronizar dados em tempo real.</span>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-all"
            >
              Tentar Sincronizar
            </button>
          </div>
        )}
        <div className="p-4 md:p-10">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
