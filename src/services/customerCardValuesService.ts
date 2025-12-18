// Serviço para gerenciar valores customizados dos cards dos clientes
import { getTransfers, updateTransfer } from './transferService';
import { Transfer } from '../types';
import { supabase } from '../lib/supabase';

export interface CustomerCardValues {
  customerId: string;
  terminalId?: string; // ID da conta (opcional - se não fornecido, é valor geral do cliente)
  referenceMonth?: string; // Mês de referência para planilhas mensais (YYYY-MM)
  referenceDate?: string; // Data de referência para planilhas diárias (YYYY-MM-DD)
  type?: 'monthly' | 'daily'; // Tipo de planilha
  quantidadeVendas?: number;
  valorBruto?: number;
  taxa?: number;
  valorLiquido?: number;
  updatedAt: string;
  updatedBy?: string; // ID do admin que atualizou
}

// Gerar ID único para armazenamento por planilha específica
const generateId = (
  customerId: string,
  terminalId?: string,
  referenceMonth?: string,
  referenceDate?: string,
  type?: 'monthly' | 'daily'
): string => {
  const parts = [customerId];
  if (terminalId) parts.push(`term_${terminalId}`);
  if (type === 'monthly' && referenceMonth) {
    parts.push(`month_${referenceMonth}`);
  } else if (type === 'daily' && referenceDate) {
    parts.push(`date_${referenceDate}`);
  }
  return parts.join('_');
};

// Obter valores customizados de uma planilha específica
export const getCustomerCardValues = async (
  customerId: string,
  terminalId?: string,
  referenceMonth?: string,
  referenceDate?: string,
  type?: 'monthly' | 'daily'
): Promise<CustomerCardValues | null> => {
  try {
    // Tentar buscar com os parâmetros específicos primeiro
    const specificId = generateId(customerId, terminalId, referenceMonth, referenceDate, type);
    let { data, error } = await supabase
      .from('customer_card_values')
      .select('*')
      .eq('id', specificId)
      .maybeSingle();

    // Se não encontrou com parâmetros específicos, tentar buscar valores gerais do mesmo tipo
    if (error && type) {
      const generalIdSameType = generateId(customerId, terminalId, undefined, undefined, type);
      const result = await supabase
        .from('customer_card_values')
        .select('*')
        .eq('id', generalIdSameType)
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    // Se ainda não encontrou, tentar buscar valores gerais sem tipo
    if (error) {
      const generalId = generateId(customerId, terminalId, undefined, undefined, undefined);
      const result = await supabase
        .from('customer_card_values')
        .select('*')
        .eq('id', generalId)
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      return null;
    }

    return {
      customerId: data.customer_id,
      terminalId: data.terminal_id || undefined,
      referenceMonth: referenceMonth || undefined,
      referenceDate: referenceDate || undefined,
      type: type || undefined,
      quantidadeVendas: data.quantidade_vendas || 0,
      valorBruto: parseFloat(data.valor_bruto) || 0,
      taxa: parseFloat(data.taxa) || 0,
      valorLiquido: parseFloat(data.valor_liquido) || 0,
      updatedAt: data.updated_at || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Erro ao carregar valores dos cards:', error);
    return null;
  }
};

// Salvar valores customizados dos cards para uma planilha específica
export const saveCustomerCardValues = async (
  customerId: string,
  values: {
    quantidadeVendas?: number;
    valorBruto?: number;
    taxa?: number;
    valorLiquido?: number;
  },
      _updatedBy?: string,
  terminalId?: string,
  referenceMonth?: string,
  referenceDate?: string,
  type?: 'monthly' | 'daily'
): Promise<void> => {
  try {
    const id = generateId(customerId, terminalId, referenceMonth, referenceDate, type);

    const { error } = await supabase
      .from('customer_card_values')
      .upsert({
        id,
        customer_id: customerId,
        terminal_id: terminalId || null,
        quantidade_vendas: values.quantidadeVendas || 0,
        valor_bruto: values.valorBruto || 0,
        taxa: values.taxa || 0,
        valor_liquido: values.valorLiquido || 0,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Erro ao salvar valores dos cards no Supabase:', error);
      throw error;
    }

    // Atualizar repasses existentes com os valores customizados
    updateTransfersWithCustomValues(customerId, terminalId, referenceMonth, referenceDate, type, values).catch(err => {
      console.error('Erro ao atualizar repasses com valores customizados:', err);
    });

    // Disparar evento para atualizar dashboards
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cardValuesUpdated', {
        detail: { customerId, terminalId, referenceMonth, referenceDate, type }
      }));
    }, 50);
  } catch (error) {
    console.error('Erro ao salvar valores dos cards:', error);
    throw error;
  }
};

