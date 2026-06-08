
export interface Unit {
  id: string;
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
  id: string;
  nome: string;
  preco_base: number;
}

export type UserRole = 'master' | 'admin_unidade' | 'gerente' | 'financeiro' | 'atendente' | 'tosador' | 'somente_leitura' | 'comum' | 'administrador';

export interface Package {
  id: string;
  cliente_id: string;
  pet_id: string;
  unidade_id: string;
  servico_id: string;
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
  pacote_anterior_id?: string;
  ciclo_renovacao?: number;
}

export type SubView = 'Agendamento' | 'Clientes' | 'Pacotes' | 'Financeiro' | 'Gastos' | 'Auditoria';
export type GlobalView = 'Painel Geral' | 'Financeiro Geral' | 'Configurações' | 'Equipe' | 'Meu Perfil';

export interface NavigationState {
  mode: 'global' | 'unit';
  view: GlobalView | SubView;
  unitId?: string;
  unitName?: string;
}

export interface Client { 
  id: string; 
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
  unidade_preferencial_id: string; 
  unidade_id?: string;
  created_at?: string;
}

export interface Pet { 
  id: string; 
  cliente_id: string; 
  unidade_id?: string;
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

export interface Employee { id: string; name: string; role: string; unitId: string; }
export interface Appointment { 
  id: string; 
  pet_id: string; 
  cliente_id?: string;
  unidade_id: string;
  pacote_id?: string;
  numero_sessao?: number;
  funcionario_id?: string; 
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
export interface Transaction { id: string; type: 'Income' | 'Expense'; amount: number; date: string; description: string; unitId: string; }
