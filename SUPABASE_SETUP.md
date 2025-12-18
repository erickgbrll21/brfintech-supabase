# Configuração do Supabase

Este documento explica como configurar o Supabase para o BR Fintech Dashboard.

## 📋 Pré-requisitos

1. Conta no Supabase (https://supabase.com)
2. Projeto criado no Supabase
3. Credenciais do projeto (URL e API Key)

## 🔧 Configuração

### 1. Variáveis de Ambiente

As credenciais do Supabase já estão configuradas no arquivo `.env`:

```env
VITE_SUPABASE_URL=https://pbifnqradvbvuuqvymji.supabase.co
VITE_SUPABASE_KEY=sb_publishable_dZkkFUeSgKu7Qdt8oSUdgw_25IwXUzC
```

### 2. Criar Tabelas no Supabase

1. Acesse o SQL Editor no painel do Supabase
2. Execute o script SQL do arquivo `supabase-schema.sql`
3. Verifique se todas as tabelas foram criadas com sucesso

### 3. Estrutura das Tabelas

O sistema utiliza as seguintes tabelas:

- **users** - Usuários do sistema (admin, user, customer)
- **user_passwords** - Senhas criptografadas dos usuários
- **customers** - Clientes cadastrados
- **customer_passwords** - Senhas criptografadas dos clientes
- **cielo_terminals** - Terminais/contas Cielo
- **sales** - Vendas registradas
- **transfers** - Repasses financeiros
- **customer_spreadsheets** - Planilhas de clientes
- **customer_taxes** - Taxas dos clientes
- **customer_card_values** - Valores dos cards KPI
- **cielo_config** - Configuração da API Cielo

## 🔐 Segurança

### Row Level Security (RLS)

Por padrão, o RLS está desabilitado. Para habilitar:

1. Acesse Authentication > Policies no painel do Supabase
2. Configure políticas de acesso conforme necessário
3. Ou execute os comandos SQL no final do arquivo `supabase-schema.sql`

### Criptografia de Senhas

As senhas são armazenadas com hash SHA-256 usando a biblioteca de criptografia do sistema. Nunca são armazenadas em texto plano.

## 🚀 Migração de Dados

O sistema está configurado para usar Supabase por padrão. Se houver dados no localStorage, eles não serão migrados automaticamente. Para migrar:

1. Exporte os dados do localStorage manualmente
2. Importe para o Supabase usando scripts ou a interface do Supabase

## 📝 Notas

- O sistema usa uma flag `USE_SUPABASE` no código para alternar entre Supabase e localStorage
- Em caso de erro na conexão com Supabase, o sistema faz fallback para localStorage
- Certifique-se de que as tabelas foram criadas antes de usar o sistema

## 🔍 Verificação

Para verificar se a conexão está funcionando:

1. Abra o console do navegador (F12)
2. Verifique se não há erros de conexão com Supabase
3. Tente fazer login com as credenciais do administrador
4. Verifique se os dados aparecem no painel do Supabase

