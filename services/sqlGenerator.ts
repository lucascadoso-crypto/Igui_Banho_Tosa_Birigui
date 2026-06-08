
export const generateSupabaseSQL = () => {
  return `-- Schema V2 agora e mantido por migrations versionadas.
-- Consulte a pasta supabase/migrations.
-- Este visualizador legado foi preservado apenas para compatibilidade da tela.
`;
};

export const generateLegacySupabaseSQL = () => {
  return `-- SQL legado para iG Banho e Tosa - Estrutura Supabase / PostgreSQL

-- 1. Criação das Tabelas

CREATE TABLE IF NOT EXISTS config_sistema (
    id SERIAL PRIMARY KEY,
    nome_fantasia TEXT NOT NULL,
    logo_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO config_sistema (id, nome_fantasia, logo_url) 
VALUES (1, 'iG Banho e Tosa', '')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS unidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    endereco_completo TEXT,
    telefone TEXT,
    whatsapp_nome_instancia TEXT,
    whatsapp_token TEXT,
    whatsapp_url_servidor TEXT,
    whatsapp_ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    telefone TEXT,
    telefone_adicional TEXT,
    email TEXT,
    cpf TEXT,
    data_nascimento DATE,
    nacionalidade TEXT DEFAULT 'Brasil',
    genero TEXT,
    receber_msgs BOOLEAN DEFAULT TRUE,
    notas_internas TEXT,
    restricoes TEXT,
    logradouro TEXT,
    cep TEXT,
    numero TEXT,
    bairro TEXT,
    complemento TEXT,
    cidade TEXT,
    estado TEXT,
    foto_url TEXT,
    unidade_preferencial_id UUID REFERENCES unidades(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    data_nascimento DATE,
    genero TEXT,
    especie TEXT, 
    raca TEXT,
    porte TEXT, 
    comportamento TEXT,
    notas_internas TEXT,
    restricoes TEXT,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    preco_base DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pacotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT,
    nome_pacote TEXT,
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES unidades(id),
    servico_id UUID REFERENCES servicos(id),
    qtd_sessoes INTEGER NOT NULL DEFAULT 4,
    valor_total DECIMAL(10,2) NOT NULL,
    valor_transporte DECIMAL(10,2) DEFAULT 0.00,
    forma_pagamento TEXT,
    data_pagamento DATE,
    pago BOOLEAN DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'ATIVO',
    renovacao_automatica BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funcionarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    cargo TEXT DEFAULT 'pendente',
    unidade_id UUID REFERENCES unidades(id),
    ativa BOOLEAN DEFAULT FALSE,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID REFERENCES pets(id),
    pacote_id UUID REFERENCES pacotes(id) ON DELETE SET NULL,
    numero_sessao INTEGER,
    funcionario_id UUID REFERENCES funcionarios(id),
    unidade_id UUID REFERENCES unidades(id), 
    data_agendamento DATE NOT NULL,
    horario_inicio TIME NOT NULL,
    valor_total DECIMAL(10,2) DEFAULT 0.00,
    status TEXT DEFAULT 'Agendado', 
    pago BOOLEAN DEFAULT FALSE,
    forma_pagamento TEXT,
    tem_taxi BOOLEAN DEFAULT FALSE,
    endereco_busca TEXT,
    lembrete_enviado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agendamento_id UUID REFERENCES agendamentos(id) ON DELETE CASCADE,
    servico_id UUID REFERENCES servicos(id),
    valor_cobrado DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES unidades(id),
    nome_item TEXT NOT NULL,
    descricao TEXT,
    quantidade INTEGER DEFAULT 1,
    valor_total DECIMAL(10,2) NOT NULL,
    data_despesa DATE DEFAULT CURRENT_DATE,
    comprovante_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financeiro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES unidades(id), 
    tipo TEXT CHECK (tipo IN ('Receita', 'Despesa')),
    valor DECIMAL(10,2) NOT NULL,
    data DATE DEFAULT CURRENT_DATE,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS servicos_unidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    servico_id UUID REFERENCES servicos(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(servico_id, unidade_id)
);

CREATE TABLE IF NOT EXISTS logs_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
    nome_cliente TEXT,
    nome_pet TEXT,
    telefone TEXT,
    tipo_agendamento TEXT,
    status TEXT,
    mensagem TEXT,
    detalhe_erro TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
    usuario_nome TEXT,
    usuario_email TEXT,
    acao TEXT,
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Inserts Iniciais
INSERT INTO unidades (id, nome, endereco_completo, telefone) VALUES 
('11111111-1111-1111-1111-111111111111', 'Primavera', 'Rua das Flores, 123', '(11) 4002-8922'),
('22222222-2222-2222-2222-222222222222', 'Birigui', 'Av. Brasil, 456', '(18) 3641-0000'),
('33333333-3333-3333-3333-333333333333', 'Concórdia', 'Praça Central, 789', '(11) 5555-4444')
ON CONFLICT (id) DO NOTHING;


-- 3. Automação de Perfis (Trigger para auth.users)
-- Este gatilho monitora a tabela de autenticação do Supabase (auth.users) e cria automaticamente
-- o registo correspondente na tabela de funcionários (public.funcionarios) com o cargo correspondente.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first BOOLEAN;
  initial_cargo TEXT := 'pendente';
  is_active BOOLEAN := false;
  display_name TEXT;
BEGIN
  -- Verificar se é o primeiro funcionário cadastrado na tabela de funcionários
  SELECT NOT EXISTS (SELECT 1 FROM public.funcionarios) INTO is_first;
  
  -- Se for o primeiro usuário OU for o e-mail de administrador lucas.cadoso@gmail.com
  IF is_first OR NEW.email = 'lucas.cadoso@gmail.com' THEN
    initial_cargo := 'master';
    is_active := true;
  END IF;

  -- Obter um nome amigável a partir dos metadados ou do prefixo do e-mail
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'full_name',
    INITCAP(SPLIT_PART(NEW.email, '@', 1)),
    'Novo Funcionário'
  );

  -- Inserir na tabela de funcionários mapeando o ID do Auth
  INSERT INTO public.funcionarios (id, nome, email, cargo, ativa)
  VALUES (NEW.id, display_name, NEW.email, initial_cargo, is_active)
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    nome = COALESCE(public.funcionarios.nome, EXCLUDED.nome);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove o trigger se já existir para evitar duplicados caso o script seja executado mais de uma vez
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Cria o gatilho associado ao evento de inserção em auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;
};
