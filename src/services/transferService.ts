import { Transfer } from '../types';
import { supabase } from '../lib/supabase';

// Converter dados do banco para formato Transfer
const dbToTransfer = (dbTransfer: any): Transfer => {
  return {
    id: dbTransfer.id,
    periodo: dbTransfer.periodo || '',
    valorBruto: parseFloat(dbTransfer.valor_bruto) || 0,
    taxas: parseFloat(dbTransfer.taxas) || 0,
    valorLiquido: parseFloat(dbTransfer.valor_liquido) || 0,
    status: dbTransfer.status || 'pendente',
    dataEnvio: dbTransfer.data_envio || null,
    customerId: dbTransfer.customer_id || null,
    customerName: dbTransfer.customer_name || null,
    createdAt: dbTransfer.created_at || new Date().toISOString(),
  };
};

// Converter Transfer para formato do banco
const transferToDb = (transfer: Omit<Transfer, 'id' | 'createdAt'>) => {
  return {
    periodo: transfer.periodo || null,
    valor_bruto: transfer.valorBruto,
    taxas: transfer.taxas,
    valor_liquido: transfer.valorLiquido,
    status: transfer.status || 'pendente',
    data_envio: transfer.dataEnvio || null,
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
