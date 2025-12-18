import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pbifnqradvbvuuqvymji.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZucXJhZHZidnV1cXZ5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTE2OTMsImV4cCI6MjA4MTQ4NzY5M30.E5e4jFqhioAmBFRgt2bCKeS8Zv_0nHnseJ27EYibICI';

const supabase = createClient(supabaseUrl, supabaseKey);

const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function logTest(name, passed, error = null) {
  if (passed) {
    console.log(`✅ ${name}`);
    testResults.passed++;
  } else {
    console.log(`❌ ${name}`);
    if (error) {
      console.log(`   Erro: ${error.message || error}`);
      testResults.errors.push({ test: name, error: error.message || error });
    }
    testResults.failed++;
  }
}

async function testUsersOperations() {
  console.log('\n📝 Testando operações na tabela USERS...');
  
  const testUserId = `test_user_${Date.now()}`;
  const testUser = {
    id: testUserId,
    name: 'Usuário Teste',
    email: `teste_${Date.now()}@teste.com`,
    role: 'user'
  };

  try {
    // CREATE
    const { data: createdUser, error: createError } = await supabase
      .from('users')
      .insert(testUser)
      .select()
      .single();
    
    logTest('CREATE user', !createError && createdUser, createError);

    if (createdUser) {
      // READ
      const { data: readUser, error: readError } = await supabase
        .from('users')
        .select('*')
        .eq('id', testUserId)
        .single();
      
      logTest('READ user', !readError && readUser && readUser.email === testUser.email, readError);

      // UPDATE
      const updatedName = 'Usuário Teste Atualizado';
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ name: updatedName })
        .eq('id', testUserId)
        .select()
        .single();
      
      logTest('UPDATE user', !updateError && updatedUser && updatedUser.name === updatedName, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', testUserId);
      
      logTest('DELETE user', !deleteError, deleteError);
    }
  } catch (err) {
    logTest('Users operations', false, err);
  }
}

