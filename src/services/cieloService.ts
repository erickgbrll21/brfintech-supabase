import axios from 'axios';
import { CieloTransaction } from '../types';
import { getCieloConfig } from './cieloConfigService';

// Função para obter configuração atual da Cielo
const getCurrentConfig = async () => {
  const config = await getCieloConfig();
  const defaultUrl = import.meta.env.VITE_CIELO_API_URL || 'https://api.cieloecommerce.cielo.com.br';
  
  return {
    apiUrl: config?.apiUrl || defaultUrl,
    merchantId: config?.merchantId || import.meta.env.VITE_CIELO_MERCHANT_ID || '',
    merchantKey: config?.merchantKey || import.meta.env.VITE_CIELO_MERCHANT_KEY || '',
  };
};

// Função para criar instância do axios com configuração atual
const createCieloApi = async () => {
  const config = await getCurrentConfig();
  
  return axios.create({
    baseURL: config.apiUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      username: config.merchantId,
      password: config.merchantKey,
    },
  });
};

export const getCieloTransactions = async (
  startDate?: string,
  endDate?: string
): Promise<CieloTransaction[]> => {
  try {
    const config = await getCurrentConfig();
    
    // Se não houver credenciais configuradas, retornar array vazio
    if (!config.merchantId || !config.merchantKey) {
      return [];
    }

    // Chamada real à API Cielo
    const cieloApi = await createCieloApi();
    const response = await cieloApi.get('/1/sales', {
      params: {
        merchantOrderId: '',
        pageSize: 100,
        page: 1,
        startDate,
        endDate,
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar transações Cielo:', error);
    // Em caso de erro, retornar array vazio
    return [];
  }
};

export const getCieloTransactionById = async (paymentId: string): Promise<CieloTransaction | null> => {
  try {
    const config = await getCurrentConfig();
    
    if (!config.merchantId || !config.merchantKey) {
      return null;
    }

    // Chamada real à API Cielo
    const cieloApi = await createCieloApi();
    const response = await cieloApi.get(`/1/sales/${paymentId}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar transação Cielo:', error);
    return null;
  }
};

export const getCieloPaymentStatus = (status: number): string => {
  const statusMap: { [key: number]: string } = {
    0: 'Não finalizada',
    1: 'Autorizada',
    2: 'Pagamento confirmado',
    3: 'Negada',
    10: 'Cancelada',
    11: 'Reembolsada',
    12: 'Pendente',
    13: 'Abortada',
    20: 'Agendada',
  };
  
  return statusMap[status] || 'Desconhecido';
};

