
import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Client, Pet, UserProfile } from '../types';
import CadastroPet from './CadastroPet';
import ClientDetailsModal from './ClientDetailsModal';
import ClienteModal from './ClienteModal';
import ClientesViaLink from './ClientesViaLink';
import { registrarAtividade } from '../services/logger';
import { SEGMENTOS, SegmentoId, ClienteSegmentosFlags, getSegmentosAtivos } from './Marketing/segmentos';

export type ClientesFiltroRapidoInicial = 'atrasados' | 'pacote_acabando' | 'aniversariantes' | 'pendencia' | 'nao_renovaram';

interface ClientsProps {
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
  /** Filtro rápido já ativo ao abrir (ex: "Ações do dia" do Dashboard). */
  initialFiltroRapido?: ClientesFiltroRapidoInicial;
}

// Linha de public.marketing_segmentos_clientes (ver 0052/0053/0054), só os campos usados aqui.
interface SegmentoRow extends ClienteSegmentosFlags {
  cliente_id: number | string;
}

const FILTROS_RAPIDOS_EXTRA: { id: 'atrasados' | 'pacote_acabando' | 'aniversariantes' | 'pendencia'; titulo: string; icon: string }[] = [
  { id: 'atrasados', titulo: 'Pets atrasados', icon: 'fa-clock-rotate-left' },
  { id: 'pacote_acabando', titulo: 'Pacote acabando', icon: 'fa-hourglass-half' },
  { id: 'aniversariantes', titulo: 'Aniversariantes do mês', icon: 'fa-cake-candles' },
  { id: 'pendencia', titulo: 'Com pendência', icon: 'fa-triangle-exclamation' }
];

