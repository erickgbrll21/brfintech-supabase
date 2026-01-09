-- Migration para adicionar coluna original_file na tabela customer_spreadsheets
-- Execute este SQL no SQL Editor do Supabase

-- Adicionar coluna para armazenar o arquivo original da planilha (em base64)
-- Isso garante que o download seja exatamente igual ao arquivo enviado
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS original_file TEXT;

-- Criar índice para melhorar performance (opcional)
-- CREATE INDEX IF NOT EXISTS idx_customer_spreadsheets_original_file ON customer_spreadsheets(id) WHERE original_file IS NOT NULL;


