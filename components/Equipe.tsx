
import React, { useState, useEffect, useRef } from 'react';
import { Unit, UserRole, UserProfile } from '../types';
import { uploadToImgBB } from '../services/imgbbService';
import { registrarAtividade } from '../services/logger';

interface EquipeProps {
  units: Unit[];
  supabaseClient: any;
  currentUserRole: UserRole;
  userProfile?: UserProfile;
}

const Equipe: React.FC<EquipeProps> = ({ units, supabaseClient, currentUserRole, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingLogins, setPendingLogins] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMaster = currentUserRole === 'master';
  const canManageAccess = isMaster && !isReadOnly;

  useEffect(() => {
    fetchEmployees();
    fetchCurrentUser();
  }, [units]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      setCurrentUserEmail(user.email);
    }
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
      const { data: pendingData, error: pendingError } = isMaster
        ? await supabaseClient.rpc('listar_logins_pendentes')
        : { data: [], error: null };

      if (pendingError) {
        console.warn('Logins pendentes ainda indisponiveis:', pendingError.message);
      }

      setPendingLogins(pendingData || []);
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
      nome: employee.nome || employee.funcionario_nome || '',
      email: employee.email || '',
      cargo: employee.cargo || employee.funcionario_cargo || 'atendente',
      unidade_id: employee.unidade_id || employee.funcionario_unidade_id || units[0]?.id,
      auth_user_id: employee.auth_user_id || employee.user_id || null,
      status_login: employee.status_login,
      status: employee.ativo ? 'Ativo' : 'Inativo'
    } : {
      nome: '',
      email: '',
      cargo: 'atendente',
      unidade_id: units[0]?.id,
      status: 'Inativo', // Pendente por padrão
      foto_url: '',
      auth_user_id: null,
      status_login: 'SEM_LOGIN_VINCULADO'
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
      const basePayload = { 
        nome: editingEmployee.nome,
        email: editingEmployee.email,
        foto_url: editingEmployee.foto_url
      };

      let funcionarioId = editingEmployee.id;
      if (editingEmployee.id) {
        const { error } = await supabaseClient.from('funcionarios').update(basePayload).eq('id', editingEmployee.id);
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
        const createPayload = {
          ...basePayload,
          cargo: editingEmployee.cargo,
          unidade_id: editingEmployee.unidade_id,
          ativo: false
        };
        const { data, error } = await supabaseClient.from('funcionarios').insert([createPayload]).select('id').single();
        if (error) throw error;
        funcionarioId = data.id;

        registrarAtividade(
          editingEmployee.unidade_id || units[0].id,
          userProfile?.email || 'sistema',
          'NOVO_COLABORADOR',
          `Adicionou ${editingEmployee.nome} à equipe`,
          userProfile?.nome,
          userProfile?.cargo
        );
      }

      if (editingEmployee.auth_user_id) {
        const { error: accessError } = await supabaseClient.rpc('salvar_acesso_funcionario', {
          p_funcionario_id: funcionarioId,
          p_auth_user_id: editingEmployee.auth_user_id,
          p_unidade_id: Number(editingEmployee.unidade_id),
          p_perfil: editingEmployee.cargo,
          p_ativo: editingEmployee.status === 'Ativo'
        });
        if (accessError) throw accessError;
      } else if (editingEmployee.status === 'Ativo') {
        throw new Error('Selecione um login pendente antes de liberar acesso ativo.');
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
      const accessUserId = emp.auth_user_id || emp.user_id;
      const { error } = accessUserId
        ? await supabaseClient.rpc('salvar_acesso_funcionario', {
            p_funcionario_id: emp.id,
            p_auth_user_id: accessUserId,
            p_unidade_id: Number(emp.unidade_id),
            p_perfil: emp.cargo,
            p_ativo: false
          })
        : await supabaseClient
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
      case 'master': return { label: 'MASTER', icon: 'fa-shield-halved', color: 'text-slate-900', badge: 'bg-slate-100 text-slate-900' };
      case 'admin_unidade': return { label: 'ADMIN UNIDADE', icon: 'fa-building-user', color: 'text-indigo-600', badge: 'bg-indigo-50 text-indigo-600' };
      case 'gerente': return { label: 'GERENTE', icon: 'fa-gear', color: 'text-slate-600', badge: 'bg-slate-100 text-slate-600' };
      case 'financeiro': return { label: 'FINANCEIRO', icon: 'fa-sack-dollar', color: 'text-amber-600', badge: 'bg-amber-50 text-amber-600' };
      case 'atendente': return { label: 'ATENDENTE', icon: 'fa-headset', color: 'text-sky-600', badge: 'bg-sky-50 text-sky-600' };
      case 'tosador': return { label: 'TOSADOR', icon: 'fa-scissors', color: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-600' };
      case 'somente_leitura': return { label: 'LEITURA', icon: 'fa-eye', color: 'text-slate-400', badge: 'bg-slate-50 text-slate-500' };
      default: return { label: 'COLABORADOR', icon: 'fa-user-nurse', color: 'text-slate-400', badge: 'bg-slate-50 text-slate-500' };
    }
  };

  const getAccessStatusInfo = (emp: any) => {
    const status = emp.status_login || (emp.user_id ? (emp.ativo ? 'ACESSO_ATIVO' : 'ACESSO_SUSPENSO') : 'SEM_LOGIN_VINCULADO');
    switch (status) {
      case 'PENDENTE_DE_APROVACAO':
        return { label: 'PENDENTE DE APROVAÇÃO', badge: 'bg-amber-50 text-amber-700', icon: 'fa-hourglass-half' };
      case 'ACESSO_ATIVO':
        return { label: 'ACESSO ATIVO', badge: 'bg-emerald-50 text-emerald-600', icon: 'fa-circle-check' };
      case 'ACESSO_SUSPENSO':
        return { label: 'ACESSO SUSPENSO', badge: 'bg-rose-50 text-rose-600', icon: 'fa-ban' };
      default:
        return { label: 'SEM LOGIN VINCULADO', badge: 'bg-slate-50 text-slate-500', icon: 'fa-user-slash' };
    }
  };

  return (
    <div className="space-y-5 md:space-y-8 pt-2 md:pt-0 animate-in fade-in duration-500">
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
        <div className="flex items-center space-x-3 md:space-x-4">
           <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl md:text-2xl shadow-xl shrink-0">
              <i className="fa-solid fa-users-gear"></i>
           </div>
           <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight uppercase leading-tight">Equipe e Acessos</h2>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">Gestão de Funcionários</p>
           </div>
        </div>
        {canManageAccess && (
          <button onClick={() => handleOpenModal()} className="w-full md:w-auto justify-center bg-slate-900 hover:bg-black text-white px-6 md:px-8 py-3.5 md:py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center">
            <i className="fa-solid fa-plus mr-3"></i> NOVO MEMBRO
          </button>
        )}
      </header>

      {isMaster && pendingLogins.length > 0 && (
        <section className="bg-amber-50 border border-amber-100 rounded-[1.75rem] md:rounded-[2rem] p-4 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">Logins pendentes de aprovação</h3>
              <p className="text-xs font-bold text-amber-700/80 mt-1">Vincule o login real ao funcionário. Ninguém recebe acesso automaticamente.</p>
            </div>
            <span className="shrink-0 bg-white/80 text-amber-700 border border-amber-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              {pendingLogins.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingLogins.map((login) => (
              <button
                key={login.user_id}
                type="button"
                onClick={() => handleOpenModal({
                  id: login.funcionario_id,
                  nome: login.funcionario_nome || '',
                  email: login.email,
                  cargo: login.funcionario_cargo || 'atendente',
                  unidade_id: login.funcionario_unidade_id || units[0]?.id,
                  ativo: false,
                  auth_user_id: login.user_id,
                  status_login: login.status_login
                })}
                className="text-left rounded-2xl bg-white/85 border border-amber-100 p-4 hover:bg-white hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-user-clock"></i>
                  </span>
                  <span className="min-w-0">
                    <span className="block font-black text-slate-800 text-sm truncate">{login.funcionario_nome || 'Login sem funcionário cadastrado'}</span>
                    <span className="block text-xs font-bold text-slate-500 truncate">{login.email}</span>
                    <span className="mt-2 inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest">
                      {getAccessStatusInfo(login).label}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="bg-white rounded-[1.75rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        
        <div className="p-4 md:p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 gap-3">
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

          <div className="divide-y divide-slate-50 md:divide-y-0 space-y-3 md:space-y-4 p-3 md:p-0">
            {loading ? (
              <div className="py-20 text-center text-slate-400 font-bold"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Sincronizando...</div>
            ) : employees.map(emp => {
              const role = getRoleInfo(emp.cargo);
              const accessStatus = getAccessStatusInfo(emp);
              const isSelf = emp.email === currentUserEmail;
              
              return (
                <div key={emp.id} className="bg-white md:bg-transparent p-4 md:p-0 rounded-2xl md:rounded-none border border-slate-100 md:border-none shadow-sm md:shadow-none hover:bg-slate-50/50 transition-colors group md:grid md:grid-cols-4 md:items-center md:px-8 md:py-6">
                  <div className="mb-3 md:mb-0">
                    <div className="flex items-start md:items-center space-x-3 md:space-x-4">
                      <div className="w-11 h-11 md:w-10 md:h-10 rounded-2xl md:rounded-full bg-slate-900 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
                        {emp.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="md:hidden font-black text-slate-800 text-sm leading-tight truncate flex items-center">
                          {emp.nome}
                          {isSelf && <span className="ml-2 text-[8px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase shrink-0">(Voce)</span>}
                        </p>
                        <p className="hidden md:flex font-black text-slate-800 text-sm truncate items-center">
                          {emp.email || 'sem-email@rede.com'}
                          {isSelf && <span className="ml-2 text-[9px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase">(Você)</span>}
                        </p>
                        <p className="md:hidden text-[11px] text-slate-400 font-bold truncate mt-0.5">{emp.email || 'sem-email@rede.com'}</p>
                        <p className="hidden md:block text-[11px] text-slate-400 font-bold uppercase tracking-tighter">{emp.nome}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:block mb-2 md:mb-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</span>
                    <div className={`inline-flex items-center space-x-2 font-black text-[10px] uppercase tracking-widest px-2.5 py-1.5 rounded-xl md:px-0 md:py-0 md:rounded-none md:bg-transparent ${role.badge} md:${role.color}`}>
                      <i className={`fa-solid ${role.icon} text-xs`}></i>
                      <span>{role.label}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:block mb-3 md:mb-0">
                    <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 md:py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${accessStatus.badge}`}>
                      <i className={`fa-solid ${accessStatus.icon} text-[8px]`}></i>
                      {accessStatus.label}
                    </span>
                  </div>

                  <div className="text-right border-t md:border-t-0 border-slate-50 pt-3 md:pt-0">
                    {isSelf ? (
                      <div className="flex items-center justify-end space-x-2 text-slate-300 font-black text-[9px] uppercase tracking-widest">
                         <i className="fa-solid fa-lock text-xs"></i>
                         <span>Protegido</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2 md:space-x-3">
                        {canManageAccess && (
                          <>
                            <button 
                              onClick={() => handleOpenModal(emp)}
                              className="w-11 h-11 md:w-9 md:h-9 bg-slate-900 text-white rounded-2xl md:rounded-full flex items-center justify-center hover:bg-black transition-all shadow-md active:scale-90"
                              aria-label={`Editar ${emp.nome}`}
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                            <button 
                              onClick={() => handleInactivate(emp)}
                              className="w-11 h-11 md:w-9 md:h-9 bg-rose-50 text-rose-500 rounded-2xl md:rounded-full flex items-center justify-center hover:bg-rose-100 transition-all active:scale-90"
                              aria-label={`Inativar ${emp.nome}`}
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
                   <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs font-bold text-slate-500 leading-relaxed">
                      <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] mb-1">Status do login</p>
                      <p className="mb-2">{getAccessStatusInfo(editingEmployee).label}</p>
                      <p>O acesso será definido automaticamente conforme o cargo e a unidade selecionados.</p>
                      {!editingEmployee.auth_user_id && (
                        <p className="mt-2 text-amber-700">Sem login vinculado: o colaborador pode ficar cadastrado, mas não acessa o sistema até o Master aprovar um login pendente.</p>
                      )}
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
                     {editingEmployee.auth_user_id ? 'SALVAR ACESSO' : editingEmployee.id ? 'SALVAR CADASTRO' : 'CRIAR CADASTRO'}
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