// Deletar valores customizados de uma planilha específica (voltar a usar valores da planilha)
export const deleteCustomerCardValues = async (
  customerId: string,
  terminalId?: string,
  referenceMonth?: string,
  referenceDate?: string,
  type?: 'monthly' | 'daily'
): Promise<void> => {
  try {
    const id = generateId(customerId, terminalId, referenceMonth, referenceDate, type);

    const { error } = await supabase
      .from('customer_card_values')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao deletar valores dos cards do Supabase:', error);
      throw error;
    }

    // Disparar evento para atualizar dashboards
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cardValuesUpdated', {
        detail: { customerId, terminalId, referenceMonth, referenceDate, type }
      }));
    }, 50);
  } catch (error) {
    console.error('Erro ao deletar valores dos cards:', error);
    throw error;
  }
};

// Atualizar repasses existentes com valores customizados dos cards
const updateTransfersWithCustomValues = async (
  customerId: string,
  _terminalId: string | undefined,
  referenceMonth: string | undefined,
  referenceDate: string | undefined,
  type: 'monthly' | 'daily' | undefined,
  values: {
    quantidadeVendas?: number;
    valorBruto?: number;
    taxa?: number;
    valorLiquido?: number;
  }
): Promise<void> => {
  try {
    const transfers = await getTransfers();

    // Determinar período para buscar repasses correspondentes
    let periodoToMatch: string | undefined;
    if (type === 'daily' && referenceDate) {
      const date = new Date(referenceDate);
      periodoToMatch = date.toLocaleDateString('pt-BR');
    } else if (referenceMonth) {
      const [year, month] = referenceMonth.split('-');
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoToMatch = `${monthNames[parseInt(month) - 1]}/${year}`;
    }

    // Buscar repasses do mesmo cliente e período
    const matchingTransfers = transfers.filter(t =>
      t.customerId === customerId &&
      t.periodo === periodoToMatch
    );

    if (matchingTransfers.length === 0) {
      return; // Não há repasses para atualizar
    }

    // Calcular valores atualizados usando os valores dos cards
    let valorBruto = values.valorBruto;
    let taxas: number | undefined;
    let valorLiquido = values.valorLiquido;

    // Taxa: usar valor absoluto dos cards se existir (já está em R$), senão calcular 5,10% do valor bruto
    if (values.taxa !== undefined && values.taxa > 0) {
      taxas = values.taxa;
    } else if (valorBruto !== undefined && valorBruto > 0) {
      taxas = valorBruto * 0.051;
    }

    // Calcular valor líquido se não estiver definido
    if ((!valorLiquido || valorLiquido <= 0) && valorBruto && taxas) {
      valorLiquido = valorBruto - taxas;
    }

    // Atualizar cada repasse encontrado com os valores dos cards
    for (const transfer of matchingTransfers) {
      const updates: Partial<Transfer> = {};

      if (valorBruto !== undefined && valorBruto > 0) {
        updates.valorBruto = valorBruto;
      }

      if (taxas !== undefined && taxas >= 0) {
        updates.taxas = taxas;
      }

      if (valorLiquido !== undefined && valorLiquido > 0) {
        updates.valorLiquido = valorLiquido;
      }

      if (Object.keys(updates).length > 0) {
        await updateTransfer(transfer.id, updates);
      }
    }

    console.log(`Repasses atualizados com valores customizados: ${matchingTransfers.length} repasse(s)`);
  } catch (error) {
    console.error('Erro ao atualizar repasses com valores customizados:', error);
  }
};
