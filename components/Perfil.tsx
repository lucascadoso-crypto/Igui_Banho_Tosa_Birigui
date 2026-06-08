
import React, { useState, useEffect } from 'react';

interface PerfilProps {
  supabaseClient: any;
}

const Perfil: React.FC<PerfilProps> = ({ supabaseClient }) => {
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) setUserEmail(user.email || '');
    };
    fetchUser();
  }, [supabaseClient]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showFeedback('As senhas não coincidem!', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showFeedback('A senha deve ter no mínimo 6 caracteres!', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showFeedback('Senha atualizada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showFeedback(err.message || 'Erro ao atualizar senha', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Toast Feedback */}
      {message && (
        <div className={`fixed top-24 right-10 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-white font-bold animate-in slide-in-from-right ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${message.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* Cabeçalho */}
      <header className="flex items-center space-x-4">
        <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-xl">
          <i className="fa-solid fa-user-shield"></i>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Meu Perfil</h2>
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">Dados de Acesso e Segurança</p>
        </div>
      </header>

      {/* Card Principal */}
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-sm border border-slate-100 p-10 lg:p-12">
        <form onSubmit={handleUpdatePassword} className="space-y-10">
          
          {/* Seção 1: Informações da Conta */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center">
              <i className="fa-solid fa-envelope mr-2"></i> Identificação
            </h3>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Usuário</label>
              <input 
                type="email" 
                value={userEmail} 
                readOnly 
                className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-bold text-slate-400 cursor-not-allowed" 
              />
              <p className="text-[9px] text-slate-400 font-bold italic ml-1">* O e-mail de acesso não pode ser alterado por este painel.</p>
            </div>
          </div>

          <hr className="border-slate-50" />

          {/* Seção 2: Alterar Senha */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center">
              <i className="fa-solid fa-lock mr-2"></i> Alterar Senha de Acesso
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                <div className="relative">
                  <input 
                    required
                    type={showPass ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all" 
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                <div className="relative">
                  <input 
                    required
                    type={showPass ? "text" : "password"} 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all" 
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full md:w-auto px-10 py-5 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-3"
            >
              {loading ? (
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk"></i>
                  <span>Atualizar Senha</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Perfil;
