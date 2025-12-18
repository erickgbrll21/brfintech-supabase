@echo off
REM Script de deploy para Hostinger (Windows)
REM Execute: deploy.bat

echo 🚀 Iniciando processo de deploy...

REM Limpar build anterior
echo 📦 Limpando build anterior...
if exist dist rmdir /s /q dist

REM Instalar dependências
echo 📥 Instalando dependências...
call npm install

REM Criar build de produção
echo 🔨 Criando build de produção...
call npm run build

REM Verificar se o build foi criado
if not exist dist (
    echo ❌ Erro: Build não foi criado!
    pause
    exit /b 1
)

REM Copiar .htaccess para dist
if exist public\.htaccess (
    echo 📋 Copiando .htaccess...
    copy public\.htaccess dist\.htaccess
)

echo ✅ Build concluído com sucesso!
echo.
echo 📤 Próximos passos:
echo 1. Acesse o File Manager da Hostinger
echo 2. Vá até a pasta public_html
echo 3. Faça upload de TODOS os arquivos da pasta 'dist'
echo 4. Certifique-se de que o arquivo .htaccess foi enviado
echo.
echo 📁 Pasta pronta para upload: .\dist
pause

