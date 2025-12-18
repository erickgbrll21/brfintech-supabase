# 🚀 Guia de Deploy - Hostinger

Este guia vai te ajudar a fazer o deploy do dashboard BR FINTECH na Hostinger.

## 📋 Pré-requisitos

1. Conta na Hostinger com acesso ao File Manager ou FTP
2. Node.js instalado localmente (para fazer o build)
3. Acesso ao painel de controle da Hostinger

## 🔧 Passo a Passo

### 1. Preparar o Build de Produção

No seu computador, na pasta do projeto, execute:

```bash
# Instalar dependências (se ainda não instalou)
npm install

# Criar o build de produção
npm run build
```

Isso vai criar uma pasta `dist` com todos os arquivos otimizados para produção.

### 2. Verificar o Build

Antes de fazer upload, teste localmente:

```bash
npm run preview
```

Acesse `http://localhost:4173` para verificar se tudo está funcionando.

### 3. Acessar o File Manager da Hostinger

1. Faça login no painel da Hostinger
2. Vá em **File Manager** ou **Gerenciador de Arquivos**
3. Navegue até a pasta `public_html` (ou `www` dependendo da configuração)

### 4. Fazer Upload dos Arquivos

**Opção A: Via File Manager (Recomendado)**
1. Dentro de `public_html`, delete todos os arquivos existentes (se houver)
2. Faça upload de TODOS os arquivos da pasta `dist` para `public_html`
3. Certifique-se de que o arquivo `.htaccess` também foi enviado

**Opção B: Via FTP**
1. Use um cliente FTP (FileZilla, WinSCP, etc.)
2. Conecte-se ao servidor da Hostinger
3. Navegue até `public_html`
4. Faça upload de todos os arquivos da pasta `dist`

### 5. Verificar Estrutura de Arquivos

Após o upload, a estrutura deve ser:

```
public_html/
├── .htaccess
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
└── logo.svg
```

### 6. Configurar Domínio/Subdomínio

Se você quiser usar um subdomínio (ex: `dashboard.seudominio.com`):

1. No painel da Hostinger, vá em **Domínios**
2. Adicione um subdomínio apontando para `public_html`
3. Aguarde a propagação DNS (pode levar algumas horas)

### 7. Testar o Site

1. Acesse seu domínio no navegador
2. Verifique se a página de login aparece
3. Teste o login com as credenciais:
   - **Admin**: `admin@brfintech.com` / `123456`
   - **Usuário**: `user@brfintech.com` / `123456`

## ⚙️ Configurações Adicionais

### Variáveis de Ambiente (Opcional)

Se você quiser configurar variáveis de ambiente na Hostinger:

1. No File Manager, crie um arquivo `.env` na raiz do projeto (antes do build)
2. Adicione as variáveis:
   ```
   VITE_CIELO_API_URL=https://api.cieloecommerce.cielo.com.br
   VITE_CIELO_MERCHANT_ID=seu_merchant_id
   VITE_CIELO_MERCHANT_KEY=sua_merchant_key
   ```
3. Refaça o build: `npm run build`
4. Faça upload novamente

**Nota:** Como o Vite injeta as variáveis no build, você precisa fazer o build novamente após alterar o `.env`.

### SSL/HTTPS

A Hostinger geralmente fornece SSL gratuito. Para ativar:

1. No painel da Hostinger, vá em **SSL**
2. Ative o SSL para seu domínio
3. Aguarde alguns minutos para ativação
4. Acesse via `https://seudominio.com`

## 🔍 Solução de Problemas

### Página em branco após deploy

1. Verifique se o arquivo `.htaccess` foi enviado
2. Verifique se o `index.html` está na raiz de `public_html`
3. Verifique os logs de erro no painel da Hostinger

### Rotas não funcionam (404 ao navegar)

1. Certifique-se de que o `.htaccess` está presente
2. Verifique se o módulo `mod_rewrite` está habilitado no servidor
3. Entre em contato com o suporte da Hostinger se necessário

### Arquivos não carregam (CSS/JS)

1. Verifique se a pasta `assets` foi enviada completamente
2. Verifique as permissões dos arquivos (devem ser 644)
3. Limpe o cache do navegador (Ctrl+F5)

### Erro 500

1. Verifique os logs de erro no painel da Hostinger
2. Verifique se o `.htaccess` está correto
3. Entre em contato com o suporte se persistir

## 📝 Checklist Final

- [ ] Build criado com sucesso (`npm run build`)
- [ ] Todos os arquivos da pasta `dist` foram enviados
- [ ] Arquivo `.htaccess` está presente
- [ ] `index.html` está na raiz de `public_html`
- [ ] SSL está ativado (recomendado)
- [ ] Site está acessível via navegador
- [ ] Login está funcionando
- [ ] Todas as rotas estão funcionando

## 🆘 Suporte

Se encontrar problemas:
1. Verifique os logs de erro no painel da Hostinger
2. Entre em contato com o suporte da Hostinger
3. Verifique a documentação da Hostinger sobre hospedagem de SPAs

## 📚 Recursos Úteis

- [Documentação Hostinger](https://www.hostinger.com.br/tutoriais)
- [Documentação Vite](https://vitejs.dev/guide/static-deploy.html)
- [React Router - Deploy](https://reactrouter.com/en/main/start/overview#deployment)

---

**Boa sorte com o deploy! 🎉**

