-- Schema do Supabase para BR Fintech Dashboard
-- Execute este SQL no SQL Editor do Supabase

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'customer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  customer_id TEXT
);

-- Tabela de senhas de usuários (criptografadas)
CREATE TABLE IF NOT EXISTS user_passwords (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf_cnpj TEXT,
  region TEXT,
  total_purchases INTEGER DEFAULT 0,
  last_purchase DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  category TEXT,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de senhas de clientes (criptografadas)
CREATE TABLE IF NOT EXISTS customer_passwords (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de terminais Cielo
CREATE TABLE IF NOT EXISTS cielo_terminals (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  terminal_id TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de vendas
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  product TEXT,
  region TEXT,
  seller TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'cancelled')),
  payment_method TEXT,
  cielo_transaction_id TEXT,
  cielo_terminal_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de repasses
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  periodo TEXT,
  valor_bruto DECIMAL(10, 2) NOT NULL,
  taxas DECIMAL(10, 2) NOT NULL,
  valor_liquido DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('enviado', 'pendente', 'nao_enviado')),
  data_envio TIMESTAMPTZ,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de planilhas de clientes
CREATE TABLE IF NOT EXISTS customer_spreadsheets (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  terminal_id TEXT,
  reference_month TEXT,
  reference_date TEXT, -- Data específica para planilhas diárias (YYYY-MM-DD)
  type TEXT DEFAULT 'monthly' CHECK (type IN ('monthly', 'daily')), -- Tipo: mensal ou diária
  file_name TEXT, -- Nome do arquivo da planilha
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB NOT NULL,
  headers JSONB, -- Cabeçalhos das colunas da planilha
  sales JSONB, -- Dados estruturados de vendas
  original_file TEXT, -- Arquivo original em base64 para preservar formatação exata
  description TEXT -- Descrição da planilha (editável apenas por administradores)
);

-- Índices para melhorar performance das queries de planilhas
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_reference_date ON customer_spreadsheets(reference_date);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_type ON customer_spreadsheets(type);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_reference_month ON customer_spreadsheets(reference_month);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_customer_terminal ON customer_spreadsheets(customer_id, terminal_id);

-- Tabela de taxas de clientes
CREATE TABLE IF NOT EXISTS customer_taxes (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  tax_rate DECIMAL(5, 2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de valores de cards KPI
CREATE TABLE IF NOT EXISTS customer_card_values (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  terminal_id TEXT,
  quantidade_vendas INTEGER DEFAULT 0,
  valor_bruto DECIMAL(10, 2) DEFAULT 0,
  taxa DECIMAL(10, 2) DEFAULT 0,
  valor_liquido DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de configuração da API Cielo
CREATE TABLE IF NOT EXISTS cielo_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  api_url TEXT,
  merchant_id TEXT,
  merchant_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_customers_username ON customers(username);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_transfers_customer_id ON transfers(customer_id);
CREATE INDEX IF NOT EXISTS idx_cielo_terminals_customer_id ON cielo_terminals(customer_id);

-- Habilitar Row Level Security (RLS) - opcional, pode ser configurado depois
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

