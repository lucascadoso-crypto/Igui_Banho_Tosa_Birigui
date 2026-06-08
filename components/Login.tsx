
import React, { useState, useEffect } from 'react';

interface LoginProps {
  supabaseClient: any;
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ supabaseClient, onLoginSuccess }) => {
  const fallbackLogo = '/igui-logo-fallback.svg';
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  
  // Estado para Identidade Visual Dinâmica
  const [sistema, setSistema] = useState({
    nome: 'IGUI BANHO E TOSA BIRIGUI',
    logo: fallbackLogo
  });

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient
          .from('config_sistema')
          .select('nome_fantasia, logo_url')
          .eq('id', 1)
          .maybeSingle();
        
        if (!error && data) {
          setSistema({
            nome: (data.nome_fantasia || 'IGUI BANHO E TOSA BIRIGUI').toUpperCase(),
            logo: data.logo_url || fallbackLogo
          });
        }
      } catch (err: any) {
        console.error("Erro ao buscar configurações visuais:", err);
      }
    };
    fetchConfig();
  }, [supabaseClient]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        onLoginSuccess();
      } else {
        const { data, error: signUpError } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              nome: fullName,
            },
          },
        });
        
        if (signUpError) throw signUpError;

        if (data.session) {
          onLoginSuccess();
        } else {
          alert("Conta criada com sucesso! Por favor, faça login.");
          setMode('login');
        }
      }
    } catch (err: any) {
      const msg = err.message === 'Failed to fetch' 
        ? "Não foi possível conectar ao servidor. Verifique sua conexão com a internet."
        : (err.message || 'Erro na autenticação');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-6 animate-in fade-in duration-700">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 lg:p-12 animate-in zoom-in duration-500">
        
        {/* Logo Container Dinâmico */}
        <div className="flex justify-center mb-8">
          <div className="w-full max-w-[280px] h-32 md:h-40 flex items-center justify-center">
            <img
              src={sistema.logo || fallbackLogo}
              onError={(e) => {
                e.currentTarget.src = fallbackLogo;
              }}
              className="w-full h-full object-contain"
              alt={sistema.nome}
            />
          </div>
        </div>

        {/* Header Text Dinâmico */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-[900] text-slate-900 tracking-tighter uppercase leading-none">
            {sistema.nome}
          </h1>
          <p className="text-[10px] font-black text-rose-500 tracking-[0.2em] uppercase mt-2">
            Acesso ao Painel Administrativo
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 text-rose-700 text-xs font-bold rounded-r-xl animate-in slide-in-from-top-2">
            <i className="fa-solid fa-circle-exclamation mr-2"></i> {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-6">
          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
              <div className="relative">
                <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                <input 
                  required
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none transition-all font-bold text-slate-700"
                  placeholder="Seu nome"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
            <div className="relative">
              <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
              <input 
                required
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none transition-all font-bold text-slate-700"
                placeholder="exemplo@email.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
              <input 
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none transition-all font-bold text-slate-700"
                placeholder="••••••••"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-3 group"
          >
            {loading ? (
              <i className="fa-solid fa-circle-notch fa-spin text-lg"></i>
            ) : (
              <>
                <span>{mode === 'login' ? 'Entrar no Sistema' : 'Criar minha Conta'}</span>
                <i className="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
              </>
            )}
          </button>
        </form>

        <div className="mt-10 space-y-4 text-center">
          {mode === 'login' && (
            <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
              Esqueci minha senha
            </button>
          )}
          
          <div className="pt-4 border-t border-slate-50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {mode === 'login' ? 'Ainda não tem conta?' : 'Já possui uma conta?'}
              <button 
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="ml-2 text-rose-500 hover:text-rose-600 underline"
              >
                {mode === 'login' ? 'CADASTRE-SE' : 'FAZER LOGIN'}
              </button>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
