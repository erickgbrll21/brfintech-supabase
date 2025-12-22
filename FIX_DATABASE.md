# 🔧 Correção do Banco de Dados - Bug de Mudança de Data

## Problema Identificado

A tabela `customer_spreadsheets` está faltando colunas essenciais para o funcionamento correto das planilhas diárias:
- `reference_date` - Data específica para planilhas diárias
- `type` - Tipo de planilha (monthly/daily)
- `file_name` - Nome do arquivo
- `headers` - Cabeçalhos das colunas
- `sales` - Dados estruturados de vendas

## Solução

Execute o arquivo SQL `migration_add_reference_date_and_type.sql` no SQL Editor do Supabase para adicionar as colunas faltantes.

## Passos para Corrigir

1. Acesse o painel do Supabase
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo do arquivo `migration_add_reference_date_and_type.sql`
4. Verifique se as colunas foram criadas corretamente

## Verificação

Após executar a migration, verifique se as colunas foram criadas:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customer_spreadsheets';
```

Você deve ver as seguintes colunas:
- reference_date (TEXT)
- type (TEXT)
- file_name (TEXT)
- headers (JSONB)
- sales (JSONB)


