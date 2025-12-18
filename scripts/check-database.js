import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pbifnqradvbvuuqvymji.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZucXJhZHZidnV1cXZ5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTE2OTMsImV4cCI6MjA4MTQ4NzY5M30.E5e4jFqhioAmBFRgt2bCKeS8Zv_0nHnseJ27EYibICI';

const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
  'users',
  'user_passwords',
  'customers',
  'customer_passwords',
  'cielo_terminals',
  'sales',
  'transfers',
  'customer_spreadsheets',
  'customer_taxes',
  'customer_card_values',
  'cielo_config'
];

async function checkDatabase() {
  console.log('🔍 Verificando banco de dados Supabase...\n');
  console.log(`URL: ${supabaseUrl}\n`);

  let allTablesExist = true;
  let totalRecords = 0;

  for (const table of tables) {
    try {
      // Tentar fazer uma query simples para verificar se a tabela existe
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: ERRO - ${error.message}`);
        allTablesExist = false;
      } else {
        const recordCount = count || 0;
        totalRecords += recordCount;
        console.log(`✅ ${table}: ${recordCount} registro(s)`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ERRO - ${err.message}`);
      allTablesExist = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Total de registros em todas as tabelas: ${totalRecords}`);
  console.log('='.repeat(50));

  // Verificar conexão de autenticação
  console.log('\n🔐 Testando autenticação...');
  try {
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.log(`❌ Erro na autenticação: ${authError.message}`);
    } else {
      console.log(`✅ Autenticação funcionando (sessão: ${session ? 'ativa' : 'nenhuma'})`);
    }
  } catch (err) {
    console.log(`❌ Erro ao verificar autenticação: ${err.message}`);
  }

  // Verificar usuários específicos
  console.log('\n👤 Verificando usuários...');
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email, role')
      .limit(10);

    if (usersError) {
      console.log(`❌ Erro ao buscar usuários: ${usersError.message}`);
    } else {
      if (users && users.length > 0) {
        console.log(`✅ Encontrados ${users.length} usuário(s):`);
        users.forEach(user => {
          console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
        });
      } else {
        console.log('⚠️  Nenhum usuário encontrado na tabela users');
      }
    }
  } catch (err) {
    console.log(`❌ Erro ao verificar usuários: ${err.message}`);
  }

  // Verificar clientes
  console.log('\n🏢 Verificando clientes...');
  try {
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, email, status')
      .limit(10);

    if (customersError) {
      console.log(`❌ Erro ao buscar clientes: ${customersError.message}`);
    } else {
      if (customers && customers.length > 0) {
        console.log(`✅ Encontrados ${customers.length} cliente(s):`);
        customers.forEach(customer => {
          console.log(`   - ${customer.name} (${customer.email || 'sem email'}) - ${customer.status || 'N/A'}`);
        });
      } else {
        console.log('⚠️  Nenhum cliente encontrado na tabela customers');
      }
    }
  } catch (err) {
    console.log(`❌ Erro ao verificar clientes: ${err.message}`);
  }

  console.log('\n' + '='.repeat(50));
  if (allTablesExist) {
    console.log('✅ Todas as tabelas estão acessíveis!');
  } else {
    console.log('⚠️  Algumas tabelas apresentaram erros. Verifique o schema do banco de dados.');
  }
  console.log('='.repeat(50));
}

checkDatabase().catch(console.error);



