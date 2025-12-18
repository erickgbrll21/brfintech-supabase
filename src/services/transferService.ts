import { Transfer } from '../types';
import { supabase } from '../lib/supabase';

// Função auxiliar para normalizar data sem problemas de timezone
// Esta função garante que a data seja interpretada como data local, não UTC
// IMPORTANTE: Quando o PostgreSQL retorna TIMESTAMPTZ, ele retorna em UTC
// Precisamos converter para o timezone local antes de extrair a data
const normalizeDate = (dateString: string | null): string => {
  if (!dateString || dateString.trim() === '') {
    return '';
  }
  
  // Se já está no formato YYYY-MM-DD, retornar direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Se é uma data ISO completa (vinda do PostgreSQL como TIMESTAMPTZ em UTC)
  // Precisamos criar um Date object e usar métodos locais para extrair a data
  // Isso garante que a data seja interpretada no timezone local do usuário
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // IMPORTANTE: Usar métodos locais (getFullYear, getMonth, getDate)
    // Esses métodos retornam valores no timezone local do navegador
    // Isso corrige o problema de aparecer um dia antes
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    // Fallback: tentar extrair com regex se não conseguir criar Date
    const dateMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      return dateMatch[1];
    }
    return '';
  }
};

// Converter dados do banco para formato Transfer
const dbToTransfer = (dbTransfer: any): Transfer => {
  return {
    id: dbTransfer.id,
    periodo: dbTransfer.periodo || '',
    valorBruto: parseFloat(dbTransfer.valor_bruto) || 0,
    taxas: parseFloat(dbTransfer.taxas) || 0,
    valorLiquido: parseFloat(dbTransfer.valor_liquido) || 0,
    status: dbTransfer.status || 'pendente',
    dataEnvio: normalizeDate(dbTransfer.data_envio),
    customerId: dbTransfer.customer_id || null,
    customerName: dbTransfer.customer_name || null,
    createdAt: dbTransfer.created_at || new Date().toISOString(),
  };
};

// Converter Transfer para formato do banco
const transferToDb = (transfer: Omit<Transfer, 'id' | 'createdAt'>) => {
  // SOLUÇÃO: Salvar como meio-dia UTC para garantir que o dia seja preservado
  // mesmo com diferenças de timezone ao ler de volta
  let dataEnvio = null;
  if (transfer.dataEnvio && transfer.dataEnvio.trim() !== '') {
    // Extrair apenas a data YYYY-MM-DD
    const dateMatch = transfer.dataEnvio.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      // Salvar como meio-dia UTC (12:00:00 UTC)
      // Isso garante que mesmo com timezones negativos (como Brasil UTC-3),
      // quando lermos de volta, o dia ainda será o correto
      dataEnvio = `${dateStr}T12:00:00.000Z`;
    }
  }
  
  return {
    periodo: transfer.periodo || null,
    valor_bruto: transfer.valorBruto,
    taxas: transfer.taxas,
    valor_liquido: transfer.valorLiquido,
    status: transfer.status || 'pendente',
    data_envio: dataEnvio,
    customer_id: transfer.customerId || null,
    customer_name: transfer.customerName || null,
  };
};

export const getTransfers = async (): Promise<Transfer[]> => {
  try {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .order('data_envio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar repasses do Supabase:', error);
      return [];
    }

    return (data || []).map(dbToTransfer).sort((a: Transfer, b: Transfer) => {
      // Ordenar por data de envio (mais recente primeiro)
      const dateA = a.dataEnvio ? new Date(a.dataEnvio).getTime() : 0;
      const dateB = b.dataEnvio ? new Date(b.dataEnvio).getTime() : 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Erro inesperado ao buscar repasses:', error);
    return [];
  }
};

export const getTransferById = async (id: string): Promise<Transfer | null> => {
  try {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Erro ao buscar repasse do Supabase:', error);
      }
      return null;
    }

    if (!data) {
      return null;
    }

    return dbToTransfer(data);
  } catch (error) {
    console.error('Erro inesperado ao buscar repasse:', error);
    return null;
  }
};

export const createTransfer = async (
  transfer: Omit<Transfer, 'id' | 'createdAt'>
): Promise<Transfer> => {
  try {
    const newId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const dbData = transferToDb(transfer);

    const { data, error } = await supabase
      .from('transfers')
      .insert({
        id: newId,
        ...dbData,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar repasse no Supabase:', error);
      throw error;
    }

    return dbToTransfer(data);
  } catch (error) {
    console.error('Erro inesperado ao criar repasse:', error);
    throw error;
  }
};

export const updateTransfer = async (
  id: string,
  updates: Partial<Transfer>
): Promise<Transfer | null> => {
  try {
    // Buscar repasse atual
    const currentTransfer = await getTransferById(id);
    if (!currentTransfer) {
      return null;
    }

    // Mesclar atualizações
    const updatedTransfer = { ...currentTransfer, ...updates };
    const dbData = transferToDb(updatedTransfer);

    const { data, error } = await supabase
      .from('transfers')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar repasse no Supabase:', error);
      return null;
    }

    return dbToTransfer(data);
  } catch (error) {
    console.error('Erro inesperado ao atualizar repasse:', error);
    return null;
  }
};

export const deleteTransfer = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('transfers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao deletar repasse do Supabase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro inesperado ao deletar repasse:', error);
    return false;
  }
};
