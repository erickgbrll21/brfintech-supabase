// Serviço para gerenciar configurações da API Cielo
import { supabase } from '../lib/supabase';

export interface CieloConfig {
  merchantId: string;
  merchantKey: string;
  apiUrl?: string;
}

// URL padrão da API Cielo
const DEFAULT_API_URL = 'https://api.cieloecommerce.cielo.com.br';

export const getCieloConfig = async (): Promise<CieloConfig | null> => {
  try {
    // Buscar configuração no Supabase
    const { data, error } = await supabase
      .from('cielo_config')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      // Se o erro for PGRST116 (no rows), continuar para fallback
      if (error.code !== 'PGRST116') {
        console.error('Erro ao buscar configuração Cielo:', error);
      }
    } else if (data) {
      return {
        merchantId: data.merchant_id || '',
        merchantKey: data.merchant_key || '',
        apiUrl: data.api_url || DEFAULT_API_URL,
      };
  }
  
  // Fallback para variáveis de ambiente
  const envMerchantId = import.meta.env.VITE_CIELO_MERCHANT_ID;
  const envMerchantKey = import.meta.env.VITE_CIELO_MERCHANT_KEY;
  
  if (envMerchantId && envMerchantKey) {
    return {
      merchantId: envMerchantId,
      merchantKey: envMerchantKey,
      apiUrl: import.meta.env.VITE_CIELO_API_URL || DEFAULT_API_URL,
    };
  }
  
  return null;
  } catch (error) {
    console.error('Erro ao recuperar configuração Cielo:', error);
    return null;
  }
};

export const saveCieloConfig = async (config: CieloConfig): Promise<void> => {
  try {
    const { error } = await supabase
      .from('cielo_config')
      .upsert({
        id: 'default',
        api_url: config.apiUrl?.trim() || DEFAULT_API_URL,
        merchant_id: config.merchantId.trim(),
        merchant_key: config.merchantKey.trim(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Erro ao salvar configuração Cielo no Supabase:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erro ao salvar configuração Cielo:', error);
    throw new Error('Erro ao salvar configuração');
  }
};

export const deleteCieloConfig = async (): Promise<void> => {
  try {
    const { error } = await supabase
      .from('cielo_config')
      .delete()
      .eq('id', 'default');

    if (error) {
      console.error('Erro ao remover configuração Cielo do Supabase:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erro ao remover configuração Cielo:', error);
    throw error;
  }
};

export const hasCieloConfig = async (): Promise<boolean> => {
  const config = await getCieloConfig();
  return !!(config?.merchantId && config?.merchantKey);
};
