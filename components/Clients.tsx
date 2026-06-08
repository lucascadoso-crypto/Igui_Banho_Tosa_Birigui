
import React, { useState, useEffect } from 'react';
import { Unit, Client } from '../types';
import CadastroPet from './CadastroPet';
import ClientDetailsModal from './ClientDetailsModal';
import ClienteModal from './ClienteModal';
import { registrarAtividade } from '../services/logger';

interface ClientsProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: any;
}

const Clients: React.FC<ClientsProps> = ({ unit, supabaseClient, userProfile }) => {
  const isReadOnly = userProfile?.cargo === 'financeiro';
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [toast, setToast] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<number | string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [selectedClientDetails, setSelectedClientDetails] = useState<Client | null>(null);
  const [isPetModalOpen, setIsPetModalOpen] = useState(false);
  const [newPetClientData, setNewPetClientData] = useState<{id: number | string, nome: string} | null>(null);

  useEffect(() => {
    fetchClients();
  }, [unit.id]);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchClients = async () => {
    if (!supabaseClient) return;
    setLoading(true);
    try {
      // Isolamento por Unidade: V2 usa unidade_id como vínculo obrigatório de negócio.
      const { data, error } = await supabaseClient
        .from('clientes')
        .select('*')
        .eq('unidade_id', unit.id)
        .order('nome', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar clientes:", err);
      showToast("Erro ao carregar clientes", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (exporting || !supabaseClient) return;
    setExporting(true);
    try {
      // Busca base completa de clientes do Supabase
      const { data, error } = await supabaseClient
        .from('clientes')
        .select('*')
        .eq('unidade_id', unit.id)
        .order('nome', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        showToast("Nenhum cliente encontrado para exportação", "error");
        return;
      }

      // Mapeia os dados em português e remove quebras de linha/escapes para CSV bem-formado
      const headers = [
        "Nome",
        "Telefone",
        "Telefone Adicional",
        "E-mail",
        "CPF",
        "Data de Nascimento",
        "Gênero",
        "Receber Mensagens",
        "Notas Internas",
        "Restrições",
        "CEP",
        "Logradouro",
        "Número",
        "Bairro",
        "Complemento",
        "Cidade",
        "Estado",
        "Data de Cadastro"
      ];

      const escapeValue = (val: any) => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        // Remove quebras de linha para evitar deslocamento de linha no Excel
        str = str.replace(/\r?\n|\r/g, " ");
        // Duplica as aspas internas e envolve com aspas se contiver aspas ou ponto e vírgula
        if (str.includes(';') || str.includes('"')) {
          str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvRows = [];
      csvRows.push(headers.join(';')); // Ponto e vírgula para Excel em português

      data.forEach((client: any) => {
        const row = [
          escapeValue(client.nome),
          escapeValue(client.telefone),
          escapeValue(client.telefone_adicional),
          escapeValue(client.email),
          escapeValue(client.cpf),
          escapeValue(client.data_nascimento),
          escapeValue(client.genero),
          client.receber_msgs ? "Sim" : "Não",
          escapeValue(client.notas_internas),
          escapeValue(client.restricoes),
          escapeValue(client.cep),
          escapeValue(client.logradouro),
          escapeValue(client.numero),
          escapeValue(client.bairro),
          escapeValue(client.complemento),
          escapeValue(client.cidade),
          escapeValue(client.estado),
          escapeValue(client.created_at ? new Date(client.created_at).toLocaleDateString('pt-BR') : '')
        ];
        csvRows.push(row.join(';'));
      });

      // Adiciona o BOM do UTF-8 para garantir acentuação correta no Excel em português
      const csvContent = "\uFEFF" + csvRows.join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "lista_clientes_petshop.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Exportação concluída com sucesso!");

      // Registro de Auditoria
      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'EXPORTAR_CSV_CLIENTES', 
        `Exportou lista de clientes em formato CSV`,
        userProfile?.nome,
        userProfile?.cargo
      );
    } catch (err: any) {
      console.error("Erro ao exportar CSV:", err);
      showToast("Erro ao exportar CSV", "error");
    } finally {
      setExporting(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenModal = (client: Partial<Client> | null = null) => {
    setEditingClient(client);
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id: number | string, nome: string) => {
    if (!window.confirm(`Deseja realmente excluir o cliente ${nome}?`)) return;
    
    try {
      const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
      if (error) throw error;
      
      // Log de Auditoria
      registrarAtividade(
        unit.id, 
        userProfile?.email || 'sistema', 
        'EXCLUIR_CLIENTE', 
        `Excluiu o cliente ${nome} (ID: ${id})`,
        userProfile?.nome,
        userProfile?.cargo
      );

      showToast("Cliente removido");
      fetchClients();
    } catch (err: any) {
      showToast("Erro ao excluir", "error");
    }
    setActiveMenuId(null);
  };

  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefone.includes(searchTerm)
  );

  const groupedClients = filteredClients.reduce((groups, client) => {
    const letter = client.nome.charAt(0).toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(client);
    return groups;
  }, {} as Record<string, Client[]>);

  const sortedLetters = Object.keys(groupedClients).sort();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {toast && (
        <div className={`fixed top-24 right-10 z-[110] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-white font-bold animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-[#00BFA5]' : 'bg-rose-500'}`}>
          <i className={`fa-solid ${toast.type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}`}></i>
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {!isReadOnly && (
            <button 
              onClick={() => handleOpenModal()}
              className="bg-[#00BFA5] hover:opacity-90 text-white px-6 py-3 rounded-2xl font-bold flex items-center shadow-lg shadow-[#00BFA5]/20 transition-all active:scale-95"
            >
              <i className="fa-solid fa-plus mr-2"></i> Novo Cliente
            </button>
          )}

          <button 
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 px-6 py-3 rounded-2xl font-bold flex items-center shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin mr-2 text-[#00BFA5]"></i>
                Carregando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-download mr-2 text-slate-500"></i>
                Exportar CSV
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3 flex-1 md:max-w-xl">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input 
              type="text" 
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#00BFA5] outline-none transition-all text-sm"
            />
          </div>
        </div>
      </div>

      {/* Lista Estilo Agenda Telefônica */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-visible mb-10">
        {loading ? (
          <div className="p-20 text-center">
             <i className="fa-solid fa-circle-notch fa-spin text-4xl text-[#00BFA5]"></i>
             <p className="mt-4 text-slate-400 font-bold">Carregando Agenda...</p>
          </div>
        ) : sortedLetters.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {sortedLetters.map(letter => (
              <div key={letter} className="relative">
                <div className="bg-slate-50/80 backdrop-blur-sm px-8 py-3 sticky top-0 z-10 border-y border-slate-100/50">
                  <span className="text-xl font-black text-slate-400">{letter}</span>
                </div>

                <div className="divide-y divide-slate-50/50">
                  {groupedClients[letter].map(client => (
                    <div 
                      key={client.id} 
                      className="group flex items-center justify-between px-8 py-5 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center space-x-6 flex-1 min-w-0">
                        <div className="w-14 h-14 rounded-full bg-[#00BFA5] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[#00BFA5]/20 shrink-0 overflow-hidden">
                          {client.foto_url ? (
                            <img src={client.foto_url} alt={client.nome} className="w-full h-full object-cover" />
                          ) : (
                            client.nome.charAt(0).toUpperCase()
                          )}
                        </div>
                        
                        <div className="min-w-0 cursor-pointer" onClick={() => setSelectedClientDetails(client)}>
                          <h4 className="font-bold text-slate-800 text-lg truncate group-hover:text-[#00BFA5] transition-colors">{client.nome}</h4>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-slate-500 font-medium flex items-center">
                              <i className="fa-brands fa-whatsapp mr-1.5 text-emerald-500"></i>
                              {client.telefone}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative ml-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === client.id ? null : client.id);
                          }}
                          className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
                        >
                          <i className="fa-solid fa-ellipsis-vertical text-lg"></i>
                        </button>

                        {activeMenuId === client.id && !isReadOnly && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 animate-in fade-in zoom-in duration-200 ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleOpenModal(client)} className="w-full flex items-center px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                              <i className="fa-solid fa-pen-to-square mr-3 text-[#00BFA5]"></i> Editar Contato
                            </button>
                            <button onClick={() => handleDelete(client.id, client.nome)} className="w-full flex items-center px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                              <i className="fa-solid fa-trash-can mr-3"></i> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-20 text-center flex flex-col items-center">
             <i className="fa-solid fa-address-book text-6xl text-slate-100 mb-6"></i>
             <p className="text-slate-400 font-bold text-xl">Sua agenda está vazia</p>
          </div>
        )}
      </div>

      {/* NOVO MODAL UNIFICADO (MODO COMPLETO) */}
      {isModalOpen && (
        <ClienteModal 
          modo="completo"
          client={editingClient}
          unitId={unit.id}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsModalOpen(false)}
          onSave={() => {
            fetchClients();
            setIsModalOpen(false);
          }}
          showToast={showToast}
        />
      )}

      {selectedClientDetails && (
        <ClientDetailsModal 
          client={selectedClientDetails}
          supabaseClient={supabaseClient}
          unitId={unit.id}
          onClose={() => setSelectedClientDetails(null)}
          onOpenNewPet={(id, nome) => {
            setNewPetClientData({ id, nome });
            setIsPetModalOpen(true);
          }}
          userProfile={userProfile}
        />
      )}

      {isPetModalOpen && newPetClientData && (
        <CadastroPet 
          clientId={newPetClientData.id}
          clientName={newPetClientData.nome}
          supabaseClient={supabaseClient}
          unitId={unit.id}
          userProfile={userProfile}
          onClose={() => {
            setIsPetModalOpen(false);
            setNewPetClientData(null);
            fetchClients();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Clients;