async function testCustomersOperations() {
  console.log('\n📝 Testando operações na tabela CUSTOMERS...');
  
  const testCustomerId = `test_customer_${Date.now()}`;
  const testCustomer = {
    id: testCustomerId,
    name: 'Cliente Teste',
    email: `cliente_${Date.now()}@teste.com`,
    phone: '11999999999',
    cpf_cnpj: '12345678900',
    region: 'São Paulo',
    status: 'active'
  };

  try {
    // CREATE
    const { data: createdCustomer, error: createError } = await supabase
      .from('customers')
      .insert(testCustomer)
      .select()
      .single();
    
    logTest('CREATE customer', !createError && createdCustomer, createError);

    if (createdCustomer) {
      // READ
      const { data: readCustomer, error: readError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', testCustomerId)
        .single();
      
      logTest('READ customer', !readError && readCustomer && readCustomer.name === testCustomer.name, readError);

      // UPDATE
      const updatedName = 'Cliente Teste Atualizado';
      const { data: updatedCustomer, error: updateError } = await supabase
        .from('customers')
        .update({ name: updatedName })
        .eq('id', testCustomerId)
        .select()
        .single();
      
      logTest('UPDATE customer', !updateError && updatedCustomer && updatedCustomer.name === updatedName, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('customers')
        .delete()
        .eq('id', testCustomerId);
      
      logTest('DELETE customer', !deleteError, deleteError);
    }
  } catch (err) {
    logTest('Customers operations', false, err);
  }
}

async function testCieloTerminalsOperations() {
  console.log('\n📝 Testando operações na tabela CIELO_TERMINALS...');
  
  // Primeiro criar um customer para vincular
  const testCustomerId = `test_customer_terminal_${Date.now()}`;
  const { data: testCustomer } = await supabase
    .from('customers')
    .insert({
      id: testCustomerId,
      name: 'Cliente Terminal Teste',
      email: `cliente_terminal_${Date.now()}@teste.com`,
      status: 'active'
    })
    .select()
    .single();

  if (!testCustomer) {
    logTest('CREATE cielo_terminal (setup)', false, 'Não foi possível criar customer de teste');
    return;
  }

  const testTerminalId = `test_terminal_${Date.now()}`;
  const testTerminal = {
    id: testTerminalId,
    customer_id: testCustomerId,
    terminal_id: `TERM${Date.now()}`,
    name: 'Terminal Teste'
  };

  try {
    // CREATE
    const { data: createdTerminal, error: createError } = await supabase
      .from('cielo_terminals')
      .insert(testTerminal)
      .select()
      .single();
    
    logTest('CREATE cielo_terminal', !createError && createdTerminal, createError);

    if (createdTerminal) {
      // READ
      const { data: readTerminal, error: readError } = await supabase
        .from('cielo_terminals')
        .select('*')
        .eq('id', testTerminalId)
        .single();
      
      logTest('READ cielo_terminal', !readError && readTerminal, readError);

      // UPDATE
      const updatedName = 'Terminal Teste Atualizado';
      const { data: updatedTerminal, error: updateError } = await supabase
        .from('cielo_terminals')
        .update({ name: updatedName })
        .eq('id', testTerminalId)
        .select()
        .single();
      
      logTest('UPDATE cielo_terminal', !updateError && updatedTerminal && updatedTerminal.name === updatedName, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('cielo_terminals')
        .delete()
        .eq('id', testTerminalId);
      
      logTest('DELETE cielo_terminal', !deleteError, deleteError);
    }

    // Limpar customer de teste
    await supabase.from('customers').delete().eq('id', testCustomerId);
  } catch (err) {
    logTest('Cielo terminals operations', false, err);
  }
}

async function testTransfersOperations() {
  console.log('\n📝 Testando operações na tabela TRANSFERS...');
  
  // Primeiro criar um customer para vincular
  const testCustomerId = `test_customer_transfer_${Date.now()}`;
  const { data: testCustomer } = await supabase
    .from('customers')
    .insert({
      id: testCustomerId,
      name: 'Cliente Transfer Teste',
      email: `cliente_transfer_${Date.now()}@teste.com`,
      status: 'active'
    })
    .select()
    .single();

  if (!testCustomer) {
    logTest('CREATE transfer (setup)', false, 'Não foi possível criar customer de teste');
    return;
  }

  const testTransferId = `test_transfer_${Date.now()}`;
  const testTransfer = {
    id: testTransferId,
    customer_id: testCustomerId,
    customer_name: 'Cliente Transfer Teste',
    periodo: 'Dezembro/2024',
    valor_bruto: 1000.50,
    taxas: 25.01,
    valor_liquido: 975.49,
    status: 'pendente'
  };

  try {
    // CREATE
    const { data: createdTransfer, error: createError } = await supabase
      .from('transfers')
      .insert(testTransfer)
      .select()
      .single();
    
    logTest('CREATE transfer', !createError && createdTransfer, createError);

    if (createdTransfer) {
      // READ
      const { data: readTransfer, error: readError } = await supabase
        .from('transfers')
        .select('*')
        .eq('id', testTransferId)
        .single();
      
      logTest('READ transfer', !readError && readTransfer && readTransfer.valor_bruto === testTransfer.valor_bruto, readError);

      // UPDATE
      const updatedStatus = 'enviado';
      const { data: updatedTransfer, error: updateError } = await supabase
        .from('transfers')
        .update({ status: updatedStatus })
        .eq('id', testTransferId)
        .select()
        .single();
      
      logTest('UPDATE transfer', !updateError && updatedTransfer && updatedTransfer.status === updatedStatus, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('transfers')
        .delete()
        .eq('id', testTransferId);
      
      logTest('DELETE transfer', !deleteError, deleteError);
    }

    // Limpar customer de teste
    await supabase.from('customers').delete().eq('id', testCustomerId);
  } catch (err) {
    logTest('Transfers operations', false, err);
  }
}

async function testCustomerSpreadsheetsOperations() {
  console.log('\n📝 Testando operações na tabela CUSTOMER_SPREADSHEETS...');
  
  // Primeiro criar um customer para vincular
  const testCustomerId = `test_customer_spreadsheet_${Date.now()}`;
  const { data: testCustomer } = await supabase
    .from('customers')
    .insert({
      id: testCustomerId,
      name: 'Cliente Spreadsheet Teste',
      email: `cliente_spreadsheet_${Date.now()}@teste.com`,
      status: 'active'
    })
    .select()
    .single();

  if (!testCustomer) {
    logTest('CREATE customer_spreadsheet (setup)', false, 'Não foi possível criar customer de teste');
    return;
  }

  const testSpreadsheetId = `test_spreadsheet_${Date.now()}`;
  const testSpreadsheet = {
    id: testSpreadsheetId,
    customer_id: testCustomerId,
    file_name: 'teste.xlsx',
    reference_month: '2024-12',
    type: 'monthly',
    data: JSON.stringify({ test: 'data' })
  };

  try {
    // CREATE
    const { data: createdSpreadsheet, error: createError } = await supabase
      .from('customer_spreadsheets')
      .insert(testSpreadsheet)
      .select()
      .single();
    
    logTest('CREATE customer_spreadsheet', !createError && createdSpreadsheet, createError);

    if (createdSpreadsheet) {
      // READ
      const { data: readSpreadsheet, error: readError } = await supabase
        .from('customer_spreadsheets')
        .select('*')
        .eq('id', testSpreadsheetId)
        .single();
      
      logTest('READ customer_spreadsheet', !readError && readSpreadsheet && readSpreadsheet.file_name === testSpreadsheet.file_name, readError);

      // UPDATE
      const updatedFileName = 'teste_atualizado.xlsx';
      const { data: updatedSpreadsheet, error: updateError } = await supabase
        .from('customer_spreadsheets')
        .update({ file_name: updatedFileName })
        .eq('id', testSpreadsheetId)
        .select()
        .single();
      
      logTest('UPDATE customer_spreadsheet', !updateError && updatedSpreadsheet && updatedSpreadsheet.file_name === updatedFileName, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('customer_spreadsheets')
        .delete()
        .eq('id', testSpreadsheetId);
      
      logTest('DELETE customer_spreadsheet', !deleteError, deleteError);
    }

    // Limpar customer de teste
    await supabase.from('customers').delete().eq('id', testCustomerId);
  } catch (err) {
    logTest('Customer spreadsheets operations', false, err);
  }
}

async function testCustomerCardValuesOperations() {
  console.log('\n📝 Testando operações na tabela CUSTOMER_CARD_VALUES...');
  
  // Primeiro criar um customer para vincular
  const testCustomerId = `test_customer_card_${Date.now()}`;
  const { data: testCustomer } = await supabase
    .from('customers')
    .insert({
      id: testCustomerId,
      name: 'Cliente Card Teste',
      email: `cliente_card_${Date.now()}@teste.com`,
      status: 'active'
    })
    .select()
    .single();

  if (!testCustomer) {
    logTest('CREATE customer_card_values (setup)', false, 'Não foi possível criar customer de teste');
    return;
  }

  const testCardValueId = `test_card_${Date.now()}`;
  const testCardValue = {
    id: testCardValueId,
    customer_id: testCustomerId,
    valor_bruto: 5000.00,
    taxa: 2.5,
    valor_liquido: 4875.00
  };

  try {
    // CREATE
    const { data: createdCardValue, error: createError } = await supabase
      .from('customer_card_values')
      .insert(testCardValue)
      .select()
      .single();
    
    logTest('CREATE customer_card_values', !createError && createdCardValue, createError);

    if (createdCardValue) {
      // READ
      const { data: readCardValue, error: readError } = await supabase
        .from('customer_card_values')
        .select('*')
        .eq('id', testCardValueId)
        .single();
      
      logTest('READ customer_card_values', !readError && readCardValue && readCardValue.valor_bruto === testCardValue.valor_bruto, readError);

      // UPDATE
      const updatedValorBruto = 6000.00;
      const { data: updatedCardValue, error: updateError } = await supabase
        .from('customer_card_values')
        .update({ valor_bruto: updatedValorBruto })
        .eq('id', testCardValueId)
        .select()
        .single();
      
      logTest('UPDATE customer_card_values', !updateError && updatedCardValue && updatedCardValue.valor_bruto === updatedValorBruto, updateError);

      // DELETE
      const { error: deleteError } = await supabase
        .from('customer_card_values')
        .delete()
        .eq('id', testCardValueId);
      
      logTest('DELETE customer_card_values', !deleteError, deleteError);
    }

    // Limpar customer de teste
    await supabase.from('customers').delete().eq('id', testCustomerId);
  } catch (err) {
    logTest('Customer card values operations', false, err);
  }
}

async function testUserPasswordsOperations() {
  console.log('\n📝 Testando operações na tabela USER_PASSWORDS...');
  
  // Primeiro criar um user para vincular
  const testUserId = `test_user_pwd_${Date.now()}`;
  const { data: testUser } = await supabase
    .from('users')
    .insert({
      id: testUserId,
      name: 'Usuário Password Teste',
      email: `user_pwd_${Date.now()}@teste.com`,
      role: 'user'
    })
    .select()
    .single();

  if (!testUser) {
    logTest('CREATE user_passwords (setup)', false, 'Não foi possível criar user de teste');
    return;
  }

  const testPassword = {
    user_id: testUserId,
    password_hash: 'hash_teste_123456'
  };

  try {
    // CREATE
    const { data: createdPassword, error: createError } = await supabase
      .from('user_passwords')
      .insert(testPassword)
      .select()
      .single();
    
    logTest('CREATE user_passwords', !createError && createdPassword, createError);

    if (createdPassword) {
      // READ
      const { data: readPassword, error: readError } = await supabase
        .from('user_passwords')
        .select('*')
        .eq('user_id', testUserId)
        .single();
      
      logTest('READ user_passwords', !readError && readPassword, readError);

      // UPDATE
      const updatedHash = 'hash_atualizado_789012';
      const { data: updatedPassword, error: updateError } = await supabase
        .from('user_passwords')
        .update({ password_hash: updatedHash })
        .eq('user_id', testUserId)
        .select()
        .single();
      
      logTest('UPDATE user_passwords', !updateError && updatedPassword && updatedPassword.password_hash === updatedHash, updateError);

      // DELETE (vai deletar automaticamente quando deletar o user devido ao CASCADE)
      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .eq('id', testUserId);
      
      logTest('DELETE user_passwords (via CASCADE)', !deleteUserError, deleteUserError);
    }
  } catch (err) {
    logTest('User passwords operations', false, err);
    // Limpar user de teste em caso de erro
    await supabase.from('users').delete().eq('id', testUserId);
  }
}

async function runAllTests() {
  console.log('🧪 TESTE COMPLETO DE OPERAÇÕES DO BANCO DE DADOS');
  console.log('='.repeat(60));
  console.log(`URL: ${supabaseUrl}\n`);

  await testUsersOperations();
  await testCustomersOperations();
  await testCieloTerminalsOperations();
  await testTransfersOperations();
  await testCustomerSpreadsheetsOperations();
  await testCustomerCardValuesOperations();
  await testUserPasswordsOperations();

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS TESTES');
  console.log('='.repeat(60));
  console.log(`✅ Testes passados: ${testResults.passed}`);
  console.log(`❌ Testes falhados: ${testResults.failed}`);
  console.log(`📈 Taxa de sucesso: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(2)}%`);

  if (testResults.errors.length > 0) {
    console.log('\n⚠️  ERROS ENCONTRADOS:');
    testResults.errors.forEach(({ test, error }) => {
      console.log(`   - ${test}: ${error}`);
    });
  }

  console.log('='.repeat(60));

  if (testResults.failed === 0) {
    console.log('✅ TODOS OS TESTES PASSARAM! O banco de dados está funcionando corretamente.');
  } else {
    console.log('⚠️  Alguns testes falharam. Verifique os erros acima.');
  }
}

runAllTests().catch(console.error);

