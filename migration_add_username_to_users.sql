-- Migration para adicionar coluna username na tabela users
-- Execute este SQL no SQL Editor do Supabase

-- Adicionar coluna username para permitir login por nome de usuário
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Criar índice para melhorar performance das queries por username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);


