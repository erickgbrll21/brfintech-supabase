/**
 * Script para criar usuário administrador no Supabase Auth
 * Execute: node scripts/create-admin-user.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pbifnqradvbvuuqvymji.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZucXJhZHZidnV1cXZ5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTE2OTMsImV4cCI6MjA4MTQ4NzY5M30.E5e4jFqhioAmBFRgt2bCKeS8Zv_0nHnseJ27EYibICI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAdminUser() {
  const adminEmail = 'admin@brfintech.ia.br';
  const adminPassword = '14141414'; // Senha temporária com 8 caracteres (mínimo do Supabase)
  const finalPassword = '1414'; // Senha desejada (será atualizada depois se possível)

  try {
    console.log('Verificando se o usuário já existe...');
    
    // Verificar se o usuário já existe
    const { data: existingUsers } = await supabase
      .from('users')
      .select('*')
      .eq('email', adminEmail);

    if (existingUsers && existingUsers.length > 0) {
      console.log('Usuário já existe na tabela users:', existingUsers[0]);
    }

    // Tentar fazer signup (criará no Supabase Auth)
    console.log('Criando usuário no Supabase Auth...');
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: {
        data: {
          name: 'Administrador',
        },
      },
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered') || 
          signUpError.message.includes('already exists') ||
          signUpError.message.includes('User already registered')) {
        console.log('Usuário já existe no Supabase Auth. Fazendo login...');
        
        // Tentar fazer login
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        });

        if (signInError) {
          console.error('Erro ao fazer login:', signInError);
          return;
        }

        console.log('Login bem-sucedido!');
        console.log('User ID:', signInData.user?.id);
        
        // Atualizar app_metadata para admin
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            role: 'admin',
          },
        });

        if (updateError) {
          console.error('Erro ao atualizar metadata:', updateError);
        } else {
          console.log('Metadata atualizado com sucesso!');
        }
      } else {
        console.error('Erro ao criar usuário:', signUpError);
        return;
      }
    } else if (authData?.user) {
      console.log('Usuário criado com sucesso no Supabase Auth!');
      console.log('User ID:', authData.user.id);
      console.log('Email:', authData.user.email);
      
      // Criar registro na tabela users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          name: 'Administrador',
          email: adminEmail,
          role: 'admin',
        })
        .select()
        .single();

      if (userError) {
        console.error('Erro ao criar registro na tabela users:', userError);
      } else {
        console.log('Registro criado na tabela users:', userData);
      }
    }

    console.log('\n✅ Processo concluído!');
    console.log('Credenciais:');
    console.log('Email:', adminEmail);
    console.log('Senha:', adminPassword);
    
  } catch (error) {
    console.error('Erro geral:', error);
  }
}

createAdminUser();

