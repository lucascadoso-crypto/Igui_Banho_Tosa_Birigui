
import React from 'react';
import { supabase } from './services/supabaseClient';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { UnitsProvider, useUnits } from './contexts/UnitsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import Marketing from './components/Marketing';

const AppContent: React.FC = () => {
  const { session, userProfile, userRole, setUserRole, loading, hasError, toast, handleLogout } = useAuth();
  const { units, fetchUnits, mobileBrand } = useUnits();
  const { navState, setNavState, isMobileMenuOpen, setIsMobileMenuOpen } = useNavigation();

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
      case 'Marketing':
        return <Marketing />;
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

  const activeMobileUnit = units.find(u => u.id === navState.unitId);
  const mobileUnitName = activeMobileUnit?.name || navState.unitName || mobileBrand.nome || units[0]?.name || 'Igui Banho e Tosa Birigui';
  const mobileUserName = effectiveUserProfile?.nome || session?.user?.user_metadata?.name || session?.user?.email || 'Usuario logado';
  const mobileLogo = mobileBrand.logo_url || '/igui-logo-fallback.svg';

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
      <header className="app-mobile-header md:hidden fixed top-0 left-0 right-0 z-30 h-[76px] bg-white text-slate-900 px-4 flex items-center justify-between shadow-lg shadow-slate-900/10 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center overflow-hidden border border-slate-100 shadow-sm shrink-0">
            <img
              src={mobileLogo}
              alt="Logo da unidade"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight tracking-tight">Sistema Pet</p>
            <p className="text-[11px] font-bold text-slate-500 leading-tight truncate">{mobileUnitName}</p>
            <p className="text-[10px] font-semibold text-slate-400 leading-tight truncate">{mobileUserName}</p>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="w-11 h-11 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-700 hover:bg-teal-100 active:scale-95 transition-all shrink-0 ml-3 border border-teal-100"
          aria-label="Abrir menu"
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

      <main className="app-mobile-main flex-1 min-h-screen md:ml-60 pt-[76px] md:pt-0 overflow-y-visible md:overflow-y-auto relative hide-scrollbar">
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

const App: React.FC = () => {
  return (
    <NavigationProvider>
      <UnitsProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </UnitsProvider>
    </NavigationProvider>
  );
};

export default App;
