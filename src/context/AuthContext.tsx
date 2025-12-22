import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { User } from '../types';
import { supabase, clearAllSupabaseSessions } from '../lib/supabase';
import { getCustomers, verifyCustomerPassword } from '../services/customerService';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  login: (emailOrUsername: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: () => boolean;
  isCustomer: () => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSupabaseSession] = useState<Session | null>(null);

  // Função para sincronizar dados do usuário do Supabase Auth com a tabela users
  const syncUserData = useCallback(async (supabaseUser: SupabaseUser): Promise<User | null> => {
    try {
      console.log('Sincronizando dados do usuário:', supabaseUser.email);
      
      // Buscar dados do usuário na tabela users usando o ID do Supabase Auth
      // Primeiro tentar por ID (que deve ser o UUID do Supabase Auth)
      let { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      // Se não encontrou por ID, tentar por email
      if (error && error.code === 'PGRST116') {
        console.log('Usuário não encontrado por ID, tentando por email...');
        const { data: userByEmail, error: emailError } = await supabase
          .from('users')
          .select('*')
          .eq('email', supabaseUser.email || '')
          .single();
        
        if (!emailError && userByEmail) {
          userData = userByEmail;
          error = null;
        }
      }

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Erro ao buscar dados do usuário:', error);
        return null;
      }

      // Se o usuário não existe na tabela users, criar
      if (!userData) {
        console.log('Usuário não existe na tabela, criando...');
        // Verificar role no app_metadata ou buscar da tabela users existente por email
        let role = supabaseUser.app_metadata?.role || 'user';
        
        // Se não tem role no metadata, tentar buscar de usuário existente por email
        if (role === 'user') {
          const { data: existingUserByEmail } = await supabase
            .from('users')
            .select('role')
            .eq('email', supabaseUser.email || '')
            .single();
          
          if (existingUserByEmail) {
            role = existingUserByEmail.role;
          }
        }
        
        const newUser = {
          id: supabaseUser.id, // Usar o UUID do Supabase Auth como string
          name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'Usuário',
          email: supabaseUser.email || '',
          role: role as 'admin' | 'user' | 'customer',
          created_at: supabaseUser.created_at || new Date().toISOString(),
        };

        console.log('Inserindo novo usuário:', newUser);
        const { data: createdUser, error: createError } = await supabase
          .from('users')
          .insert(newUser)
          .select()
          .single();

        if (createError) {
          console.error('Erro ao criar usuário na tabela:', createError);
          // Se o erro for de duplicata, tentar buscar novamente
          if (createError.code === '23505') { // Unique violation
            const { data: retryUser } = await supabase
              .from('users')
              .select('*')
              .eq('email', supabaseUser.email || '')
              .single();
            
            if (retryUser) {
              return {
                id: retryUser.id,
                name: retryUser.name,
                email: retryUser.email,
                username: retryUser.username || undefined,
                role: retryUser.role,
                createdAt: retryUser.created_at || retryUser.createdAt || new Date().toISOString(),
                customerId: retryUser.customer_id || retryUser.customerId,
              };
            }
          }
          return null;
        }

        console.log('Usuário criado com sucesso:', createdUser);
        return {
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          role: createdUser.role,
          createdAt: createdUser.created_at || createdUser.createdAt || new Date().toISOString(),
          customerId: createdUser.customer_id || createdUser.customerId,
        };
      }

      console.log('Usuário encontrado na tabela:', userData);
      // Retornar dados do usuário da tabela
      // Converter created_at para createdAt (camelCase)
      return {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        username: userData.username || undefined,
        role: userData.role,
        createdAt: userData.created_at || userData.createdAt || new Date().toISOString(),
        customerId: userData.customer_id || userData.customerId,
      };
    } catch (error) {
      console.error('Erro ao sincronizar dados do usuário:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    // LIMPEZA INICIAL: Remover qualquer sessão antiga ao iniciar
    // Isso garante que não haja sessões "fantasma" de deploys anteriores
    const initializeAuth = async () => {
      try {
        // Limpar todas as sessões antigas primeiro
        clearAllSupabaseSessions();
        
        // Verificar se há sessão válida (sem persistência automática, sempre será null inicialmente)
        const { data: sessionData, error } = await supabase.auth.getSession();
        
        // Se houver erro ou sessão inválida, garantir limpeza completa
        if (error || !sessionData?.session) {
          clearAllSupabaseSessions();
          setSupabaseSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }

        const session = sessionData.session;
        
        // Validar se a sessão ainda é válida
        if (session?.user && session.expires_at) {
          const expiresAt = session.expires_at * 1000; // Converter para milliseconds
          const now = Date.now();
          
          // Se a sessão expirou, limpar tudo
          if (expiresAt < now) {
            clearAllSupabaseSessions();
            await supabase.auth.signOut();
            setSupabaseSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }
          
          // Sessão válida - sincronizar dados do usuário
          setSupabaseSession(session);
          const userData = await syncUserData(session.user);
          setUser(userData);
        } else {
          // Sem sessão válida - garantir estado limpo
          clearAllSupabaseSessions();
          setSupabaseSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('Erro ao inicializar autenticação:', error);
        // Em caso de erro, garantir estado limpo
        clearAllSupabaseSessions();
        setSupabaseSession(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Ouvir mudanças na autenticação (para logout manual, etc)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      // SIGNED_OUT: garantir limpeza completa
      if (event === 'SIGNED_OUT' || !session) {
        clearAllSupabaseSessions();
        setSupabaseSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      // TOKEN_REFRESHED ou SIGNED_IN: atualizar sessão
      if (session?.user) {
        // Validar expiração
        if (session.expires_at) {
          const expiresAt = session.expires_at * 1000;
          const now = Date.now();
          
          if (expiresAt < now) {
            // Sessão expirada - limpar tudo
            clearAllSupabaseSessions();
            await supabase.auth.signOut();
            setSupabaseSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }
        }
        
        setSupabaseSession(session);
        const userData = await syncUserData(session.user);
        setUser(userData);
      } else {
        // Sem sessão - garantir estado limpo
        clearAllSupabaseSessions();
        setSupabaseSession(null);
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncUserData]);

  // Função auxiliar para verificar se é um email válido
  const isValidEmail = useCallback((str: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
  }, []);

  const login = useCallback(async (emailOrUsername: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // LIMPEZA PRÉ-LOGIN: Garantir que não há sessões antigas
      clearAllSupabaseSessions();
      
      // Verificar se é um email válido
      const isEmail = isValidEmail(emailOrUsername);
      
      if (isEmail) {
        // Se for email, tentar login com Supabase Auth (para usuários administrativos)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: emailOrUsername,
          password: password,
        });

        if (!authError && authData?.user && authData.session) {
          // Login bem-sucedido com Supabase Auth
          // Atualizar sessão manualmente
          setSupabaseSession(authData.session);
          
          // Sincronizar dados do usuário
          const userData = await syncUserData(authData.user);
          if (userData) {
            setUser(userData);
            setSupabaseSession(authData.session);
            setIsLoading(false);
            return true;
          } else {
            // Falha ao sincronizar - limpar tudo
            clearAllSupabaseSessions();
            await supabase.auth.signOut();
            setUser(null);
            setSupabaseSession(null);
            setIsLoading(false);
            return false;
          }
        }

        // Se deu erro no Supabase Auth, limpar e retornar false
        if (authError) {
          clearAllSupabaseSessions();
          setIsLoading(false);
          return false;
        }
      }

      // Se não for email ou não funcionou como email, tentar como username (usuário ou cliente)
      // Primeiro tentar como usuário (users)
      const { getUserByUsername, verifyUserPassword } = await import('../services/userService');
      const foundUser = await getUserByUsername(emailOrUsername);
      
      if (foundUser) {
        // Verificar senha do usuário usando hash
        const isValidPassword = await verifyUserPassword(foundUser.id, password);
        
        if (isValidPassword) {
          // Usuário encontrado e senha válida - definir como usuário logado
          setUser(foundUser);
          setIsLoading(false);
          return true;
        }
      }
      
      // Se não encontrou como usuário, tentar como cliente (customers)
      const customers = await getCustomers();
      const foundCustomer = customers.find(c => c.username === emailOrUsername);
      
      if (foundCustomer) {
        // Verificar senha do cliente usando hash
        const isValidPassword = await verifyCustomerPassword(foundCustomer.id, password);
        
        if (isValidPassword) {
          // Criar objeto User temporário para o cliente
          const customerAsUser: User = {
            id: `customer_${foundCustomer.id}`,
            name: foundCustomer.name,
            email: foundCustomer.email,
            role: 'customer',
            createdAt: foundCustomer.lastPurchase || new Date().toISOString(),
            customerId: foundCustomer.id,
          };
          
          // Limpar qualquer sessão Supabase antes de definir cliente
          clearAllSupabaseSessions();
          await supabase.auth.signOut();
          setSupabaseSession(null);
          setUser(customerAsUser);
          setIsLoading(false);
          return true;
        }
      }
      
      // Login falhou - garantir estado limpo
      clearAllSupabaseSessions();
      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      // Em caso de erro, garantir limpeza completa
      clearAllSupabaseSessions();
      await supabase.auth.signOut();
      setUser(null);
      setSupabaseSession(null);
      setIsLoading(false);
      return false;
    }
  }, [isValidEmail, syncUserData]);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // 1. Fazer signOut do Supabase
      await supabase.auth.signOut();
      
      // 2. Limpar TODAS as sessões e dados relacionados
      clearAllSupabaseSessions();
      
      // 3. Limpar estado local
      setUser(null);
      setSupabaseSession(null);
      
      // 4. Forçar atualização completa da página para garantir estado limpo
      // Isso garante que não haja resquícios de sessão antiga
      window.location.href = '/login';
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      // Mesmo com erro, garantir limpeza completa
      clearAllSupabaseSessions();
      setUser(null);
      setSupabaseSession(null);
      window.location.href = '/login';
    }
  }, []);

  const isAdmin = useCallback((): boolean => {
    return user?.role === 'admin';
  }, [user?.role]);

  const isCustomer = useCallback((): boolean => {
    return user?.role === 'customer';
  }, [user?.role]);

  const value = useMemo(() => ({
    user,
    login,
    logout,
    isAdmin,
    isCustomer,
    isLoading
  }), [user, login, logout, isAdmin, isCustomer, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

