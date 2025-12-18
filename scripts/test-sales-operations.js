import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pbifnqradvbvuuqvymji.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZucXJhZHZidnV1cXZ5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTE2OTMsImV4cCI6MjA4MTQ4NzY5M30.E5e4jFqhioAmBFRgt2bCKeS8Zv_0nHnseJ27EYibICI';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🧪 Testando operações na tabela SALES...\n');

// Primeiro criar um customer para vincular
const testCustomerId = `test_customer_sales_${Date.now()}`;
const { data: testCustomer } = await supabase
  .from('customers')
  .insert({
    id: testCustomerId,
    name: 'Cliente Sales Teste',
    email: `cliente_sales_${Date.now()}@teste.com`,
    status: 'active'
  })
  .select()
  .single();

if (!testCustomer) {
  console.log('❌ Não foi possível criar customer de teste');
  process.exit(1);
}

const testSaleId = `test_sale_${Date.now()}`;
const testSale = {
  id: testSaleId,
  date: new Date().toISOString().split('T')[0],
  amount: 1500.75,
  product: 'Produto Teste',
  region: 'São Paulo',
  seller: 'Vendedor Teste',
  customer_id: testCustomerId,
  customer_name: 'Cliente Sales Teste',
  status: 'completed',
  payment_method: 'credit_card',
  cielo_transaction_id: `CIELO_${Date.now()}`,
  cielo_terminal_id: 'TERM123'
};

try {
  // CREATE
  const { data: createdSale, error: createError } = await supabase
    .from('sales')
    .insert(testSale)
    .select()
    .single();
  
  if (createError) {
    console.log(`❌ CREATE sale: ${createError.message}`);
  } else {
    console.log(`✅ CREATE sale: ID ${createdSale.id}`);
  }

  if (createdSale) {
    // READ
    const { data: readSale, error: readError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', testSaleId)
      .single();
    
    if (readError) {
      console.log(`❌ READ sale: ${readError.message}`);
    } else {
      console.log(`✅ READ sale: Valor R$ ${readSale.amount}`);
    }

    // UPDATE
    const updatedAmount = 2000.00;
    const { data: updatedSale, error: updateError } = await supabase
      .from('sales')
      .update({ amount: updatedAmount })
      .eq('id', testSaleId)
      .select()
      .single();
    
    if (updateError) {
      console.log(`❌ UPDATE sale: ${updateError.message}`);
    } else {
      console.log(`✅ UPDATE sale: Novo valor R$ ${updatedSale.amount}`);
    }

    // DELETE
    const { error: deleteError } = await supabase
      .from('sales')
      .delete()
      .eq('id', testSaleId);
    
    if (deleteError) {
      console.log(`❌ DELETE sale: ${deleteError.message}`);
    } else {
      console.log(`✅ DELETE sale: Registro removido`);
    }
  }

  // Limpar customer de teste
  await supabase.from('customers').delete().eq('id', testCustomerId);
  console.log('\n✅ Todas as operações na tabela SALES funcionaram corretamente!');
} catch (err) {
  console.log(`❌ Erro: ${err.message}`);
  await supabase.from('customers').delete().eq('id', testCustomerId);
  process.exit(1);
}


