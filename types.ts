
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
export type GlobalView = 'Painel Geral' | 'Financeiro Geral' | 'Configurações' | 'Equipe' | 'Meu Perfil';

export interface NavigationState {
  mode: 'global' | 'unit';
  view: GlobalView | SubView;
  unitId?: UiId;
  unitName?: string;
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
  created_at?: string;
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
