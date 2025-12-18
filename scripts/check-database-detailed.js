import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pbifnqradvbvuuqvymji.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZucXJhZHZidnV1cXZ5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTE2OTMsImV4cCI6MjA4MTQ4NzY5M30.E5e4jFqhioAmBFRgt2bCKeS8Zv_0nHnseJ27EYibICI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDetailedDatabase() {
  console.log('🔍 Verificação Detalhada do Banco de Dados\n');
  console.log('='.repeat(60));

  // 1. Verificar estrutura de usuários e senhas
  console.log('\n1️⃣ Verificando integridade: users ↔ user_passwords');
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, customer_id');
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${users.length} usuário(s) encontrado(s)`);
      
      for (const user of users) {
        const { data: password, error: pwdError } = await supabase
          .from('user_passwords')
          .select('user_id')
          .eq('user_id', user.id)
          .single();
        
        if (pwdError && pwdError.code !== 'PGRST116') {
          console.log(`   ⚠️  Usuário ${user.name} (${user.email}): Erro ao verificar senha - ${pwdError.message}`);
        } else if (!password) {
          console.log(`   ⚠️  Usuário ${user.name} (${user.email}): Sem senha cadastrada`);
        } else {
          console.log(`   ✅ Usuário ${user.name} (${user.email}): Senha cadastrada`);
        }
        
        if (user.role === 'customer' && user.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', user.customer_id)
            .single();
          
          if (customer) {
            console.log(`      → Vinculado ao cliente: ${customer.name}`);
          } else {
            console.log(`      ⚠️  Cliente vinculado não encontrado (ID: ${user.customer_id})`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 2. Verificar estrutura de clientes e senhas
  console.log('\n2️⃣ Verificando integridade: customers ↔ customer_passwords');
  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, name, email');
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${customers.length} cliente(s) encontrado(s)`);
      
      for (const customer of customers) {
        const { data: password, error: pwdError } = await supabase
          .from('customer_passwords')
          .select('customer_id')
          .eq('customer_id', customer.id)
          .single();
        
        if (pwdError && pwdError.code !== 'PGRST116') {
          console.log(`   ⚠️  Cliente ${customer.name}: Erro ao verificar senha - ${pwdError.message}`);
        } else if (!password) {
          console.log(`   ⚠️  Cliente ${customer.name}: Sem senha cadastrada`);
        } else {
          console.log(`   ✅ Cliente ${customer.name}: Senha cadastrada`);
        }
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 3. Verificar terminais Cielo
  console.log('\n3️⃣ Verificando terminais Cielo');
  try {
    const { data: terminals, error } = await supabase
      .from('cielo_terminals')
      .select('id, customer_id, terminal_id, name');
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${terminals.length} terminal(is) encontrado(s)`);
      
      for (const terminal of terminals) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, name')
          .eq('id', terminal.customer_id)
          .single();
        
        if (customer) {
          console.log(`   ✅ Terminal ${terminal.terminal_id} (${terminal.name || 'sem nome'}) → Cliente: ${customer.name}`);
        } else {
          console.log(`   ⚠️  Terminal ${terminal.terminal_id}: Cliente não encontrado (ID: ${terminal.customer_id})`);
        }
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 4. Verificar repasses (transfers)
  console.log('\n4️⃣ Verificando repasses (transfers)');
  try {
    const { data: transfers, error } = await supabase
      .from('transfers')
      .select('id, customer_id, customer_name, periodo, valor_bruto, status')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${transfers.length} repasse(s) encontrado(s)`);
      
      for (const transfer of transfers) {
        console.log(`   - ${transfer.periodo || 'Sem período'}: R$ ${transfer.valor_bruto || 0} (${transfer.status || 'N/A'})`);
        if (transfer.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', transfer.customer_id)
            .single();
          
          if (!customer) {
            console.log(`      ⚠️  Cliente vinculado não encontrado (ID: ${transfer.customer_id})`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 5. Verificar planilhas de clientes
  console.log('\n5️⃣ Verificando planilhas de clientes');
  try {
    const { data: spreadsheets, error } = await supabase
      .from('customer_spreadsheets')
      .select('id, customer_id, file_name, reference_month, reference_date, type')
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${spreadsheets.length} planilha(s) encontrada(s)`);
      
      for (const spreadsheet of spreadsheets) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, name')
          .eq('id', spreadsheet.customer_id)
          .single();
        
        const customerName = customer ? customer.name : `ID: ${spreadsheet.customer_id}`;
        console.log(`   - ${spreadsheet.file_name || 'Sem nome'}: ${spreadsheet.reference_month || spreadsheet.reference_date || 'Sem data'} (${spreadsheet.type || 'N/A'}) → ${customerName}`);
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 6. Verificar valores customizados dos cards
  console.log('\n6️⃣ Verificando valores customizados dos cards');
  try {
    const { data: cardValues, error } = await supabase
      .from('customer_card_values')
      .select('id, customer_id, valor_bruto, taxa, valor_liquido');
    
    if (error) {
      console.log(`❌ Erro: ${error.message}`);
    } else {
      console.log(`✅ ${cardValues.length} registro(s) de valores customizados encontrado(s)`);
      
      for (const cardValue of cardValues) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, name')
          .eq('id', cardValue.customer_id)
          .single();
        
        const customerName = customer ? customer.name : `ID: ${cardValue.customer_id}`;
        console.log(`   - ${customerName}: Bruto: R$ ${cardValue.valor_bruto || 0}, Taxa: ${cardValue.taxa || 0}%, Líquido: R$ ${cardValue.valor_liquido || 0}`);
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  // 7. Teste de escrita (INSERT)
  console.log('\n7️⃣ Testando operações de escrita...');
  try {
    // Criar um registro de teste temporário
    const testData = {
      id: `test_${Date.now()}`,
      name: 'Teste de Integridade',
      email: `test_${Date.now()}@test.com`,
      role: 'user'
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(testData)
      .select()
      .single();
    
    if (insertError) {
      console.log(`❌ Erro ao inserir teste: ${insertError.message}`);
    } else {
      console.log(`✅ Inserção funcionando: ${inserted.name} criado`);
      
      // Deletar o registro de teste
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', testData.id);
      
      if (deleteError) {
        console.log(`⚠️  Erro ao deletar teste: ${deleteError.message}`);
      } else {
        console.log(`✅ Deleção funcionando: registro de teste removido`);
      }
    }
  } catch (err) {
    console.log(`❌ Erro: ${err.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Verificação detalhada concluída!');
  console.log('='.repeat(60));
}

checkDetailedDatabase().catch(console.error);

