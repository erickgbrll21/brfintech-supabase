import { Sale, SalesMetrics, FilterOptions } from '../types';
import { getAllSalesIncludingCielo } from './cieloSalesSync';

// Dados de vendas - zerado e pronto para uso
const ALL_SALES: Sale[] = [];

// Funções para gerenciar vendas manualmente
export const createSale = async (sale: Omit<Sale, 'id'>): Promise<Sale> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newSale: Sale = {
    ...sale,
    id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
  ALL_SALES.push(newSale);
  return newSale;
};

export const updateSale = async (id: string, updates: Partial<Sale>): Promise<Sale | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const saleIndex = ALL_SALES.findIndex(s => s.id === id);
  if (saleIndex !== -1) {
    // Não permitir editar vendas da Cielo (começam com cielo_)
    if (ALL_SALES[saleIndex].id.startsWith('cielo_')) {
      return null;
    }
    Object.assign(ALL_SALES[saleIndex], updates);
    return { ...ALL_SALES[saleIndex] };
  }
  return null;
};

export const deleteSale = async (id: string): Promise<boolean> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const saleIndex = ALL_SALES.findIndex(s => s.id === id);
  if (saleIndex !== -1) {
    // Não permitir deletar vendas da Cielo (começam com cielo_)
    if (ALL_SALES[saleIndex].id.startsWith('cielo_')) {
      return false;
    }
    ALL_SALES.splice(saleIndex, 1);
    return true;
  }
  return false;
};

export const getSalesByCustomerId = async (customerId: string): Promise<Sale[]> => {
  const allSales = await getSales();
  return allSales.filter(sale => sale.customerId === customerId);
};

export const getSales = async (filters?: FilterOptions): Promise<Sale[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 500));

  // Buscar vendas incluindo as sincronizadas da Cielo
  const allSales = await getAllSalesIncludingCielo(filters);
  
  // Combinar com vendas locais
  let filteredSales = [...ALL_SALES, ...allSales];

  if (filters) {
    if (filters.startDate) {
      filteredSales = filteredSales.filter(sale => sale.date >= filters.startDate!);
    }
    if (filters.endDate) {
      filteredSales = filteredSales.filter(sale => sale.date <= filters.endDate!);
    }
    if (filters.product) {
      filteredSales = filteredSales.filter(sale => sale.product === filters.product);
    }
    if (filters.region) {
      filteredSales = filteredSales.filter(sale => sale.region === filters.region);
    }
    if (filters.seller) {
      filteredSales = filteredSales.filter(sale => sale.seller === filters.seller);
    }
    if (filters.terminalId) {
      filteredSales = filteredSales.filter(sale => sale.cieloTerminalId === filters.terminalId);
    }
  }

  // Remover duplicatas baseado no ID
  const uniqueSales = Array.from(
    new Map(filteredSales.map(sale => [sale.id, sale])).values()
  );

  return uniqueSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const getSalesMetrics = async (filters?: FilterOptions): Promise<SalesMetrics> => {
  const sales = await getSales(filters);
  const completedSales = sales.filter(s => s.status === 'completed');
  
  const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalSales = completedSales.length;
  const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
  
  const uniqueCustomers = new Set(completedSales.map(s => s.customerId));
  const activeCustomers = uniqueCustomers.size;
  
  const transactionsVolume = completedSales.reduce((sum, sale) => sum + sale.amount, 0);
  
  // Calcular crescimento comparando com período anterior
  const previousPeriodSales = await getSales({
    ...filters,
    startDate: filters?.startDate ? 
      new Date(new Date(filters.startDate).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : 
      undefined,
    endDate: filters?.startDate ? filters.startDate : undefined,
  });
  const previousRevenue = previousPeriodSales
    .filter(s => s.status === 'completed')
    .reduce((sum, sale) => sum + sale.amount, 0);
  
  const growthRate = previousRevenue > 0 
    ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
    : 0;

  return {
    totalSales,
    totalRevenue,
    averageTicket,
    activeCustomers,
    transactionsVolume,
    growthRate,
  };
};

export const getSalesByPeriod = async (period: 'day' | 'week' | 'month', filters?: FilterOptions) => {
  const sales = await getSales(filters);
  const completedSales = sales.filter(s => s.status === 'completed');
  
  const grouped: { [key: string]: number } = {};
  
  completedSales.forEach(sale => {
    const date = new Date(sale.date);
    let key: string;
    
    if (period === 'day') {
      key = sale.date;
    } else if (period === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    grouped[key] = (grouped[key] || 0) + sale.amount;
  });
  
  return Object.entries(grouped)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const getSalesByProduct = async (filters?: FilterOptions) => {
  const sales = await getSales(filters);
  const completedSales = sales.filter(s => s.status === 'completed');
  
  const grouped: { [key: string]: number } = {};
  
  completedSales.forEach(sale => {
    grouped[sale.product] = (grouped[sale.product] || 0) + sale.amount;
  });
  
  return Object.entries(grouped)
    .map(([product, amount]) => ({ product, amount }))
    .sort((a, b) => b.amount - a.amount);
};

export const getSalesByRegion = async (filters?: FilterOptions) => {
  const sales = await getSales(filters);
  const completedSales = sales.filter(s => s.status === 'completed');
  
  const grouped: { [key: string]: number } = {};
  
  completedSales.forEach(sale => {
    grouped[sale.region] = (grouped[sale.region] || 0) + sale.amount;
  });
  
  return Object.entries(grouped)
    .map(([region, amount]) => ({ region, amount }))
    .sort((a, b) => b.amount - a.amount);
};

