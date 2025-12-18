// Serviço para sincronizar transações Cielo com vendas na dashboard
import { getCieloTransactions } from './cieloService';
import { getCustomers } from './customerService';
import { Sale, CieloTransaction } from '../types';

// Cache de transações já sincronizadas (em produção, isso seria no backend)
const SYNCED_TRANSACTIONS = new Set<string>();

/**
 * Converte uma transação Cielo em uma venda para a dashboard
 */
const convertCieloTransactionToSale = (
  transaction: CieloTransaction,
  customerId: string,
  customerName: string,
  customerRegion: string,
  terminalId?: string
): Sale => {
  // Cielo retorna valores em centavos, converter para reais
  const amount = transaction.Payment.Amount / 100;
  
  // Mapear status da Cielo para status de venda
  let status: 'completed' | 'pending' | 'cancelled' = 'pending';
  if (transaction.Payment.Status === 2) {
    status = 'completed'; // Pagamento confirmado
  } else if (transaction.Payment.Status === 3 || transaction.Payment.Status === 10) {
    status = 'cancelled'; // Negada ou Cancelada
  }

  // Determinar método de pagamento
  let paymentMethod = transaction.Payment.Type;
  if (transaction.Payment.CreditCard) {
    paymentMethod = `${transaction.Payment.CreditCard.Brand} - ${transaction.Payment.Type}`;
  }

  return {
    id: `cielo_${transaction.PaymentId}`,
    date: new Date(transaction.CreatedDate).toISOString().split('T')[0],
    amount,
    product: `Transação Cielo - ${paymentMethod}`,
    region: customerRegion,
    seller: 'Sistema Cielo',
    customerId,
    customerName,
    status,
    paymentMethod,
    cieloTransactionId: transaction.PaymentId,
    cieloTerminalId: terminalId,
  };
};

/**
 * Sincroniza transações Cielo com vendas na dashboard
 */
export const syncCieloTransactionsToSales = async (terminalId?: string): Promise<Sale[]> => {
  try {
    // Buscar todos os clientes com conta Cielo configurada
    const customers = await getCustomers();
    
    // Filtrar clientes com terminais (novo formato) ou cieloTerminalId (compatibilidade)
    const customersWithTerminal = customers.filter(c => 
      (c.cieloTerminals && c.cieloTerminals.length > 0) || c.cieloTerminalId
    );

    if (customersWithTerminal.length === 0) {
      return [];
    }

    // Buscar todas as transações Cielo
    const cieloTransactions = await getCieloTransactions();

    // Criar mapa de terminal ID para cliente
    const terminalToCustomer = new Map<string, typeof customersWithTerminal[0]>();
    customersWithTerminal.forEach(customer => {
      // Suporte para múltiplas contas
      if (customer.cieloTerminals && customer.cieloTerminals.length > 0) {
        customer.cieloTerminals.forEach(term => {
          terminalToCustomer.set(term.terminalId, customer);
        });
      }
      // Compatibilidade com formato antigo
      if (customer.cieloTerminalId) {
        terminalToCustomer.set(customer.cieloTerminalId, customer);
      }
    });

    // Converter transações Cielo em vendas
    const newSales: Sale[] = [];
    
    cieloTransactions.forEach(transaction => {
      // Verificar se já foi sincronizada
      if (SYNCED_TRANSACTIONS.has(transaction.PaymentId)) {
        return;
      }

      // Tentar associar transação a um cliente através do MerchantOrderId ou PaymentId
      // Em produção, isso seria feito através de uma relação mais precisa
      let matchedCustomer = null;
      
      // Estratégia 1: Tentar match pelo MerchantOrderId (se contiver o terminal ID)
      if (transaction.MerchantOrderId) {
        for (const [terminalId, customer] of terminalToCustomer.entries()) {
          // Verificar se o MerchantOrderId contém o terminal ID ou é igual
          if (transaction.MerchantOrderId.includes(terminalId) || 
              transaction.MerchantOrderId === terminalId ||
              transaction.MerchantOrderId.startsWith(terminalId) ||
              transaction.MerchantOrderId.endsWith(terminalId)) {
            matchedCustomer = customer;
            break;
          }
        }
      }

      // Estratégia 2: Tentar pelo PaymentId (algumas vezes o terminal ID está no PaymentId)
      if (!matchedCustomer) {
        for (const [terminalId, customer] of terminalToCustomer.entries()) {
          if (transaction.PaymentId.includes(terminalId) || 
              transaction.PaymentId === terminalId) {
            matchedCustomer = customer;
            break;
          }
        }
      }

      // Estratégia 3: Se não encontrou, tentar pelo nome do cliente na transação
      if (!matchedCustomer) {
        matchedCustomer = customersWithTerminal.find(
          c => {
            const transactionName = transaction.Customer.Name.toLowerCase().trim();
            const customerName = c.name.toLowerCase().trim();
            return transactionName === customerName || 
                   transactionName.includes(customerName) ||
                   customerName.includes(transactionName);
          }
        );
      }

      // Se encontrou um cliente correspondente, criar a venda
      if (matchedCustomer) {
        // Encontrar qual terminal foi usado (se houver múltiplos)
        let usedTerminalId: string | undefined;
        if (matchedCustomer.cieloTerminals && matchedCustomer.cieloTerminals.length > 0) {
          // Tentar encontrar o terminal específico usado nesta transação
          for (const term of matchedCustomer.cieloTerminals) {
            if (transaction.MerchantOrderId?.includes(term.terminalId) ||
                transaction.PaymentId?.includes(term.terminalId)) {
              usedTerminalId = term.terminalId;
              break;
            }
          }
          // Se não encontrou, usar o primeiro terminal
          if (!usedTerminalId) {
            usedTerminalId = matchedCustomer.cieloTerminals[0].terminalId;
          }
        } else if (matchedCustomer.cieloTerminalId) {
          usedTerminalId = matchedCustomer.cieloTerminalId;
        }
        
        const sale = convertCieloTransactionToSale(
          transaction,
          matchedCustomer.id,
          matchedCustomer.name,
          matchedCustomer.region,
          usedTerminalId
        );
        
        // Filtrar por terminalId se especificado
        if (!terminalId || sale.cieloTerminalId === terminalId) {
          newSales.push(sale);
          SYNCED_TRANSACTIONS.add(transaction.PaymentId);
        }
      }
    });

    return newSales;
  } catch (error) {
    console.error('Erro ao sincronizar transações Cielo:', error);
    return [];
  }
};

/**
 * Obtém apenas as vendas sincronizadas da Cielo (sem chamar getSales para evitar loop)
 */
export const getAllSalesIncludingCielo = async (filters?: any): Promise<Sale[]> => {
  // Sincronizar transações Cielo (filtrar por terminalId se especificado)
  const cieloSales = await syncCieloTransactionsToSales(filters?.terminalId);
  
  // Aplicar filtros se necessário
  if (filters) {
    let filtered = cieloSales;
    
    if (filters.startDate) {
      filtered = filtered.filter(sale => sale.date >= filters.startDate!);
    }
    if (filters.endDate) {
      filtered = filtered.filter(sale => sale.date <= filters.endDate!);
    }
    if (filters.product) {
      filtered = filtered.filter(sale => sale.product === filters.product);
    }
    if (filters.region) {
      filtered = filtered.filter(sale => sale.region === filters.region);
    }
    if (filters.seller) {
      filtered = filtered.filter(sale => sale.seller === filters.seller);
    }
    if (filters.terminalId) {
      filtered = filtered.filter(sale => sale.cieloTerminalId === filters.terminalId);
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  
  return cieloSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

