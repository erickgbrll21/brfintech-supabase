// Serviço para gerenciar taxas dos clientes
import { supabase } from '../lib/supabase';

export interface CustomerTax {
  customerId: string;
  taxRate: number; // Taxa em porcentagem (ex: 2.5 para 2.5%)
  updatedAt: string;
  updatedBy?: string; // ID do admin que atualizou
}

// Obter todas as taxas
export const getAllCustomerTaxes = async (): Promise<CustomerTax[]> => {
  try {
    const { data, error } = await supabase
      .from('customer_taxes')
      .select('*');

    if (error) {
      console.error('Erro ao buscar taxas do Supabase:', error);
      return [];
    }

    return (data || []).map((tax: any) => ({
      customerId: tax.customer_id,
      taxRate: parseFloat(tax.tax_rate) || 0,
      updatedAt: tax.updated_at || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Erro inesperado ao buscar taxas:', error);
    return [];
  }
};

// Obter taxa de um cliente específico
export const getCustomerTax = async (customerId: string): Promise<number | null> => {
  try {
    const { data, error } = await supabase
      .from('customer_taxes')
      .select('tax_rate')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error) {
      // Se o erro for PGRST116 (no rows), retornar null (normal)
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Erro ao buscar taxa do cliente:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return parseFloat(data.tax_rate) || null;
  } catch (error) {
    console.error('Erro ao buscar taxa do cliente:', error);
    return null;
  }
};

// Salvar ou atualizar taxa de um cliente
export const saveCustomerTax = async (
  customerId: string,
  taxRate: number,
  _updatedBy?: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('customer_taxes')
      .upsert({
        customer_id: customerId,
        tax_rate: taxRate,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Erro ao salvar taxa no Supabase:', error);
      throw error;
    }

    // Disparar evento para atualizar dashboards em tempo real
    window.dispatchEvent(new CustomEvent('spreadsheetUpdated', {
      detail: { customerId }
    }));
  } catch (error) {
    console.error('Erro ao salvar taxa:', error);
    throw error;
  }
};

// Deletar taxa de um cliente
export const deleteCustomerTax = async (customerId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('customer_taxes')
      .delete()
      .eq('customer_id', customerId);

    if (error) {
      console.error('Erro ao deletar taxa do Supabase:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erro ao deletar taxa:', error);
    throw error;
  }
};
