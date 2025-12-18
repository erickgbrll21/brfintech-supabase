#!/bin/bash

# Script de deploy para Hostinger
# Execute: bash deploy.sh

echo "🚀 Iniciando processo de deploy..."

# Limpar build anterior
echo "📦 Limpando build anterior..."
rm -rf dist

# Instalar dependências
echo "📥 Instalando dependências..."
npm install

# Criar build de produção
echo "🔨 Criando build de produção..."
npm run build

# Verificar se o build foi criado
if [ ! -d "dist" ]; then
    echo "❌ Erro: Build não foi criado!"
    exit 1
fi

# Copiar .htaccess para dist
if [ -f "public/.htaccess" ]; then
    echo "📋 Copiando .htaccess..."
    cp public/.htaccess dist/.htaccess
fi

echo "✅ Build concluído com sucesso!"
echo ""
echo "📤 Próximos passos:"
echo "1. Acesse o File Manager da Hostinger"
echo "2. Vá até a pasta public_html"
echo "3. Faça upload de TODOS os arquivos da pasta 'dist'"
echo "4. Certifique-se de que o arquivo .htaccess foi enviado"
echo ""
echo "📁 Pasta pronta para upload: ./dist"

