import { User } from '../types';
import { hashPassword, verifyPassword } from '../utils/encryption';
import { supabase } from '../lib/supabase';

export const getUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Erro ao buscar usuários do Supabase:', error);
      return [];
    }
    
    // Converter formato do banco para formato da aplicação
    return (data || []).map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      customerId: user.customer_id,
    }));
  } catch (error) {
    console.error('Erro inesperado ao buscar usuários:', error);
    return [];
  }
};

export const getUserById = async (id: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Nenhum resultado encontrado
      }
      console.error('Erro ao buscar usuário do Supabase:', error);
      return null;
    }
    
    if (!data) return null;
    
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: data.created_at,
      customerId: data.customer_id,
    };
  } catch (error) {
    console.error('Erro inesperado ao buscar usuário:', error);
    return null;
  }
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Nenhum resultado encontrado
      }
      console.error('Erro ao buscar usuário por email do Supabase:', error);
      return null;
    }
    
    if (!data) return null;
    
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: data.created_at,
      customerId: data.customer_id,
    };
  } catch (error) {
    console.error('Erro inesperado ao buscar usuário por email:', error);
    return null;
  }
};

export const createUser = async (
  user: Omit<User, 'id' | 'createdAt'>,
  password?: string
): Promise<User> => {
  // Validar senha obrigatória
  if (!password || password.trim() === '') {
    throw new Error('Senha é obrigatória para criar um novo usuário');
  }
  
  try {
    // Gerar ID único
    const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar hash da senha
    const hashedPassword = await hashPassword(password);
    
    // Inserir usuário no Supabase
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: newId,
        name: user.name,
        email: user.email,
        role: user.role,
        customer_id: user.customerId || null,
      })
      .select()
      .single();
    
    if (userError) throw userError;
    
    // Inserir senha no Supabase
    const { error: passwordError } = await supabase
      .from('user_passwords')
      .insert({
        user_id: newId,
        password_hash: hashedPassword,
      });
    
    if (passwordError) {
      // Se falhar ao salvar senha, remover usuário criado
      await supabase.from('users').delete().eq('id', newId);
      throw passwordError;
    }
    
    // Sincronizar: se role for 'customer' e não tiver customerId, criar cliente correspondente
    if (user.role === 'customer' && !user.customerId) {
      try {
        const customerId = `c${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Criar cliente diretamente no Supabase para evitar dependência circular
        const { error: customerError } = await supabase
          .from('customers')
          .insert({
            id: customerId,
            name: user.name,
            email: user.email || null,
            phone: null,
            region: null,
            status: 'active',
          });
        
        if (!customerError) {
          // Atualizar usuário com customerId
          await supabase
            .from('users')
            .update({ customer_id: customerId })
            .eq('id', newId);
          
          console.log('Cliente sincronizado criado para o usuário:', newId);
          
          return {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            role: userData.role,
            createdAt: userData.created_at,
            customerId: customerId,
          };
        }
      } catch (syncError) {
        // Não bloquear criação do usuário se houver erro na sincronização
        console.error('Erro ao sincronizar cliente para usuário:', syncError);
      }
    }
    
    console.log('Usuário criado com sucesso no Supabase:', newId, user.email);
    
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      createdAt: userData.created_at,
      customerId: userData.customer_id,
    };
  } catch (error) {
    console.error('Erro ao criar usuário no Supabase:', error);
    throw new Error('Erro ao criar usuário. Tente novamente.');
  }
};

export const updateUser = async (
  id: string,
  updates: Partial<User>,
  password?: string
): Promise<User | null> => {
  try {
    // Preparar dados para atualização (converter formato da aplicação para formato do banco)
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.customerId !== undefined) updateData.customer_id = updates.customerId;
    
    // Atualizar usuário
    const { data: userData, error: userError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (userError) throw userError;
    if (!userData) return null;
    
    // Atualizar senha se fornecida
    if (password && password.trim() !== '') {
      const hashedPassword = await hashPassword(password);
      const { error: passwordError } = await supabase
        .from('user_passwords')
        .upsert({
          user_id: id,
          password_hash: hashedPassword,
          updated_at: new Date().toISOString(),
        });
      
      if (passwordError) {
        console.error('Erro ao atualizar senha:', passwordError);
        throw new Error('Erro ao atualizar senha do usuário');
      }
    }
    
    // Sincronizar: se role for 'customer' e tiver customerId, atualizar cliente correspondente
    if (userData.role === 'customer' && userData.customer_id) {
      try {
        const customerUpdates: any = {};
        if (updates.name !== undefined) customerUpdates.name = updates.name;
        if (updates.email !== undefined) customerUpdates.email = updates.email;
        
        if (Object.keys(customerUpdates).length > 0) {
          // Atualizar cliente diretamente no Supabase para evitar dependência circular
          await supabase
            .from('customers')
            .update(customerUpdates)
            .eq('id', userData.customer_id);
          
          console.log('Cliente sincronizado atualizado para o usuário:', id);
        }
      } catch (syncError) {
        // Não bloquear atualização do usuário se houver erro na sincronização
        console.error('Erro ao sincronizar cliente para usuário:', syncError);
      }
    }
    
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      createdAt: userData.created_at,
      customerId: userData.customer_id,
    };
  } catch (error) {
    console.error('Erro ao atualizar usuário no Supabase:', error);
    throw new Error('Erro ao atualizar usuário. Tente novamente.');
  }
};

// Função para verificar senha do usuário (retorna hash)
export const getUserPasswordHash = async (userId: string): Promise<string | undefined> => {
  try {
    const { data, error } = await supabase
      .from('user_passwords')
      .select('password_hash')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) return undefined;
    
    return data.password_hash;
  } catch (error) {
    console.error('Erro ao buscar hash da senha:', error);
    return undefined;
  }
};

// Função para verificar senha por email (retorna hash)
export const getUserPasswordHashByEmail = async (email: string): Promise<string | undefined> => {
  try {
    const user = await getUserById((await getUsers()).find(u => u.email === email)?.id || '');
    if (!user) return undefined;
    
    return await getUserPasswordHash(user.id);
  } catch (error) {
    console.error('Erro ao buscar hash da senha por email:', error);
    return undefined;
  }
};

// Função para verificar se a senha está correta
export const verifyUserPassword = async (
  userId: string,
  password: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('user_passwords')
      .select('password_hash')
      .eq('user_id', userId)
      .single();
    
    if (error || !data) return false;
    
    return verifyPassword(password, data.password_hash);
  } catch (error) {
    console.error('Erro ao verificar senha no Supabase:', error);
    return false;
  }
};

// Função para verificar senha por email
export const verifyUserPasswordByEmail = async (
  email: string,
  password: string
): Promise<boolean> => {
  try {
    // Buscar usuário por email
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (userError || !userData) return false;
    
    // Buscar hash da senha
    const { data: passwordData, error: passwordError } = await supabase
      .from('user_passwords')
      .select('password_hash')
      .eq('user_id', userData.id)
      .single();
    
    if (passwordError || !passwordData) return false;
    
    // Verificar senha
    return verifyPassword(password, passwordData.password_hash);
  } catch (error) {
    console.error('Erro ao verificar senha no Supabase:', error);
    return false;
  }
};

// Mantido para compatibilidade (deprecated - usar verifyUserPassword)
export const getUserPassword = (_userId: string): string | undefined => {
  console.warn('getUserPassword está deprecated. Use verifyUserPassword.');
  return undefined;
};

export const getUserPasswordByEmail = (_email: string): string | undefined => {
  console.warn('getUserPasswordByEmail está deprecated. Use verifyUserPasswordByEmail.');
  return undefined;
};

export const deleteUser = async (id: string): Promise<boolean> => {
  try {
    // Buscar dados do usuário antes de deletar para sincronização
    const userToDelete = await getUserById(id);
    
    // Sincronizar: se role for 'customer' e tiver customerId, deletar cliente correspondente
    if (userToDelete && userToDelete.role === 'customer' && userToDelete.customerId) {
      try {
        // Deletar cliente diretamente no Supabase para evitar dependência circular
        await supabase
          .from('customers')
          .delete()
          .eq('id', userToDelete.customerId);
        
        console.log('Cliente sincronizado deletado para o usuário:', id);
      } catch (syncError) {
        // Não bloquear deleção do usuário se houver erro na sincronização
        console.error('Erro ao sincronizar deleção de cliente:', syncError);
      }
    }
    
    // Deletar usuário (a senha será deletada automaticamente devido ao CASCADE)
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    
    if (userError) {
      console.error('Erro ao deletar usuário no Supabase:', userError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro inesperado ao deletar usuário:', error);
    return false;
  }
};

// Função para inicializar usuário administrador padrão
export const initializeAdminUser = async (): Promise<User | null> => {
  try {
    const adminEmail = 'admin@brfintech.ia.br';
    
    // Verificar se o usuário admin já existe no Supabase
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', adminEmail)
      .single();
    
    if (existingUser) {
      console.log('Usuário administrador já existe no Supabase:', adminEmail);
      return {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        createdAt: existingUser.created_at,
        customerId: existingUser.customer_id,
      };
    }
    
    // Não criar automaticamente - o usuário deve ser criado via Supabase Auth
    console.log('Usuário administrador não encontrado. Use o Supabase Auth para criar.');
    return null;
  } catch (error) {
    console.error('Erro ao verificar usuário administrador:', error);
    return null;
  }
};