const Clients: React.FC<ClientsProps> = ({ unit, supabaseClient, userProfile, initialFiltroRapido }) => {
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
  const [isViaLinkOpen, setIsViaLinkOpen] = useState(false);

  // Dados de apoio para filtros rápidos, chip de segmento e mini avatares (CRM, Prompt 1).
  const [segmentosPorCliente, setSegmentosPorCliente] = useState<Record<string, SegmentoRow>>({});
  const [petsPorCliente, setPetsPorCliente] = useState<Record<string, Pet[]>>({});
  const [clientesAtrasados, setClientesAtrasados] = useState<Set<string>>(new Set());
  const [clientesPacoteAcabando, setClientesPacoteAcabando] = useState<Set<string>>(new Set());
  const [clientesAniversariantes, setClientesAniversariantes] = useState<Set<string>>(new Set());
  const [clientesComPendencia, setClientesComPendencia] = useState<Set<string>>(new Set());

  const [segmentoFiltro, setSegmentoFiltro] = useState<Set<SegmentoId>>(new Set());
  const [filtroAtrasados, setFiltroAtrasados] = useState(false);
  const [filtroPacoteAcabando, setFiltroPacoteAcabando] = useState(false);
  const [filtroAniversariantes, setFiltroAniversariantes] = useState(false);
  const [filtroPendencia, setFiltroPendencia] = useState(false);

  useEffect(() => {
    fetchClients();
    fetchDadosApoio();
  }, [unit.id]);

  // Filtro rápido já ativo ao chegar via "Ações do dia" do Dashboard.
  useEffect(() => {
    if (!initialFiltroRapido) return;
    if (initialFiltroRapido === 'atrasados') setFiltroAtrasados(true);
    else if (initialFiltroRapido === 'pacote_acabando') setFiltroPacoteAcabando(true);
    else if (initialFiltroRapido === 'aniversariantes') setFiltroAniversariantes(true);
    else if (initialFiltroRapido === 'pendencia') setFiltroPendencia(true);
    else if (initialFiltroRapido === 'nao_renovaram') setSegmentoFiltro(new Set(['nao_renovaram']));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiltroRapido]);

  const fetchDadosApoio = async () => {
    if (!supabaseClient) return;
    try {
      const dataFimAmpla = new Date();
      dataFimAmpla.setFullYear(dataFimAmpla.getFullYear() + 2);

      const [segRes, petsRes, retornoRes, pacotesRes, anivRes, pendRes] = await Promise.all([
        supabaseClient.from('marketing_segmentos_clientes').select('*').eq('unidade_id', unit.id),
        supabaseClient.from('pets').select('id, nome, foto_url, cliente_id, ativo, comportamento_tags').eq('unidade_id', unit.id),
        supabaseClient.from('crm_pet_retorno').select('cliente_id, status_retorno').eq('unidade_id', unit.id).eq('status_retorno', 'atrasado'),
        supabaseClient.from('marketing_pacotes_status').select('cliente_id').eq('unidade_id', unit.id).eq('pacote_ativo', true).lte('saldo_calculado', 2),
        supabaseClient.from('marketing_aniversariantes').select('cliente_id').eq('unidade_id', unit.id),
        supabaseClient.rpc('fn_financeiro_eventos_pendentes', {
          p_unidade_id: unit.id,
          p_data_inicio: '2015-01-01',
          p_data_fim: dataFimAmpla.toISOString().substring(0, 10),
          p_transporte: 'todos',
          p_categoria: 'todos',
          p_forma_pagamento: 'todas'
        })
      ]);

      const segMap: Record<string, SegmentoRow> = {};
      (segRes.data || []).forEach((row: SegmentoRow) => { segMap[String(row.cliente_id)] = row; });
      setSegmentosPorCliente(segMap);

      const petsMap: Record<string, Pet[]> = {};
      (petsRes.data || []).filter((p: Pet) => p.ativo !== false).forEach((pet: Pet) => {
        const key = String(pet.cliente_id);
        if (!petsMap[key]) petsMap[key] = [];
        petsMap[key].push(pet);
      });
      setPetsPorCliente(petsMap);

      setClientesAtrasados(new Set((retornoRes.data || []).map((r: any) => String(r.cliente_id))));
      setClientesPacoteAcabando(new Set((pacotesRes.data || []).map((r: any) => String(r.cliente_id))));
      setClientesAniversariantes(new Set((anivRes.data || []).map((r: any) => String(r.cliente_id))));
      setClientesComPendencia(new Set((pendRes.data || []).map((r: any) => String(r.cliente_id))));
    } catch (err) {
      console.error('Erro ao buscar dados de apoio do CRM:', err);
    }
  };

  const toggleSegmentoFiltro = (id: SegmentoId) => {
    setSegmentoFiltro(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    window.addEventListener('refreshClientes', fetchClients);
    return () => window.removeEventListener('refreshClientes', fetchClients);
  }, [unit.id]);

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
        "Data de Cadastro",
        "Segmentos",
        "Pets",
        "Pet Atrasado",
        "Pacote Acabando",
        "Com Pendência Financeira"
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
          escapeValue(client.created_at ? new Date(client.created_at).toLocaleDateString('pt-BR') : ''),
          escapeValue(getSegmentosAtivos(segmentosPorCliente[String(client.id)]).map(s => s.titulo).join(', ')),
          escapeValue((petsPorCliente[String(client.id)] || []).map(p => p.nome).join(', ')),
          clientesAtrasados.has(String(client.id)) ? 'Sim' : 'Não',
          clientesPacoteAcabando.has(String(client.id)) ? 'Sim' : 'Não',
          clientesComPendencia.has(String(client.id)) ? 'Sim' : 'Não'
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

  const searchDigits = searchTerm.replace(/\D/g, '');
  const temFiltroAtivo = segmentoFiltro.size > 0 || filtroAtrasados || filtroPacoteAcabando || filtroAniversariantes || filtroPendencia;

  const filteredClients = clients.filter(c => {
    const clienteId = String(c.id);
    const petsDoCliente = petsPorCliente[clienteId] || [];

    const termoBusca = searchTerm.toLowerCase().trim();
    if (termoBusca.length > 0) {
      const matchNome = c.nome.toLowerCase().includes(termoBusca);
      const matchTelefone = searchDigits.length > 0 && (c.telefone || '').replace(/\D/g, '').includes(searchDigits);
      const matchPet = petsDoCliente.some(p => p.nome.toLowerCase().includes(termoBusca));
      if (!matchNome && !matchTelefone && !matchPet) return false;
    }

    if (segmentoFiltro.size > 0) {
      const seg = segmentosPorCliente[clienteId];
      const algumSegmentoAtivo = Array.from(segmentoFiltro).some(id => {
        if (!seg) return false;
        if (id === 'vip') return !!seg.seg_vip;
        if (id === 'pagam_em_dia') return !!seg.seg_pagam_em_dia;
        if (id === 'avulso_recorrente') return !!seg.seg_avulso_recorrente;
        if (id === 'nao_renovaram') return !!seg.seg_nao_renovaram;
        if (id === 'inativos') return !!seg.seg_inativos;
        return false;
      });
      if (!algumSegmentoAtivo) return false;
    }

    if (filtroAtrasados && !clientesAtrasados.has(clienteId)) return false;
    if (filtroPacoteAcabando && !clientesPacoteAcabando.has(clienteId)) return false;
    if (filtroAniversariantes && !clientesAniversariantes.has(clienteId)) return false;
    if (filtroPendencia && !clientesComPendencia.has(clienteId)) return false;

    return true;
  });

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

          <button
            onClick={() => setIsViaLinkOpen(true)}
            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 px-6 py-3 rounded-2xl font-bold flex items-center shadow-sm transition-all active:scale-95"
          >
            <i className="fa-solid fa-link mr-2"></i> Cadastros via link
          </button>
        </div>

        <div className="flex items-center gap-3 flex-1 md:max-w-xl">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input 
              type="text" 
              placeholder="Buscar por nome, telefone ou pet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-[#00BFA5] outline-none transition-all text-sm"
            />
          </div>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2 bg-white px-6 py-4 rounded-3xl border border-slate-100 shadow-sm">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Filtros:</span>
        {SEGMENTOS.filter(s => s.id !== 'aniversariantes').map(seg => {
          const ativo = segmentoFiltro.has(seg.id);
          return (
            <button
              key={seg.id}
              onClick={() => toggleSegmentoFiltro(seg.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 border transition-all ${
                ativo ? `${seg.corBg} ${seg.corTexto} border-current` : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
              }`}
            >
              <i className={`fa-solid ${seg.icon}`}></i>{seg.titulo}
            </button>
          );
        })}
        {FILTROS_RAPIDOS_EXTRA.map(f => {
          const ativo = f.id === 'atrasados' ? filtroAtrasados
            : f.id === 'pacote_acabando' ? filtroPacoteAcabando
            : f.id === 'aniversariantes' ? filtroAniversariantes
            : filtroPendencia;
          const toggle = () => {
            if (f.id === 'atrasados') setFiltroAtrasados(v => !v);
            else if (f.id === 'pacote_acabando') setFiltroPacoteAcabando(v => !v);
            else if (f.id === 'aniversariantes') setFiltroAniversariantes(v => !v);
            else setFiltroPendencia(v => !v);
          };
          return (
            <button
              key={f.id}
              onClick={toggle}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 border transition-all ${
                ativo ? 'bg-[#00BFA5]/10 text-[#00BFA5] border-[#00BFA5]/30' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
              }`}
            >
              <i className={`fa-solid ${f.icon}`}></i>{f.titulo}
            </button>
          );
        })}
        {temFiltroAtivo && (
          <button
            onClick={() => {
              setSegmentoFiltro(new Set());
              setFiltroAtrasados(false);
              setFiltroPacoteAcabando(false);
              setFiltroAniversariantes(false);
              setFiltroPendencia(false);
            }}
            className="px-3 py-1.5 rounded-xl text-[11px] font-black text-rose-500 hover:bg-rose-50 transition-all"
          >
            Limpar filtros
          </button>
        )}
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
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-800 text-lg truncate group-hover:text-[#00BFA5] transition-colors">{client.nome}</h4>
                            {client.origem_id === 'cadastro_publico' && (
                              <span title="Cadastrado pelo link público" className="shrink-0 bg-indigo-50 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-indigo-100">
                                <i className="fa-solid fa-link mr-1"></i>Via Link
                              </span>
                            )}
                            {getSegmentosAtivos(segmentosPorCliente[String(client.id)]).slice(0, 1).map(seg => (
                              <span key={seg.id} title={seg.titulo} className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter border border-current ${seg.corBg} ${seg.corTexto}`}>
                                <i className={`fa-solid ${seg.icon} mr-1`}></i>{seg.titulo}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-slate-500 font-medium flex items-center">
                              <i className="fa-brands fa-whatsapp mr-1.5 text-emerald-500"></i>
                              {client.telefone}
                            </span>
                          </div>
                          {(petsPorCliente[String(client.id)] || []).length > 0 && (
                            <div className="flex items-center -space-x-2 mt-2">
                              {(petsPorCliente[String(client.id)] || []).slice(0, 5).map(pet => (
                                <div key={pet.id} title={pet.nome} className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-300 overflow-hidden shrink-0">
                                  {pet.foto_url ? (
                                    <img src={pet.foto_url} alt={pet.nome} className="w-full h-full object-cover" />
                                  ) : (
                                    <i className="fa-solid fa-paw text-[10px]"></i>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
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

      {isViaLinkOpen && (
        <ClientesViaLink
          unit={unit}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setIsViaLinkOpen(false)}
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
