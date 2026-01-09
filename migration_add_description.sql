-- Migration para adicionar coluna description na tabela customer_spreadsheets
-- Execute este SQL no SQL Editor do Supabase

-- Adicionar coluna description para permitir que administradores adicionem descrições às planilhas
ALTER TABLE customer_spreadsheets 
ADD COLUMN IF NOT EXISTS description TEXT;


