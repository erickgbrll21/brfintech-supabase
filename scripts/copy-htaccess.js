// Script para copiar .htaccess para a pasta dist após o build
const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, '../public/.htaccess');
const destFile = path.join(__dirname, '../dist/.htaccess');

try {
  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, destFile);
    console.log('✅ Arquivo .htaccess copiado para dist/');
  } else {
    console.log('⚠️  Arquivo .htaccess não encontrado em public/');
  }
} catch (error) {
  console.error('❌ Erro ao copiar .htaccess:', error.message);
  process.exit(1);
}

