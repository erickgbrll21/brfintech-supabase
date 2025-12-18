-- Migration para adicionar colunas faltantes na tabela customer_spreadsheets
-- Execute este SQL no SQL Editor do Supabase

-- Adicionar coluna reference_date para planilhas diárias
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS reference_date TEXT;

-- Adicionar coluna type para diferenciar planilhas mensais e diárias
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'monthly' CHECK (type IN ('monthly', 'daily'));

-- Adicionar coluna file_name para armazenar o nome do arquivo
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Adicionar coluna headers para armazenar os cabeçalhos da planilha
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS headers JSONB;

-- Adicionar coluna sales para armazenar os dados estruturados de vendas
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS sales JSONB;

-- Criar índices para melhorar performance das queries
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_reference_date ON customer_spreadsheets(reference_date);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_type ON customer_spreadsheets(type);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_reference_month ON customer_spreadsheets(reference_month);
CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_customer_terminal ON customer_spreadsheets(customer_id, terminal_id);
