
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Unit, UserRole, UserProfile } from '../types';
import { supabase } from '../services/supabaseClient';
import { useUnits } from './UnitsContext';
import { useNavigation } from './NavigationContext';

interface Toast {
  message: string;
  type: 'error' | 'success';
}

interface AuthContextValue {
  session: any;
  userProfile: UserProfile | null;
  userRole: UserRole;
  setUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  loading: boolean;
  hasError: boolean;
  toast: Toast | null;
  showToast: (message: string, type?: 'error' | 'success') => void;
  handleLogout: () => Promise<void>;
  normalizeRole: (role?: string) => UserRole;
  fetchProfile: (authUser: any, currentUnits: Unit[]) => Promise<void>;
  initializeApp: (authUser: any) => Promise<void>;
  lastEmailRef: React.MutableRefObject<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { fetchUnits, fetchMobileBrand } = useUnits();
  const { setNavState } = useNavigation();

  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('comum');
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
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
      case 'atendente':
      case 'tosador':
      case 'somente_leitura':
      case 'admin_unidade':
      case 'gerente':
      case 'financeiro':
      case 'master':
        return role;
      default:
        return (role || 'comum') as UserRole;
    }
  };

  // Busca perfil - Removido 'units' das dependências para quebrar o loop
  const fetchProfile = useCallback(async (authUser: any, currentUnits: Unit[]) => {
    try {
const { data, error: profileError } = await supabase
        .from('funcionarios')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (data) {
        const normalizedProfile = { ...data, ativo: data.ativo ?? false };
        const normalizedRole = normalizeRole(data.cargo);
        setUserProfile(normalizedProfile);
        setUserRole(normalizedRole);

        // Se o usuário não for master nem financeiro, trava ele na unidade dele
        if (normalizedRole !== 'master' && data.unidade_id) {
          const userUnit = currentUnits.find(u => u.id === data.unidade_id);
          setNavState({
            mode: 'unit',
            view: 'Agendamento',
            unitId: data.unidade_id,
            unitName: userUnit?.name || 'Sua Unidade'
          });
        }
      } else {
        console.warn("Login sem acesso liberado na tabela de funcionarios.");
        setUserProfile({
          cargo: 'pendente',
          ativo: false,
          email: authUser.email,
          nome: authUser.user_metadata?.name || authUser.email
        });
        setUserRole('comum');
      }
    } catch (err) {
      console.error("ERRO AO CARREGAR PERFIL:", err);
      setHasError(true);
      throw err; // Re-throw para o initializeApp capturar
    }
  }, [handleLogout, setNavState]);

  const initializeApp = useCallback(async (authUser: any) => {
    // Se já inicializamos para este email, não fazemos de novo
    if (lastEmailRef.current === authUser.email && userProfile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const loadedUnits = await fetchUnits();
      await fetchProfile(authUser, loadedUnits);
      lastEmailRef.current = authUser.email;
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
          await initializeApp(session.user);
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
            await initializeApp(session.user);
          }
        } else {
          // Se não há sessão, limpa tudo (Logout)
          lastEmailRef.current = null;
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

  // Extraído do App.tsx original. A query e o estado de mobileBrand vivem em
  // UnitsContext (fetchMobileBrand); este efeito só decide QUANDO chamar,
  // porque é aqui que `session` existe.
  useEffect(() => {
    if (!session) return;

    let mounted = true;
    const run = () => {
      if (!mounted) return;
      fetchMobileBrand();
    };

    run();
    const handleUpdate = () => run();
    window.addEventListener('dadosGlobaisAtualizados', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('dadosGlobaisAtualizados', handleUpdate);
    };
  }, [session, fetchMobileBrand]);

  const value: AuthContextValue = {
    session,
    userProfile,
    userRole,
    setUserRole,
    loading,
    hasError,
    toast,
    showToast,
    handleLogout,
    normalizeRole,
    fetchProfile,
    initializeApp,
    lastEmailRef
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return ctx;
};
