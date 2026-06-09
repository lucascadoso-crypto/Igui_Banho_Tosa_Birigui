
import React, { useState, useEffect, useRef } from 'react';
import { Unit, UserRole } from '../types';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';

interface EquipeProps {
  units: Unit[];
  supabaseClient: any;
  currentUserRole: UserRole;
  userProfile?: any;
}

const Equipe: React.FC<EquipeProps> = ({ units, supabaseClient, currentUserRole, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMaster = currentUserRole === 'master' || currentUserRole === 'financeiro';

  useEffect(() => {
    fetchEmployees();
    fetchCurrentUser();
  }, [units]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) setCurrentUserEmail(user.email);
  };

  const fetchEmployees = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('funcionarios')
        .select(`*, unidades(nome)`)
        .order('nome', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error("Erro ao buscar funcionários:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (employee: any = null) => {
    setEditingEmployee(employee ? {
      ...employee,
      status: employee.ativo ? 'Ativo' : 'Inativo'
    } : {
      nome: '',
      email: '',
      cargo: 'atendente',
      unidade_id: units[0]?.id,
      status: 'Inativo', // Pendente por padrão
      foto_url: ''
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const url = await uploadToImgBB(file);
    if (url) {
      setEditingEmployee(prev => ({ ...prev, foto_url: url }));
    }
    setUploadingImage(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Sincroniza o status da UI com o booleano 'ativo' do banco
      const payload = { 
        nome: editingEmployee.nome,
        email: editingEmployee.email,
        cargo: editingEmployee.cargo,
        unidade_id: editingEmployee.unidade_id,
        foto_url: editingEmployee.foto_url,
        ativo: editingEmployee.status === 'Ativo'
      };

      if (editingEmployee.id) {
        const { error } = await supabaseClient.from('funcionarios').update(payload).eq('id', editingEmployee.id);
        if (error) throw error;
        
        registrarAtividade(
          editingEmployee.unidade_id || units[0].id,
          userProfile?.email || 'sistema',
          'EDICAO_COLABORADOR',
          `Editou os dados/acesso de ${editingEmployee.nome}`,
          userProfile?.nome,
          userProfile?.cargo
        );
      } else {
        const { error } = await supabaseClient.from('funcionarios').insert([payload]);
        if (error) throw error;

        registrarAtividade(
          editingEmployee.unidade_id || units[0].id,
          userProfile?.email || 'sistema',
          'NOVO_COLABORADOR',
          `Adicionou ${editingEmployee.nome} à equipe`,
          userProfile?.nome,
          userProfile?.cargo
        );
      }

      setIsModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      console.error("Erro ao salvar funcionário:", err);
      alert("Erro ao salvar: " + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleInactivate = async (emp: any) => {
    // Validação de Segurança: Não permitir que o usuário logado se inative
    if (emp.email === currentUserEmail) {
       alert("Você não pode inativar sua própria conta. Esta ação deve ser realizada por outro Administrador Master.");
       return;
    }

    if (!window.confirm(`Deseja realmente inativar o acesso de ${emp.nome}? O usuário perderá a entrada no sistema imediatamente.`)) return;
    
    setLoading(true);
    try {
      // Realiza o update no Supabase (Transformando Excluir em Inativar para manter histórico)
      const { error } = await supabaseClient
        .from('funcionarios')
        .update({ ativo: false })
        .eq('id', emp.id);

      if (error) throw error;
      
      registrarAtividade(
        emp.unidade_id || units[0].id,
        userProfile?.email || 'sistema',
        'INATIVACAO_COLABORADOR',
        `Inativou o acesso de ${emp.nome}`,
        userProfile?.nome,
        userProfile?.cargo
      );

      alert("Usuário inativado com sucesso!");
      await fetchEmployees(); // Recarrega a lista
    } catch (err: any) {
      console.error("Erro ao inativar acesso:", err);
      alert("Falha ao inativar acesso: " + (err.message || 'Erro de comunicação com o banco.'));
    } finally {
      // OBRIGATÓRIO: Resetar o estado de loading para evitar travamento da UI
      setLoading(false);
    }
  };

  const getRoleInfo = (role: string) => {
    switch(role) {
      case 'master': return { label: 'MASTER', icon: 'fa-shield-halved', color: 'text-slate-900' };
      case 'admin_unidade': return { label: 'ADMIN UNIDADE', icon: 'fa-building-user', color: 'text-indigo-600' };
      case 'gerente': return { label: 'GERENTE', icon: 'fa-gear', color: 'text-slate-600' };
      case 'financeiro': return { label: 'FINANCEIRO', icon: 'fa-sack-dollar', color: 'text-amber-600' };
      case 'atendente': return { label: 'ATENDENTE', icon: 'fa-headset', color: 'text-sky-600' };
      case 'tosador': return { label: 'TOSADOR', icon: 'fa-scissors', color: 'text-emerald-600' };
      case 'somente_leitura': return { label: 'LEITURA', icon: 'fa-eye', color: 'text-slate-400' };
      default: return { label: 'COLABORADOR', icon: 'fa-user-nurse', color: 'text-slate-400' };
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
           <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-2xl shadow-xl">
              <i className="fa-solid fa-users-gear"></i>
           </div>
           <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Equipe e Acessos</h2>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">Gestão de Funcionários</p>
           </div>
        </div>
        {isMaster && !isReadOnly && (
          <button onClick={() => handleOpenModal()} className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center">
            <i className="fa-solid fa-plus mr-3"></i> NOVO MEMBRO
          </button>
        )}
      </header>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Funcionários Cadastrados</h3>
           <div className="bg-slate-900 text-orange-500 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
             {employees.length} Membros
           </div>
        </div>

        <div className="space-y-4">
          {/* Cabeçalho Oculto no Mobile */}
          <div className="hidden md:grid md:grid-cols-4 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest px-8 py-4 rounded-t-2xl">
            <div>Email / Identificação</div>
            <div>Cargo / Permissão</div>
            <div>Status</div>
            <div className="text-right">Ações</div>
          </div>

          <div className="divide-y divide-slate-50 md:divide-y-0 space-y-4">
            {loading ? (
              <div className="py-20 text-center text-slate-400 font-bold"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Sincronizando...</div>
            ) : employees.map(emp => {
              const role = getRoleInfo(emp.cargo);
              const isSelf = emp.email === currentUserEmail;
              
              return (
                <div key={emp.id} className="bg-white md:bg-transparent p-6 md:p-0 rounded-3xl md:rounded-none border border-slate-100 md:border-none shadow-sm md:shadow-none hover:bg-slate-50/50 transition-colors group md:grid md:grid-cols-4 md:items-center md:px-8 md:py-6">
                  <div className="mb-4 md:mb-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
                        {emp.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-sm truncate flex items-center">
                          {emp.email || 'sem-email@rede.com'}
                          {isSelf && <span className="ml-2 text-[9px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase">(Você)</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tighter">{emp.nome}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:block mb-4 md:mb-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</span>
                    <div className={`flex items-center space-x-2.5 font-black text-[10px] uppercase tracking-widest ${role.color}`}>
                      <i className={`fa-solid ${role.icon} text-xs`}></i>
                      <span>{role.label}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:block mb-4 md:mb-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                    <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      !emp.ativo 
                        ? 'bg-rose-50 text-rose-600' 
                        : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {emp.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <div className="text-right border-t md:border-t-0 border-slate-50 pt-3 md:pt-0">
                    {isSelf ? (
                      <div className="flex items-center justify-end space-x-2 text-slate-300 font-black text-[9px] uppercase tracking-widest">
                         <i className="fa-solid fa-lock text-xs"></i>
                         <span>Protegido</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end space-x-3">
                        {!isReadOnly && (
                          <>
                            <button 
                              onClick={() => handleOpenModal(emp)}
                              className="w-10 h-10 md:w-9 md:h-9 bg-slate-900 text-white rounded-xl md:rounded-full flex items-center justify-center hover:bg-black transition-all shadow-md active:scale-90"
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                            <button 
                              onClick={() => handleInactivate(emp)}
                              className="w-10 h-10 md:w-9 md:h-9 bg-rose-50 text-rose-500 rounded-xl md:rounded-full flex items-center justify-center hover:bg-rose-100 transition-all active:scale-90"
                            >
                              <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isModalOpen && editingEmployee && (
        <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="app-modal-panel bg-white w-[95%] mx-auto md:max-w-lg md:w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
             <header className="app-modal-header bg-slate-900 p-6 md:p-8 text-white flex justify-between items-center shrink-0">
                <div>
                   <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter">
                     {editingEmployee.id ? 'Alterar Acesso' : 'Novo Colaborador'}
                   </h3>
                   <p className="text-[9px] md:text-[10px] text-slate-400 font-black tracking-widest uppercase mt-1">Configurações de Privilégio</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl md:text-2xl"><i className="fa-solid fa-xmark"></i></button>
             </header>

             <form onSubmit={handleSave} className="app-modal-body flex-1 overflow-y-auto p-6 md:p-10 space-y-6 custom-scrollbar">
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                      <input 
                        required 
                        type="text" 
                        value={editingEmployee.nome} 
                        onChange={(e) => setEditingEmployee({...editingEmployee, nome: e.target.value})} 
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all" 
                        placeholder="Nome do membro..."
                      />
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Corporativo / Acesso</label>
                      <input 
                        required 
                        type="email" 
                        value={editingEmployee.email} 
                        onChange={(e) => setEditingEmployee({...editingEmployee, email: e.target.value})} 
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all" 
                        placeholder="email@exemplo.com"
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil de Acesso</label>
                         <select 
                           value={editingEmployee.cargo}
                           onChange={(e) => setEditingEmployee({...editingEmployee, cargo: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all"
                         >
                            <option value="atendente">Atendente</option>
                            <option value="tosador">Tosador/Banhista</option>
                            <option value="gerente">Gerente</option>
                            <option value="admin_unidade">Admin Unidade</option>
                            <option value="financeiro">Financeiro</option>
                            <option value="somente_leitura">Somente Leitura</option>
                            <option value="master">Master (Total)</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade Padrão</label>
                         <select 
                           value={editingEmployee.unidade_id}
                           onChange={(e) => setEditingEmployee({...editingEmployee, unidade_id: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all"
                         >
                            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                         </select>
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status da Conta</label>
                      <select 
                        value={editingEmployee.status}
                        onChange={(e) => setEditingEmployee({...editingEmployee, status: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all"
                      >
                         <option value="Ativo">🟢 Ativo (Acesso Liberado)</option>
                         <option value="Inativo">🔴 Inativo (Bloqueado)</option>
                      </select>
                   </div>
                </div>

                <div className="pt-4 flex gap-2 md:gap-3">
                   <button 
                     type="button" 
                     onClick={() => setIsModalOpen(false)}
                     className="flex-1 py-3 md:py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                   >Cancelar</button>
                   <button 
                     type="submit" 
                     disabled={loading} 
                     className="flex-[2] py-3 md:py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:bg-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                   >
                     {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : <i className="fa-solid fa-check-circle mr-2"></i>}
                     {editingEmployee.id ? 'Salvar' : 'Criar'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Equipe;
