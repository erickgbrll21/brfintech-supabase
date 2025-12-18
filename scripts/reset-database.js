// Script para resetar todos os dados do localStorage (banco de dados)
// Execute este script no console do navegador ou via Node.js

const STORAGE_KEYS = [
  'brfintech_user',           // Usuário logado
  'customer_spreadsheets',   // Planilhas dos clientes
  'customer_card_values',     // Valores dos cards KPI
  'customer_taxes',           // Taxas dos clientes
  'cielo_api_config'          // Configuração da API Cielo
];

function resetDatabase() {
  console.log('🔄 Iniciando reset do banco de dados...');
  
  let clearedCount = 0;
  
  STORAGE_KEYS.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`✅ Removido: ${key}`);
      clearedCount++;
    } else {
      console.log(`ℹ️  Não encontrado: ${key}`);
    }
  });
  
  // Limpar qualquer outra chave que comece com 'brfintech_' ou 'customer_'
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if ((key.startsWith('brfintech_') || key.startsWith('customer_') || key.startsWith('cielo_')) 
        && !STORAGE_KEYS.includes(key)) {
      localStorage.removeItem(key);
      console.log(`✅ Removido (extra): ${key}`);
      clearedCount++;
    }
  });
  
  console.log(`\n✨ Reset concluído! ${clearedCount} chave(s) removida(s).`);
  console.log('🔄 Recarregue a página para aplicar as mudanças.');
  
  return clearedCount;
}

// Se estiver rodando no Node.js (teste)
if (typeof window === 'undefined') {
  console.log('⚠️  Este script deve ser executado no navegador (console do navegador)');
  console.log('📋 Chaves que serão removidas:');
  STORAGE_KEYS.forEach(key => console.log(`   - ${key}`));
} else {
  // Executar automaticamente se estiver no navegador
  resetDatabase();
}

// Exportar função para uso no console
if (typeof window !== 'undefined') {
  window.resetDatabase = resetDatabase;
  console.log('💡 Dica: Execute resetDatabase() no console para resetar novamente.');
}










