import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { User } from '../types';
import { supabase, clearAllSupabaseSessions } from '../lib/supabase';
import { getCustomers, verifyCustomerPassword } from '../services/customerService';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { safeGetSession, safeSupabaseQuery } from '../utils/supabaseRequest';

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
  const isLoggingInRef = React.useRef(false);

  // Função para sincronizar dados do usuário do Supabase Auth com a tabela users
  const syncUserData = useCallback(async (supabaseUser: SupabaseUser): Promise<User | null> => {
    try {
      console.log('Sincronizando dados do usuário:', supabaseUser.email);
      
      // Buscar dados do usuário na tabela users usando o ID do Supabase Auth
      // Primeiro tentar por ID (que deve ser o UUID do Supabase Auth)
      let userData: any = await safeSupabaseQuery(
        async () => {
          const result = await supabase
            .from('users')
            .select('*')
            .eq('id', supabaseUser.id)
            .single();
          return result;
        },
        { timeout: 8000, maxRetries: 2 }
      );

      // Se não encontrou por ID, tentar por email
      if (!userData) {
        console.log('Usuário não encontrado por ID, tentando por email...');
        userData = await safeSupabaseQuery(
          async () => {
            const result = await supabase
              .from('users')
              .select('*')
              .eq('email', supabaseUser.email || '')
              .single();
            return result;
          },
          { timeout: 8000, maxRetries: 2 }
        );
      }

      // Se o usuário não existe na tabela users, criar
      if (!userData) {
        console.log('Usuário não existe na tabela, criando...');
        // Verificar role no app_metadata ou buscar da tabela users existente por email
        let role = supabaseUser.app_metadata?.role || 'user';
        
        // Se não tem role no metadata, tentar buscar de usuário existente por email
        if (role === 'user') {
          const existingUserByEmail: any = await safeSupabaseQuery(
            async () => {
              const result = await supabase
                .from('users')
                .select('role')
                .eq('email', supabaseUser.email || '')
                .single();
              return result;
            },
            { timeout: 5000, maxRetries: 1 }
          );
          
          if (existingUserByEmail?.role) {
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
        const createdUser: any = await safeSupabaseQuery(
          async () => {
            const result = await supabase
              .from('users')
              .insert(newUser)
              .select()
              .single();
            return result;
          },
          { timeout: 8000, maxRetries: 2 }
        );

        if (!createdUser) {
          // Se falhou ao criar, tentar buscar novamente (pode ter sido criado por outra requisição)
          const retryUser: any = await safeSupabaseQuery(
            async () => {
              const result = await supabase
                .from('users')
                .select('*')
                .eq('email', supabaseUser.email || '')
                .single();
              return result;
            },
            { timeout: 5000, maxRetries: 1 }
          );
          
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
      // Timeout máximo para garantir que isLoading sempre termine
      const maxInitTimeout = setTimeout(() => {
        console.warn('Timeout máximo na inicialização de autenticação. Finalizando...');
        setIsLoading(false);
      }, 15000); // 15 segundos máximo

      try {
        // Limpar todas as sessões antigas primeiro
        clearAllSupabaseSessions();
        
        // Verificar se há sessão válida com timeout e retry
        const sessionResult = await safeGetSession({ timeout: 5000, maxRetries: 2 });
        
        // Se houver erro ou sessão inválida, garantir limpeza completa
        if (sessionResult.error || !sessionResult.data?.session) {
          clearAllSupabaseSessions();
          setSupabaseSession(null);
          setUser(null);
          clearTimeout(maxInitTimeout);
          setIsLoading(false);
          return;
        }

        const session = sessionResult.data.session;
        
        // Validar se a sessão ainda é válida
        if (session?.user && session.expires_at) {
          const expiresAt = session.expires_at * 1000; // Converter para milliseconds
          const now = Date.now();
          
          // Se a sessão expirou, limpar tudo
          if (expiresAt < now) {
            clearAllSupabaseSessions();
            // Não aguardar signOut para não bloquear
            supabase.auth.signOut().catch(() => {});
            setSupabaseSession(null);
            setUser(null);
            clearTimeout(maxInitTimeout);
            setIsLoading(false);
            return;
          }
          
          // Sessão válida - sincronizar dados do usuário (não bloquear se falhar)
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
        clearTimeout(maxInitTimeout);
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Ouvir mudanças na autenticação (para logout manual, etc)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      // Ignorar eventos durante o processo de login manual
      if (isLoggingInRef.current && event === 'SIGNED_IN') {
        console.log('Login em progresso, ignorando evento SIGNED_IN do onAuthStateChange');
        return;
      }

      // SIGNED_OUT: garantir limpeza completa
      if (event === 'SIGNED_OUT' || !session) {
        if (!isLoggingInRef.current) {
          clearAllSupabaseSessions();
          setSupabaseSession(null);
          setUser(null);
          setIsLoading(false);
        }
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
            if (!isLoggingInRef.current) {
              clearAllSupabaseSessions();
              supabase.auth.signOut().catch(() => {});
              setSupabaseSession(null);
              setUser(null);
              setIsLoading(false);
            }
            return;
          }
        }
        
        // Só atualizar se não estiver fazendo login manualmente
        if (!isLoggingInRef.current) {
          setSupabaseSession(session);
          // Sincronizar dados do usuário sem bloquear
          syncUserData(session.user)
            .then(userData => {
              if (userData) {
                setUser(userData);
              }
            })
            .catch(error => {
              console.error('Erro ao sincronizar dados do usuário no auth state change:', error);
            })
            .finally(() => {
              if (!isLoggingInRef.current) {
                setIsLoading(false);
              }
            });
        }
      } else {
        // Sem sessão - garantir estado limpo (apenas se não estiver fazendo login)
        if (!isLoggingInRef.current) {
          clearAllSupabaseSessions();
          setSupabaseSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
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
    // Timeout máximo para login
    const loginTimeout = setTimeout(() => {
      console.warn('Timeout no login. Finalizando...');
      isLoggingInRef.current = false;
      setIsLoading(false);
    }, 30000); // 30 segundos máximo

    try {
      setIsLoading(true);
      isLoggingInRef.current = true; // Marcar que está fazendo login
      
      // Verificar se é um email válido
      const isEmail = isValidEmail(emailOrUsername);
      
      if (isEmail) {
        // Se for email, tentar login com Supabase Auth (para usuários administrativos)
        // NÃO usar safeSupabaseRequest aqui pois erros de autenticação são esperados
        // e não devem fazer retry
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailOrUsername,
            password: password,
          });

          if (!authError && authData?.user && authData.session) {
            // Login bem-sucedido com Supabase Auth
            console.log('Login bem-sucedido, sincronizando dados do usuário...');
            
            // Atualizar sessão primeiro
            setSupabaseSession(authData.session);
            
            // Sincronizar dados do usuário (com timeout, mas sem limpar sessão)
            const userData = await syncUserData(authData.user);
            if (userData) {
              console.log('Usuário sincronizado com sucesso:', userData);
              // Garantir que a sessão está definida primeiro
              setSupabaseSession(authData.session);
              // Depois definir o usuário
              setUser(userData);
              // Marcar que login foi concluído
              isLoggingInRef.current = false;
              clearTimeout(loginTimeout);
              setIsLoading(false);
              return true;
            } else {
              console.error('Falha ao sincronizar dados do usuário após login');
              // Falha ao sincronizar - limpar tudo
              isLoggingInRef.current = false;
              clearAllSupabaseSessions();
              await supabase.auth.signOut();
              setUser(null);
              setSupabaseSession(null);
              clearTimeout(loginTimeout);
              setIsLoading(false);
              return false;
            }
          }

          // Se deu erro no Supabase Auth, retornar false (credenciais inválidas)
          if (authError) {
            console.log('Erro de autenticação:', authError.message);
            isLoggingInRef.current = false;
            clearTimeout(loginTimeout);
            setIsLoading(false);
            return false;
          }
        } catch (error) {
          console.error('Erro ao fazer login com Supabase Auth:', error);
          isLoggingInRef.current = false;
          clearTimeout(loginTimeout);
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
          // Limpar sessão Supabase pois é login via username (não Supabase Auth)
          clearAllSupabaseSessions();
          await supabase.auth.signOut();
          setSupabaseSession(null);
          setUser(foundUser);
          isLoggingInRef.current = false;
          clearTimeout(loginTimeout);
          setIsLoading(false);
          return true;
        }
      }
      
      // Se não encontrou como usuário, tentar como cliente (customers)
      // Usar timeout para getCustomers
      try {
        const customers: any[] = await Promise.race([
          getCustomers(),
          new Promise<any[]>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout ao buscar clientes')), 10000)
          ),
        ]).catch(() => []);
        
        const foundCustomer = customers.find((c: any) => c.username === emailOrUsername);
        
        if (foundCustomer) {
          // Verificar senha do cliente usando hash (com timeout)
          const isValidPassword = await Promise.race([
            verifyCustomerPassword(foundCustomer.id, password),
            new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout ao verificar senha')), 5000)
            ),
          ]).catch(() => false);
          
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
            isLoggingInRef.current = false;
            clearTimeout(loginTimeout);
            setIsLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error('Erro ao buscar clientes durante login:', error);
      }
      
      // Login falhou - não limpar sessões aqui pois pode haver uma sessão válida
      isLoggingInRef.current = false;
      clearTimeout(loginTimeout);
      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      // Em caso de erro, limpar estado mas não forçar signOut se houver sessão válida
      isLoggingInRef.current = false;
      clearTimeout(loginTimeout);
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

