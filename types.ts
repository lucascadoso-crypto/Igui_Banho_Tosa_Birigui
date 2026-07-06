
export type BusinessId = number;
export type UiId = BusinessId | string;

export interface Unit {
  id: BusinessId;
  name: string;
  endereco_completo?: string;
  phone?: string;
  whatsapp_nome_instancia?: string;
  whatsapp_token?: string;
  whatsapp_url_servidor?: string;
  whatsapp_ativo?: boolean;
}

export interface SystemConfig {
  id: number;
  nome_fantasia: string;
  logo_url: string;
}

export interface Service {
  id: BusinessId;
  nome: string;
  preco_base: number;
}

export type UserRole = 'master' | 'admin_unidade' | 'gerente' | 'financeiro' | 'atendente' | 'tosador' | 'somente_leitura' | 'comum' | 'administrador';

// Espelha a tabela public.funcionarios. cargo aceita 'pendente' porque
// App.tsx usa esse valor como fallback quando o login não tem funcionario
// vinculado ainda (ver fetchProfile em App.tsx).
export interface UserProfile {
  id?: BusinessId;
  user_id?: string;
  unidade_id?: BusinessId;
  nome: string;
  email?: string;
  telefone?: string;
  cargo: UserRole | 'pendente';
  ativo: boolean;
  foto_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Package {
  id: BusinessId;
  cliente_id: BusinessId;
  pet_id: BusinessId;
  unidade_id: BusinessId;
  servico_id: BusinessId;
  qtd_sessoes: number;
  valor_total: number;
  status: string;
  pago: boolean;
  forma_pagamento?: string;
  data_pagamento?: string;
  created_at?: string;
  pets?: Pet;
  clientes?: Client;
  servicos?: Service;
  pacote_anterior_id?: BusinessId;
  ciclo_renovacao?: number;
}

export type SubView = 'Agendamento' | 'Clientes' | 'Pacotes' | 'Financeiro' | 'Gastos' | 'Auditoria';
export type GlobalView = 'Dashboard' | 'Financeiro Geral' | 'Rentabilidade' | 'Configurações' | 'Equipe' | 'Meu Perfil';

export interface NavigationState {
  mode: 'global' | 'unit';
  view: GlobalView | SubView;
  unitId?: UiId;
  unitName?: string;
  /** Aba inicial ao navegar para 'Configurações' (ex: 'custos' vindo do botão de custos do Dashboard). */
  settingsTab?: string;
}

export interface Client { 
  id: BusinessId; 
  nome: string; 
  telefone: string; 
  telefone_adicional?: string;
  email?: string; 
  cpf?: string;
  data_nascimento?: string;
  nacionalidade?: string;
  genero?: string;
  receber_msgs?: boolean; 
  notas_internas?: string;
  restricoes?: string;
  logradouro?: string;
  cep?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  cidade?: string;
  estado?: string;
  unidade_preferencial_id: BusinessId;
  unidade_id?: BusinessId;
  origem_id?: string;
  ativo?: boolean;
  mesclado_no_cliente_id?: BusinessId | null;
  created_at?: string;
}

// Fila de revisão manual de possíveis duplicados vindos do link público
// (espelha public.clientes_duplicados_pendentes).
export interface ClienteDuplicadoPendente {
  id: BusinessId;
  cliente_id_existente: BusinessId;
  cliente_id_novo: BusinessId;
  unidade_id: BusinessId;
  motivo: 'nome_similar' | 'retroativo_telefone' | string;
  similaridade?: number | null;
  status: 'pendente' | 'mesclado' | 'rejeitado';
  resolvido_em?: string | null;
  created_at?: string;
  cliente_existente?: Client;
  cliente_novo?: Client;
}

// Log de merges automáticos/manuais de clientes, para auditoria e reversão
// (espelha public.clientes_merge_log).
export interface ClienteMergeLog {
  id: BusinessId;
  cliente_id: BusinessId;
  unidade_id: BusinessId;
  origem: 'cadastro_publico' | 'mesclagem_manual' | string;
  cliente_removido_id?: BusinessId | null;
  campos_alterados: Record<string, { antes: any; depois: any }>;
  created_at?: string;
  cliente?: Client;
}

export interface Pet { 
  id: BusinessId; 
  cliente_id: BusinessId; 
  unidade_id?: BusinessId;
  nome: string; 
  data_nascimento?: string;
  genero?: string;
  especie?: string; 
  raca?: string;
  porte?: string; 
  comportamento?: string;
  notas_internas?: string;
  restricoes?: string;
  foto_url?: string | null;
  created_at?: string;
}

export interface Employee { id: BusinessId; name: string; role: string; unitId: BusinessId; }
export interface Appointment { 
  id: BusinessId; 
  pet_id: BusinessId; 
  cliente_id?: BusinessId;
  unidade_id: BusinessId;
  pacote_id?: BusinessId;
  numero_sessao?: number;
  funcionario_id?: BusinessId; 
  data_agendamento: string; 
  horario_inicio: string; 
  horario_fim?: string;
  valor_total: number; 
  valor_transporte?: number;
  tem_taxi?: boolean;
  status: string; 
  pago?: boolean;
  forma_pagamento?: string;
  valor_extra_total?: number;
  status_pagamento_extra?: 'PENDENTE' | 'PAGO' | 'NÃO POSSUI';
  forma_pagamento_extra?: string;
  data_pagamento_extra?: string;
  data_inicio_real?: string;
  data_fim_real?: string;
}
export interface Transaction { id: BusinessId; type: 'Income' | 'Expense'; amount: number; date: string; description: string; unitId: BusinessId; }
