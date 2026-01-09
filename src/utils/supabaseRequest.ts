/**
 * Utilitário para requisições ao Supabase com timeout, retry e tratamento de erro
 * Resolve problemas de cold start, timeouts e requisições sem tratamento
 */

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 segundo
  timeout: 10000, // 10 segundos
};

/**
 * Cria uma Promise que rejeita após o timeout especificado
 */
function createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Requisição excedeu o timeout de ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Executa uma função com timeout e retry automático
 * 
 * @param fn Função assíncrona a ser executada
 * @param options Opções de retry e timeout
 * @returns Resultado da função ou null em caso de falha após todas as tentativas
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Criar race entre a função e o timeout
      const result = await Promise.race([
        fn(),
        createTimeoutPromise<T>(opts.timeout),
      ]);

      return result;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Se não for a última tentativa, aguardar antes de tentar novamente
      if (attempt < opts.maxRetries) {
        const delay = opts.retryDelay * (attempt + 1); // Backoff exponencial
        console.warn(
          `Tentativa ${attempt + 1}/${opts.maxRetries + 1} falhou. Tentando novamente em ${delay}ms...`,
          error.message
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(
          `Todas as ${opts.maxRetries + 1} tentativas falharam:`,
          lastError.message
        );
      }
    }
  }

  // Retornar null em vez de lançar erro para não quebrar a aplicação
  return null;
}

/**
 * Wrapper para requisições do Supabase com timeout e retry
 * 
 * @param request Função que retorna uma Promise do Supabase
 * @param options Opções de retry e timeout
 * @returns Resultado da requisição ou null em caso de falha
 */
export async function safeSupabaseRequest<T>(
  request: () => Promise<{ data: T | null; error: any }>,
  options: RetryOptions = {}
): Promise<{ data: T | null; error: any }> {
  const result = await withRetryAndTimeout(async () => {
    const response = await request();
    
    // Se houver erro na resposta, lançar para que o retry funcione
    if (response.error) {
      throw new Error(response.error.message || 'Erro na requisição Supabase');
    }
    
    return response;
  }, options);

  if (result === null) {
    return {
      data: null,
      error: {
        message: 'Falha ao conectar com o servidor. Verifique sua conexão e tente novamente.',
        code: 'TIMEOUT_OR_NETWORK_ERROR',
      },
    };
  }

  return result;
}

/**
 * Wrapper específico para getSession com timeout curto (crítico para inicialização)
 */
export async function safeGetSession(options: RetryOptions = {}) {
  const { supabase } = await import('../lib/supabase');
  
  return safeSupabaseRequest<{ session: any }>(
    async () => {
      const result = await supabase.auth.getSession();
      return {
        data: result.data?.session ? { session: result.data.session } : null,
        error: result.error,
      };
    },
    {
      timeout: 5000, // 5 segundos para getSession (crítico)
      maxRetries: 2, // Menos tentativas para não atrasar muito
      ...options,
    }
  );
}

/**
 * Wrapper para queries do Supabase com timeout e retry
 */
export async function safeSupabaseQuery<T>(
  query: () => Promise<{ data: T | null; error: any }>,
  options: RetryOptions = {}
): Promise<T | null> {
  const result = await safeSupabaseRequest<T>(query, options);
  
  if (result.error) {
    console.error('Erro na query Supabase:', result.error);
    return null;
  }
  
  return result.data;
}

