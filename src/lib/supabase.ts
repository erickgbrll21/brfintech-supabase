import { createClient } from '@supabase/supabase-js';

// REMOVIDO: Fallbacks hardcoded - usar APENAS variáveis de ambiente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Variáveis de ambiente do Supabase não configuradas. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

// Storage customizado com controle manual
// Usa sessionStorage (limpo ao fechar aba) + Map em memória
// NUNCA usa localStorage para evitar sessões antigas persistentes
class TemporaryStorage implements Storage {
  private memoryStorage: Map<string, string> = new Map();

  constructor() {
    // Storage temporário que não persiste entre sessões
  }

  getItem(key: string): string | null {
    // 1. Tentar buscar da memória primeiro (sessão atual)
    if (this.memoryStorage.has(key)) {
      return this.memoryStorage.get(key) || null;
    }
    
    // 2. Tentar buscar do sessionStorage (válido apenas durante a aba aberta)
    // NUNCA buscar do localStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const value = window.sessionStorage.getItem(key);
        if (value) {
          // Se encontrou no sessionStorage, também armazenar em memória
          this.memoryStorage.set(key, value);
          return value;
        }
      } catch (e) {
        // Ignorar erros de storage (pode estar bloqueado)
      }
    }
    
    return null;
  }

  setItem(key: string, value: string): void {
    // Armazenar em memória
    this.memoryStorage.set(key, value);
    
    // Também armazenar no sessionStorage (válido apenas durante a aba)
    // NÃO usar localStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (e) {
        // Ignorar erros de storage
      }
    }
  }

  removeItem(key: string): void {
    this.memoryStorage.delete(key);
    
    // Limpar também do sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(key);
      } catch (e) {
        // Ignorar erros de storage
      }
    }
  }

  clear(): void {
    this.memoryStorage.clear();
    
    // Limpar sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        // Limpar todas as chaves relacionadas ao Supabase
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key && (
            key.startsWith('sb-') || 
            key.includes('supabase') || 
            key.includes('auth-token') ||
            key.includes('auth.session')
          )) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => window.sessionStorage.removeItem(key));
      } catch (e) {
        // Ignorar erros de storage
      }
    }
  }

  get length(): number {
    return this.memoryStorage.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.memoryStorage.keys());
    return keys[index] || null;
  }
}

const temporaryStorage = new TemporaryStorage();

// LIMPEZA INICIAL: Remover qualquer sessão antiga do localStorage ao iniciar
// Isso garante que sessões "fantasma" de deploys anteriores sejam removidas
// sessionStorage será usado durante a sessão atual (limpo ao fechar aba)
if (typeof window !== 'undefined') {
  try {
    // Limpar TODAS as chaves do Supabase do localStorage (persistente)
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (
        key.startsWith('sb-') || 
        key.includes('supabase') || 
        key.includes('auth-token') ||
        key.includes('auth.session')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      window.localStorage.removeItem(key);
    });
    
    // NOTA: NÃO limpar sessionStorage na inicialização
    // sessionStorage é válido durante a sessão atual e será limpo ao fechar a aba
    // Limpar aqui causaria perda de sessão válida após reload da página
  } catch (e) {
    // Ignorar erros de storage (pode estar bloqueado em alguns navegadores)
  }
}

// Cliente Supabase com controle manual de sessão
// DESABILITADO: persistência automática, auto refresh e detecção de sessão na URL
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false, // Desabilitado - controle manual
    persistSession: false, // Desabilitado - não persistir automaticamente
    detectSessionInUrl: false, // Desabilitado - não detectar sessão na URL
    storage: temporaryStorage, // Storage temporário que não persiste
    storageKey: 'sb-auth-token' // Chave genérica (não específica do projeto)
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  }
});

// Função para limpar completamente todas as sessões e dados relacionados
export const clearAllSupabaseSessions = (): void => {
  // Limpar storage temporário
  temporaryStorage.clear();
  
  // Limpar localStorage
  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (
          key.startsWith('sb-') || 
          key.includes('supabase') || 
          key.includes('auth-token') ||
          key.includes('auth.session')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => window.localStorage.removeItem(key));
    } catch (e) {
      // Ignorar erros
    }
    
    // Limpar sessionStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key && (
          key.startsWith('sb-') || 
          key.includes('supabase') || 
          key.includes('auth-token') ||
          key.includes('auth.session')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => window.sessionStorage.removeItem(key));
    } catch (e) {
      // Ignorar erros
    }
  }
};

// Cliente Supabase Admin (para operações administrativas - usar apenas no servidor)
// NOTA: Nunca exponha a service_role_key no cliente!
// export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

