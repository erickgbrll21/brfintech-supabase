// Script para copiar .htaccess para a pasta dist após o build
// Não falha se o arquivo não existir (útil para Vercel que não precisa de .htaccess)
const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, '../public/.htaccess');
const destFile = path.join(__dirname, '../dist/.htaccess');

try {
  if (fs.existsSync(sourceFile)) {
    // Verificar se a pasta dist existe
    const distDir = path.dirname(destFile);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    fs.copyFileSync(sourceFile, destFile);
    console.log('✅ Arquivo .htaccess copiado para dist/');
  } else {
    console.log('⚠️  Arquivo .htaccess não encontrado em public/ (normal para Vercel)');
  }
} catch (error) {
  // Não falhar o build se houver erro ao copiar .htaccess
  // A Vercel não precisa de .htaccess, usa vercel.json
  console.warn('⚠️  Aviso ao copiar .htaccess:', error.message);
  console.log('ℹ️  Continuando build (Vercel usa vercel.json para configuração)');
}

