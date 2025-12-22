// Serviço para gerenciar planilhas Excel dos clientes

import { SpreadsheetSale } from '../types';
import { getCustomerTax } from './customerTaxService';
import { createTransfer } from './transferService';
import { getCustomers } from './customerService';
import { getCustomerCardValues } from './customerCardValuesService';
import { supabase } from '../lib/supabase';

// Interface para métricas calculadas da planilha
export interface SpreadsheetMetrics {
  totalLinhas: number;
  totalColunas: number;
  totalVendas: number;
  valorBrutoTotal: number;
  valorLiquidoTotal: number;
  taxaMedia: number;
  estabelecimentosUnicos: number;
  formasPagamentoUnicas: number;
  bandeirasUnicas: number;
  parcelasMedias: number;
  vendasAprovadas: number;
  vendasPendentes: number;
  vendasCanceladas: number;
  hasCustomValues?: boolean;
}

export interface SpreadsheetData {
  id?: string; // ID único da planilha (para histórico)
  customerId: string;
  terminalId?: string; // ID da conta (opcional - se não fornecido, é planilha do cliente)
  fileName: string;
  uploadedAt: string;
  referenceMonth: string; // Mês de referência no formato YYYY-MM (ex: "2024-01")
  referenceDate?: string; // Data específica para planilhas diárias no formato YYYY-MM-DD (ex: "2024-01-15")
  type?: 'monthly' | 'daily'; // Tipo de planilha: mensal (padrão) ou diária
  data: Array<Record<string, any>>; // Array de objetos representando as linhas da planilha (dados brutos)
  headers: string[]; // Cabeçalhos das colunas
  sales: SpreadsheetSale[]; // Dados estruturados de vendas
  originalFile?: string; // Arquivo original em base64 para preservar formatação exata
  description?: string; // Descrição da planilha (editável apenas por administradores)
}

// Mapear nomes de colunas permitidas para campos padronizados
// APENAS estas colunas serão lidas da planilha
const FIELD_MAPPINGS: Record<string, string> = {
  // Data da venda
  'data da venda': 'dataVenda',
  'data venda': 'dataVenda',
  'data': 'dataVenda',
  'data de venda': 'dataVenda',
  'date': 'dataVenda',
  
  // Hora da venda
  'hora da venda': 'horaVenda',
  'hora venda': 'horaVenda',
  'hora': 'horaVenda',
  'hora de venda': 'horaVenda',
  'time': 'horaVenda',
  'horário': 'horaVenda',
  
  // Estabelecimento
  'estabelecimento': 'estabelecimento',
  'loja': 'estabelecimento',
  'store': 'estabelecimento',
  'nome estabelecimento': 'estabelecimento',
  
  // CPF/CNPJ do estabelecimento
  'cpf/cnpj': 'cpfCnpj',
  'cpf cnpj': 'cpfCnpj',
  'cpf': 'cpfCnpj',
  'cnpj': 'cpfCnpj',
  'cpf/cnpj do estabelecimento': 'cpfCnpj',
  'cpf cnpj estabelecimento': 'cpfCnpj',
  
  // Forma de pagamento
  'forma de pagamento': 'formaPagamento',
  'forma pagamento': 'formaPagamento',
  'pagamento': 'formaPagamento',
  'payment': 'formaPagamento',
  'tipo pagamento': 'formaPagamento',
  
  // Quantidade total de parcelas
  'quantidade total de parcelas': 'quantidadeParcelas',
  'quantidade parcelas': 'quantidadeParcelas',
  'parcelas': 'quantidadeParcelas',
  'qtd parcelas': 'quantidadeParcelas',
  'total parcelas': 'quantidadeParcelas',
  'installments': 'quantidadeParcelas',
  
  // Bandeira
  'bandeira': 'bandeira',
  'bandeira cartão': 'bandeira',
  'cartão': 'bandeira',
  'card': 'bandeira',
  'brand': 'bandeira',
  
  // Valor bruto
  'valor bruto': 'valorBruto',
  'valor': 'valorBruto',
  'bruto': 'valorBruto',
  'total': 'valorBruto',
  
  // Status da venda
  'status da venda': 'statusVenda',
  'status venda': 'statusVenda',
  'status': 'statusVenda',
  'status de venda': 'statusVenda',
  'situação': 'statusVenda',
  
  // Tipo de lançamento
  'tipo de lançamento': 'tipoLancamento',
  'tipo lançamento': 'tipoLancamento',
  'tipo lancamento': 'tipoLancamento',
  'lançamento': 'tipoLancamento',
  'lancamento': 'tipoLancamento',
  
  // Data do lançamento
  'data do lançamento': 'dataLancamento',
  'data lançamento': 'dataLancamento',
  'data lancamento': 'dataLancamento',
  'data de lançamento': 'dataLancamento',
  
  // Número da máquina
  'número da máquina': 'numeroMaquina',
  'numero da maquina': 'numeroMaquina',
  'número máquina': 'numeroMaquina',
  'numero maquina': 'numeroMaquina',
  'num máquina': 'numeroMaquina',
  'num maquina': 'numeroMaquina',
  'máquina': 'numeroMaquina',
  'maquina': 'numeroMaquina',
};

// Normalizar nome da coluna para comparação
const normalizeColumnName = (name: string): string => {
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

// Encontrar índice da coluna pelo nome (com mapeamento)
const findColumnIndex = (headers: string[], fieldName: string): number | null => {
  // Primeiro, tentar encontrar exatamente
  const exactIndex = headers.findIndex(h => normalizeColumnName(h) === fieldName);
  if (exactIndex >= 0) return exactIndex;
  
  // Depois, tentar pelo mapeamento
  for (const [key, mappedField] of Object.entries(FIELD_MAPPINGS)) {
    if (mappedField === fieldName) {
      const mappedIndex = headers.findIndex(h => normalizeColumnName(h) === key);
      if (mappedIndex >= 0) return mappedIndex;
    }
  }
  
  // Tentar encontrar por similaridade
  const normalizedField = normalizeColumnName(fieldName);
  for (let i = 0; i < headers.length; i++) {
    const normalizedHeader = normalizeColumnName(headers[i]);
    if (normalizedHeader.includes(normalizedField) || normalizedField.includes(normalizedHeader)) {
      return i;
    }
  }
  
  return null;
};

// Converter dados brutos para dados estruturados
export const parseSpreadsheetToSales = async (
  rawData: Array<Record<string, any>>,
  headers: string[],
  customerId: string
): Promise<SpreadsheetSale[]> => {
  const sales: SpreadsheetSale[] = [];
  const customerTax = await getCustomerTax(customerId);
  
  for (const row of rawData) {
    try {
      // Função auxiliar para extrair valor
      const getValue = (fieldName: string, defaultValue: any = null): any => {
        const index = findColumnIndex(headers, fieldName);
        if (index === null) {
          // Tentar buscar pelo nome da coluna diretamente
          const header = headers.find(h => normalizeColumnName(h) === fieldName);
          if (header && row[header] !== undefined) {
            return row[header];
          }
          return defaultValue;
        }
        const header = headers[index];
        return row[header] !== undefined ? row[header] : defaultValue;
      };
      
      // Extrair e converter valores
      const quantidadeVendas = Number(getValue('quantidadeVendas', 0)) || 0;
      const valorBruto = parseFloat(String(getValue('valorBruto', 0)).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      
      // Taxa: usar do cliente se configurada, senão usar da planilha
      let taxaTotal = parseFloat(String(getValue('taxaTotal', 0)).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      if (customerTax !== null) {
        taxaTotal = customerTax;
      }
      
      // Calcular valor líquido se não estiver na planilha
      let valorLiquido = parseFloat(String(getValue('valorLiquido', 0)).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      if (valorLiquido === 0 && valorBruto > 0 && taxaTotal > 0) {
        valorLiquido = valorBruto - (valorBruto * (taxaTotal / 100));
      }
      
      const dataVenda = String(getValue('dataVenda', ''));
      const horaVenda = String(getValue('horaVenda', ''));
      const estabelecimento = String(getValue('estabelecimento', ''));
      const cpfCnpj = String(getValue('cpfCnpj', ''));
      const formaPagamento = String(getValue('formaPagamento', ''));
      const quantidadeParcelas = Number(getValue('quantidadeParcelas', 0)) || 0;
      const bandeira = String(getValue('bandeira', ''));
      const statusVenda = String(getValue('statusVenda', ''));
      const tipoLancamento = String(getValue('tipoLancamento', ''));
      const dataLancamento = String(getValue('dataLancamento', ''));
      const numeroMaquina = String(getValue('numeroMaquina', ''));
      
      sales.push({
        quantidadeVendas,
        valorBruto,
        taxaTotal,
        valorLiquido,
        dataVenda,
        horaVenda,
        estabelecimento,
        cpfCnpj,
        formaPagamento,
        quantidadeParcelas,
        bandeira,
        statusVenda,
        tipoLancamento,
        dataLancamento,
        numeroMaquina,
      });
    } catch (error) {
      console.error('Erro ao processar linha da planilha:', error, row);
      // Continuar processando outras linhas
    }
  }
  
  return sales;
};

// Calcular métricas agregadas da planilha
export const calculateSpreadsheetMetrics = async (spreadsheet: SpreadsheetData): Promise<SpreadsheetMetrics> => {
  const metrics: SpreadsheetMetrics = {
    totalLinhas: spreadsheet.data.length,
    totalColunas: spreadsheet.headers.length,
    totalVendas: 0,
    valorBrutoTotal: 0,
    valorLiquidoTotal: 0,
    taxaMedia: 0,
    estabelecimentosUnicos: 0,
    formasPagamentoUnicas: 0,
    bandeirasUnicas: 0,
    parcelasMedias: 0,
    vendasAprovadas: 0,
    vendasPendentes: 0,
    vendasCanceladas: 0,
  };

  // Obter taxa configurada pelo administrador
  const customerTax = await getCustomerTax(spreadsheet.customerId);

  // Sempre ler diretamente dos dados brutos da planilha para manter valores exatos
  // Encontrar colunas relevantes - buscar em TODAS as colunas disponíveis
  
  // Buscar quantidade de vendas - tentar vários nomes possíveis
  let quantidadeHeader = spreadsheet.headers.find(h => {
    const normalized = normalizeColumnName(h);
    return normalized === 'quantidade de vendas' ||
           normalized === 'quantidade vendas' ||
           normalized === 'qtd vendas';
  });
  
  if (!quantidadeHeader) {
    quantidadeHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('quantidade') && normalized.includes('venda');
    });
  }
  
  if (!quantidadeHeader) {
    quantidadeHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized === 'quantidade' || normalized === 'qtd';
    });
  }

  // Buscar valor bruto
  let valorBrutoHeader = spreadsheet.headers.find(h => {
    const normalized = normalizeColumnName(h);
    return normalized === 'valor bruto';
  });
  
  if (!valorBrutoHeader) {
    valorBrutoHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('valor') && normalized.includes('bruto') && !normalized.includes('liquido');
    });
  }
  
  if (!valorBrutoHeader) {
    valorBrutoHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('valor') && !normalized.includes('liquido') && !normalized.includes('taxa');
    });
  }

  // Buscar valor líquido
  const valorLiquidoHeader = spreadsheet.headers.find(h => {
    const normalized = normalizeColumnName(h);
    return normalized === 'valor liquido' ||
           normalized === 'valor líquido' ||
           (normalized.includes('valor') && normalized.includes('liquido'));
  });

  // Buscar taxa
  let taxaHeader = spreadsheet.headers.find(h => {
    const normalized = normalizeColumnName(h);
    return normalized === 'taxa total' ||
           (normalized.includes('taxa') && normalized.includes('total'));
  });
  
  if (!taxaHeader) {
    taxaHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized === 'taxa';
    });
  }
  
  if (!taxaHeader) {
    taxaHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('taxa');
    });
  }

  // Processar TODAS as linhas da planilha preservando valores exatos
  // IMPORTANTE: Somar valores diretamente da planilha sem alterações
  spreadsheet.data.forEach((row) => {
    // Quantidade de vendas - somar todas as quantidades EXATAS da planilha
    if (quantidadeHeader && row[quantidadeHeader] !== undefined && row[quantidadeHeader] !== null && row[quantidadeHeader] !== '') {
      const qtdValue = row[quantidadeHeader];
      // Preservar valor exato - se for número, usar diretamente
      let qtd: number;
      if (typeof qtdValue === 'number') {
        qtd = qtdValue;
      } else {
        // Converter string mantendo precisão
        const qtdStr = String(qtdValue).trim();
        // Remover apenas caracteres não numéricos, preservar vírgula e ponto
        const cleaned = qtdStr.replace(/[^\d,.-]/g, '').replace(',', '.');
        qtd = parseFloat(cleaned);
      }
      // Somar mesmo se for 0 ou negativo (preservar valores da planilha)
      if (!isNaN(qtd)) {
        metrics.totalVendas += qtd;
      }
    }

    // Valor bruto - somar TODOS os valores brutos EXATOS da planilha
    if (valorBrutoHeader && row[valorBrutoHeader] !== undefined && row[valorBrutoHeader] !== null && row[valorBrutoHeader] !== '') {
      const valorValue = row[valorBrutoHeader];
      let valor: number;
      
      // Se já for número, usar diretamente (preservar valor exato da planilha)
      if (typeof valorValue === 'number') {
        valor = valorValue;
      } else {
        // Converter string preservando decimais exatos
        const valorStr = String(valorValue).trim();
        // Detectar formato brasileiro (1.234,56) ou americano (1234.56)
        if (valorStr.includes(',') && valorStr.includes('.')) {
          // Formato brasileiro: 1.234,56 -> remover pontos de milhar, substituir vírgula por ponto
          const cleaned = valorStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
          valor = parseFloat(cleaned);
        } else if (valorStr.includes(',')) {
          // Apenas vírgula: 1234,56 -> substituir vírgula por ponto
          const cleaned = valorStr.replace(/[R$\s]/g, '').replace(',', '.');
          valor = parseFloat(cleaned);
        } else {
          // Formato americano ou número simples
          const cleaned = valorStr.replace(/[R$\s]/g, '');
          valor = parseFloat(cleaned);
        }
      }
      
      // Somar TODOS os valores, mesmo zero ou negativo (preservar valores da planilha)
      if (!isNaN(valor)) {
        metrics.valorBrutoTotal += valor;
      }
    }

    // Valor líquido (se existir na planilha) - somar TODOS os valores líquidos EXATOS da planilha
    if (valorLiquidoHeader && row[valorLiquidoHeader] !== undefined && row[valorLiquidoHeader] !== null && row[valorLiquidoHeader] !== '') {
      const valorValue = row[valorLiquidoHeader];
      let valor: number;
      
      // Se já for número, usar diretamente (preservar valor exato da planilha)
      if (typeof valorValue === 'number') {
        valor = valorValue;
      } else {
        // Converter string preservando decimais exatos
        const valorStr = String(valorValue).trim();
        // Detectar formato brasileiro (1.234,56) ou americano (1234.56)
        if (valorStr.includes(',') && valorStr.includes('.')) {
          // Formato brasileiro: 1.234,56 -> remover pontos de milhar, substituir vírgula por ponto
          const cleaned = valorStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
          valor = parseFloat(cleaned);
        } else if (valorStr.includes(',')) {
          // Apenas vírgula: 1234,56 -> substituir vírgula por ponto
          const cleaned = valorStr.replace(/[R$\s]/g, '').replace(',', '.');
          valor = parseFloat(cleaned);
        } else {
          // Formato americano ou número simples
          const cleaned = valorStr.replace(/[R$\s]/g, '');
          valor = parseFloat(cleaned);
        }
      }
      
      // Somar TODOS os valores, mesmo zero ou negativo (preservar valores da planilha)
      if (!isNaN(valor)) {
        metrics.valorLiquidoTotal += valor;
      }
    }
  });
  
  // Se não encontrou quantidade de vendas, contar linhas (cada linha = 1 venda)
  if (metrics.totalVendas === 0 && !quantidadeHeader) {
    metrics.totalVendas = spreadsheet.data.length;
  }

  // Taxa: usar do admin se configurada, senão usar da planilha (primeira taxa encontrada ou média)
  if (customerTax !== null) {
    metrics.taxaMedia = customerTax;
  } else {
    // Calcular taxa da planilha
    if (taxaHeader) {
      const taxas: number[] = [];
      spreadsheet.data.forEach(row => {
        if (row[taxaHeader] !== undefined && row[taxaHeader] !== null && row[taxaHeader] !== '') {
          const taxaValue = row[taxaHeader];
          let taxa: number;
          
          // Se já for número, usar diretamente
          if (typeof taxaValue === 'number') {
            taxa = taxaValue;
          } else {
            // Converter string para número
            const taxaStr = String(taxaValue).trim();
            // Remover símbolo de porcentagem e espaços, manter números, vírgulas e pontos
            const cleaned = taxaStr.replace(/[%\s]/g, '').replace(',', '.');
            taxa = parseFloat(cleaned);
          }
          
          if (!isNaN(taxa) && taxa > 0) {
            taxas.push(taxa);
          }
        }
      });
      if (taxas.length > 0) {
        // Usar primeira taxa encontrada para manter ordem, ou média se todas forem diferentes
        const primeiraTaxa = taxas[0];
        const todasIguais = taxas.every(t => Math.abs(t - primeiraTaxa) < 0.01);
        metrics.taxaMedia = todasIguais ? primeiraTaxa : taxas.reduce((sum, t) => sum + t, 0) / taxas.length;
      }
    }
  }

  // IMPORTANTE: Valor líquido deve ser lido diretamente da planilha
  // Só calcular se NÃO foi encontrado na planilha (valorLiquidoTotal ainda é 0) E tiver taxa disponível
  // Se valorLiquidoHeader não existe OU se existe mas a soma deu 0, então calcular
  if (!valorLiquidoHeader || (valorLiquidoHeader && metrics.valorLiquidoTotal === 0)) {
    if (metrics.valorBrutoTotal > 0 && metrics.taxaMedia > 0) {
      // Calcular apenas se não foi encontrado na planilha
      metrics.valorLiquidoTotal = metrics.valorBrutoTotal - (metrics.valorBrutoTotal * (metrics.taxaMedia / 100));
    }
  }

  // Se não encontrou quantidade, contar linhas com dados válidos
  if (metrics.totalVendas === 0) {
    const linhasComDados = spreadsheet.data.filter(row => {
      return Object.values(row).some(val => val !== null && val !== undefined && val !== '');
    }).length;
    metrics.totalVendas = linhasComDados;
  }
  
  // Calcular métricas adicionais usando dados estruturados se disponíveis
  if (spreadsheet.sales && spreadsheet.sales.length > 0) {
    const sales = spreadsheet.sales;
    const estabelecimentos = new Set(sales.map(s => s.estabelecimento).filter(e => e && e !== '-'));
    metrics.estabelecimentosUnicos = estabelecimentos.size;
    
    const formasPagamento = new Set(sales.map(s => s.formaPagamento).filter(f => f && f !== '-'));
    metrics.formasPagamentoUnicas = formasPagamento.size;
    
    const bandeiras = new Set(sales.map(s => s.bandeira).filter(b => b && b !== '-'));
    metrics.bandeirasUnicas = bandeiras.size;
    
    const parcelas = sales.filter(s => s.quantidadeParcelas > 0).map(s => s.quantidadeParcelas);
    metrics.parcelasMedias = parcelas.length > 0 ? parcelas.reduce((sum, p) => sum + p, 0) / parcelas.length : 0;
    
    sales.forEach(sale => {
      const status = sale.statusVenda?.toLowerCase() || '';
      if (status.includes('aprov') || status.includes('conclu')) {
        metrics.vendasAprovadas++;
      } else if (status.includes('pendente')) {
        metrics.vendasPendentes++;
      } else {
        metrics.vendasCanceladas++;
      }
    });
  } else {
    // Se não tiver dados estruturados, calcular a partir dos dados brutos
    // Contar estabelecimentos únicos (para estatísticas internas)
    const estabelecimentoHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('estabelecimento') || normalized.includes('loja');
    });
    
    if (estabelecimentoHeader) {
      const estabelecimentos = new Set(
        spreadsheet.data.map(row => String(row[estabelecimentoHeader] || '')).filter(e => e && e !== '-')
      );
      metrics.estabelecimentosUnicos = estabelecimentos.size;
    }

    // Contar formas de pagamento únicas (para estatísticas internas)
    const pagamentoHeader = spreadsheet.headers.find(h => {
      const normalized = normalizeColumnName(h);
      return normalized.includes('pagamento') || normalized.includes('forma');
    });
    
    if (pagamentoHeader) {
      const formasPagamento = new Set(
        spreadsheet.data.map(row => String(row[pagamentoHeader] || '')).filter(f => f && f !== '-')
      );
      metrics.formasPagamentoUnicas = formasPagamento.size;
    }
  }

  return metrics;
};

// Função auxiliar para converter dados do banco para SpreadsheetData
const dbToSpreadsheet = (dbRow: any): SpreadsheetData => {
  return {
    id: dbRow.id,
    customerId: dbRow.customer_id,
    terminalId: dbRow.terminal_id || undefined,
    fileName: dbRow.file_name || '',
    uploadedAt: dbRow.uploaded_at || new Date().toISOString(),
    referenceMonth: dbRow.reference_month || getReferenceMonth(dbRow.uploaded_at || new Date()),
    referenceDate: dbRow.reference_date || undefined,
    type: (dbRow.type || 'monthly') as 'monthly' | 'daily',
    data: dbRow.data?.data || [],
    headers: dbRow.headers || [],
    sales: dbRow.sales || [],
    originalFile: dbRow.original_file || undefined, // Arquivo original em base64
    description: dbRow.description || undefined, // Descrição da planilha
  };
};

// Função auxiliar para converter SpreadsheetData para formato do banco
const spreadsheetToDb = (spreadsheet: SpreadsheetData): any => {
  return {
    id: spreadsheet.id,
    customer_id: spreadsheet.customerId,
    terminal_id: spreadsheet.terminalId || null,
    file_name: spreadsheet.fileName,
    uploaded_at: spreadsheet.uploadedAt,
    reference_month: spreadsheet.referenceMonth,
    reference_date: spreadsheet.referenceDate || null,
    type: spreadsheet.type || 'monthly',
    data: { data: spreadsheet.data },
    headers: spreadsheet.headers,
    sales: spreadsheet.sales || [],
    original_file: spreadsheet.originalFile || null, // Arquivo original em base64
    description: spreadsheet.description || null, // Descrição da planilha
  };
};

// Obter todas as planilhas
export const getAllSpreadsheets = async (): Promise<SpreadsheetData[]> => {
  try {
    const { data, error } = await supabase
      .from('customer_spreadsheets')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar planilhas:', error);
      return [];
    }

    return (data || []).map(dbToSpreadsheet);
  } catch (error) {
    console.error('Erro ao carregar planilhas:', error);
    return [];
  }
};

// Obter planilha de um cliente específico (sem terminalId específico) - retorna a mais recente
export const getSpreadsheetByCustomerId = async (customerId: string, referenceMonth?: string, type: 'monthly' | 'daily' = 'monthly'): Promise<SpreadsheetData | null> => {
  try {
    let query = supabase
      .from('customer_spreadsheets')
      .select('*')
      .eq('customer_id', customerId)
      .is('terminal_id', null)
      .eq('type', type)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (referenceMonth) {
      query = query.eq('reference_month', referenceMonth);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar planilha do cliente:', error);
      return null;
    }

    if (!data || data.length === 0) return null;

    return dbToSpreadsheet(data[0]);
  } catch (error) {
    console.error('Erro ao buscar planilha do cliente:', error);
    return null;
  }
};

// Obter planilha de uma conta específica - retorna a mais recente
export const getSpreadsheetByTerminalId = async (terminalId: string, customerId?: string, referenceMonth?: string, type: 'monthly' | 'daily' = 'monthly'): Promise<SpreadsheetData | null> => {
  try {
    let query = supabase
      .from('customer_spreadsheets')
      .select('*')
      .eq('terminal_id', terminalId)
      .eq('type', type)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    if (referenceMonth) {
      query = query.eq('reference_month', referenceMonth);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar planilha do terminal:', error);
      return null;
    }

    if (!data || data.length === 0) return null;

    return dbToSpreadsheet(data[0]);
  } catch (error) {
    console.error('Erro ao buscar planilha do terminal:', error);
    return null;
  }
};

// Obter todas as planilhas de um cliente (incluindo por terminal)
export const getSpreadsheetsByCustomerId = async (customerId: string, terminalId?: string): Promise<SpreadsheetData[]> => {
  try {
    let query = supabase
      .from('customer_spreadsheets')
      .select('*')
      .eq('customer_id', customerId)
      .order('uploaded_at', { ascending: false });

    if (terminalId) {
      query = query.eq('terminal_id', terminalId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar planilhas do cliente:', error);
      return [];
    }

    return (data || []).map(dbToSpreadsheet);
  } catch (error) {
    console.error('Erro ao buscar planilhas do cliente:', error);
    return [];
  }
};

// Obter planilha por ID único
export const getSpreadsheetById = async (id: string): Promise<SpreadsheetData | null> => {
  try {
    const { data, error } = await supabase
      .from('customer_spreadsheets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar planilha por ID:', error);
      return null;
    }

    if (!data) return null;

    return dbToSpreadsheet(data);
  } catch (error) {
    console.error('Erro ao buscar planilha por ID:', error);
    return null;
  }
};

// Obter lista de meses disponíveis para um cliente/terminal
export const getAvailableMonths = async (customerId: string, terminalId?: string, type: 'monthly' | 'daily' = 'monthly'): Promise<string[]> => {
  try {
    const spreadsheets = await getSpreadsheetsByCustomerId(customerId, terminalId);
    const filtered = spreadsheets.filter(s => (s.type || 'monthly') === type);
    const months = new Set<string>();
  
    filtered.forEach(s => {
      if (s.referenceMonth) {
        months.add(s.referenceMonth);
      }
    });
  
    // Ordenar do mais recente para o mais antigo
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  } catch (error) {
    console.error('Erro ao buscar meses disponíveis:', error);
    return [];
  }
};

// Obter lista de dias disponíveis com planilhas diárias para um cliente/terminal
export const getAvailableDays = async (customerId: string, terminalId?: string, referenceMonth?: string): Promise<string[]> => {
  try {
    let query = supabase
      .from('customer_spreadsheets')
      .select('reference_date, uploaded_at')
      .eq('customer_id', customerId)
      .eq('type', 'daily')
      .not('reference_date', 'is', null);

    if (terminalId) {
      query = query.eq('terminal_id', terminalId);
    } else {
      // IMPORTANTE: Se não especificou terminal, buscar apenas planilhas gerais (sem terminal)
      // Isso evita retornar dias de planilhas de terminais específicos quando não deveria
      query = query.is('terminal_id', null);
    }

    if (referenceMonth) {
      query = query.eq('reference_month', referenceMonth);
    }

    // IMPORTANTE: Ordenar por uploaded_at para garantir consistência
    // Isso garante que se houver múltiplas planilhas para a mesma data, sempre pegamos a mesma ordem
    query = query.order('uploaded_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar dias disponíveis:', error);
      return [];
    }

    // IMPORTANTE: Para cada data, pegar apenas a planilha mais recente
    // Isso evita duplicatas e garante consistência
    const daysMap = new Map<string, string>(); // Map<reference_date, uploaded_at>
    
    (data || []).forEach((row: any) => {
      if (row.reference_date) {
        const existingDate = row.reference_date;
        const existingUploadedAt = row.uploaded_at;
        
        // Se já existe esta data no map, verificar qual é mais recente
        if (daysMap.has(existingDate)) {
          const existingUploadedAtInMap = daysMap.get(existingDate);
          // Se a atual é mais recente, substituir
          if (existingUploadedAtInMap && existingUploadedAt > existingUploadedAtInMap) {
            daysMap.set(existingDate, existingUploadedAt);
          }
        } else {
          // Se não existe, adicionar
          daysMap.set(existingDate, existingUploadedAt);
        }
      }
    });
  
    // IMPORTANTE: Ordenar de forma consistente (mais recente primeiro)
    // Usar ordenação estável baseada na data de referência
    return Array.from(daysMap.keys()).sort((a, b) => {
      // Ordenar por data (mais recente primeiro) - formato YYYY-MM-DD permite comparação direta
      return b.localeCompare(a);
    });
  } catch (error) {
    console.error('Erro ao buscar dias disponíveis:', error);
    return [];
  }
};

// Obter planilha diária por data específica
export const getSpreadsheetByDate = async (customerId: string, referenceDate: string, terminalId?: string): Promise<SpreadsheetData | null> => {
  if (!referenceDate) return null;
  
  try {
    // IMPORTANTE: Normalizar a data para garantir que está no formato correto (YYYY-MM-DD)
    // Isso evita problemas com timezone ou formatação
    const normalizedDate = referenceDate.trim();
    
    // Primeiro tentar com terminal se especificado
    if (terminalId) {
      const { data: withTerminal, error: errorWithTerminal } = await supabase
        .from('customer_spreadsheets')
        .select('*')
        .eq('customer_id', customerId)
        .eq('terminal_id', terminalId)
        .eq('type', 'daily')
        .eq('reference_date', normalizedDate) // Usar data normalizada
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!errorWithTerminal && withTerminal) {
        return dbToSpreadsheet(withTerminal);
      }

      // Se não encontrou com terminal, tentar sem terminal
      const { data: withoutTerminal, error: errorWithoutTerminal } = await supabase
        .from('customer_spreadsheets')
        .select('*')
        .eq('customer_id', customerId)
        .is('terminal_id', null)
        .eq('type', 'daily')
        .eq('reference_date', normalizedDate) // Usar data normalizada
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!errorWithoutTerminal && withoutTerminal) {
        return dbToSpreadsheet(withoutTerminal);
      }
    } else {
      // Se não especificou terminal, pegar apenas planilhas gerais (sem terminal)
      const { data, error } = await supabase
        .from('customer_spreadsheets')
        .select('*')
        .eq('customer_id', customerId)
        .is('terminal_id', null)
        .eq('type', 'daily')
        .eq('reference_date', normalizedDate) // Usar data normalizada
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar planilha por data:', error);
        return null;
      }

      if (!data) return null;

      return dbToSpreadsheet(data);
    }

    return null;
  } catch (error) {
    console.error('Erro ao buscar planilha por data:', error);
    return null;
  }
};

// Obter histórico de planilhas organizado por mês
export const getSpreadsheetHistory = async (customerId: string, terminalId?: string, type: 'monthly' | 'daily' = 'monthly'): Promise<Record<string, SpreadsheetData[]>> => {
  try {
    const spreadsheets = await getSpreadsheetsByCustomerId(customerId, terminalId);
    const filtered = spreadsheets.filter(s => (s.type || 'monthly') === type);
    const history: Record<string, SpreadsheetData[]> = {};
  
    filtered.forEach(s => {
      const month = s.referenceMonth || getReferenceMonth(s.uploadedAt);
      if (!history[month]) {
        history[month] = [];
      }
      history[month].push(s);
    });
  
    // Ordenar planilhas dentro de cada mês por data de upload (mais recente primeiro)
    Object.keys(history).forEach(month => {
      history[month].sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
    });
  
    return history;
  } catch (error) {
    console.error('Erro ao buscar histórico de planilhas:', error);
    return {};
  }
};

// Calcular métricas agregadas de múltiplas planilhas
export const calculateAggregatedMetrics = async (spreadsheets: SpreadsheetData[]): Promise<SpreadsheetMetrics | null> => {
  if (!spreadsheets || spreadsheets.length === 0) return null;
  
  const aggregated: SpreadsheetMetrics = {
    totalLinhas: 0,
    totalColunas: 0,
    totalVendas: 0,
    valorBrutoTotal: 0,
    valorLiquidoTotal: 0,
    taxaMedia: 0,
    estabelecimentosUnicos: 0,
    formasPagamentoUnicas: 0,
    bandeirasUnicas: 0,
    parcelasMedias: 0,
    vendasAprovadas: 0,
    vendasPendentes: 0,
    vendasCanceladas: 0,
  };
  
  let totalTaxa = 0;
  let countTaxa = 0;
  const estabelecimentos = new Set<string>();
  const formasPagamento = new Set<string>();
  const bandeiras = new Set<string>();
  let totalParcelas = 0;
  let countParcelas = 0;
  
  for (const spreadsheet of spreadsheets) {
    if (!spreadsheet.data || spreadsheet.data.length === 0) continue;
    
    const metrics = await calculateSpreadsheetMetrics(spreadsheet);
    
    aggregated.totalLinhas += metrics.totalLinhas;
    aggregated.totalColunas = Math.max(aggregated.totalColunas, metrics.totalColunas);
    aggregated.totalVendas += metrics.totalVendas;
    aggregated.valorBrutoTotal += metrics.valorBrutoTotal;
    aggregated.valorLiquidoTotal += metrics.valorLiquidoTotal;
    
    if (metrics.taxaMedia > 0) {
      totalTaxa += metrics.taxaMedia;
      countTaxa++;
    }
    
    // Agregar dados únicos das vendas
    if (spreadsheet.sales && spreadsheet.sales.length > 0) {
      spreadsheet.sales.forEach(sale => {
        if (sale.estabelecimento) estabelecimentos.add(sale.estabelecimento);
        if (sale.formaPagamento) formasPagamento.add(sale.formaPagamento);
        if (sale.bandeira) bandeiras.add(sale.bandeira);
        if (sale.quantidadeParcelas > 0) {
          totalParcelas += sale.quantidadeParcelas;
          countParcelas++;
        }
        if (sale.statusVenda) {
          const status = sale.statusVenda.toLowerCase();
          if (status.includes('aprov') || status.includes('conclu')) {
            aggregated.vendasAprovadas++;
          } else if (status.includes('pendente') || status.includes('process')) {
            aggregated.vendasPendentes++;
          } else if (status.includes('cancel') || status.includes('rejeit')) {
            aggregated.vendasCanceladas++;
          }
        }
      });
    }
  }
  
  aggregated.taxaMedia = countTaxa > 0 ? totalTaxa / countTaxa : 0;
  aggregated.estabelecimentosUnicos = estabelecimentos.size;
  aggregated.formasPagamentoUnicas = formasPagamento.size;
  aggregated.bandeirasUnicas = bandeiras.size;
  aggregated.parcelasMedias = countParcelas > 0 ? totalParcelas / countParcelas : 0;
  
  return aggregated;
};

// Função auxiliar para extrair mês de referência (YYYY-MM) de uma data
const getReferenceMonth = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Salvar planilha
// - Planilhas DIÁRIAS: sempre adiciona nova entrada (múltiplas por mês permitidas)
// - Planilhas MENSAIS: substitui se já existir uma para o mesmo mês
export const saveSpreadsheet = async (spreadsheet: Omit<SpreadsheetData, 'sales' | 'id' | 'referenceMonth' | 'type' | 'referenceDate'> & { sales?: SpreadsheetSale[]; referenceMonth?: string; referenceDate?: string; type?: 'monthly' | 'daily' }): Promise<void> => {
  try {
    // Determinar mês de referência: usar o fornecido ou extrair da data de upload
    const referenceMonth = spreadsheet.referenceMonth || getReferenceMonth(spreadsheet.uploadedAt);
    
    // Tipo de planilha: mensal (padrão) ou diária
    const type = spreadsheet.type || 'monthly';
    
    // Data de referência para planilhas diárias
    const referenceDate = spreadsheet.referenceDate;
    
    // Processar vendas se não foram processadas
    let sales: SpreadsheetSale[] = [];
    if (spreadsheet.sales && spreadsheet.sales.length > 0) {
      sales = spreadsheet.sales;
    } else if (spreadsheet.data && spreadsheet.data.length > 0) {
      // parseSpreadsheetToSales agora é assíncrono
      sales = await parseSpreadsheetToSales(spreadsheet.data, spreadsheet.headers, spreadsheet.customerId);
    }
    
    // Gerar ID único para esta planilha
    const dateKey = referenceDate || referenceMonth;
    const id = `spreadsheet_${type}_${spreadsheet.customerId}_${spreadsheet.terminalId || 'general'}_${dateKey}_${Date.now()}`;
    
    const spreadsheetToSave: SpreadsheetData = {
      ...spreadsheet,
      id,
      referenceMonth,
      referenceDate,
      type,
      sales,
    };
    
    const dbData = spreadsheetToDb(spreadsheetToSave);
    
    // LÓGICA DE SALVAMENTO:
    if (type === 'monthly') {
      // Para planilhas MENSAIS: substituir se já existir uma para o mesmo mês
      const { data: existing } = await supabase
        .from('customer_spreadsheets')
        .select('id')
        .eq('customer_id', spreadsheet.customerId)
        .eq('terminal_id', spreadsheet.terminalId || null)
        .eq('reference_month', referenceMonth)
        .eq('type', 'monthly')
        .maybeSingle();
      
      if (existing) {
        // Substituir planilha mensal existente
        const { error } = await supabase
          .from('customer_spreadsheets')
          .update(dbData)
          .eq('id', existing.id);
        
        if (error) {
          console.error('Erro ao atualizar planilha:', error);
          throw error;
        }
      } else {
        // Adicionar nova planilha mensal
        const { error } = await supabase
          .from('customer_spreadsheets')
          .insert(dbData);
        
        if (error) {
          console.error('Erro ao inserir planilha:', error);
          throw error;
        }
      }
    } else {
      // Para planilhas DIÁRIAS: sempre adicionar (permitir múltiplas)
      const { error } = await supabase
        .from('customer_spreadsheets')
        .insert(dbData);
      
      if (error) {
        console.error('Erro ao inserir planilha diária:', error);
        throw error;
      }
    }
    
    // Criar automaticamente um registro no Histórico de Repasses
    try {
      console.log('📊 Iniciando criação automática de repasse para planilha:', {
        planilhaId: spreadsheetToSave.id,
        customerId: spreadsheetToSave.customerId,
        type: spreadsheetToSave.type,
        referenceDate: spreadsheetToSave.referenceDate,
        referenceMonth: spreadsheetToSave.referenceMonth
      });
      
      await createTransferFromSpreadsheet(spreadsheetToSave);
      
      // O evento transferCreated já é disparado dentro de createTransferFromSpreadsheet
      // tanto para criação quanto para atualização, então não precisamos disparar aqui novamente
      console.log('✅ Processo de criação/atualização de repasse concluído');
    } catch (transferError) {
      // Não bloquear o salvamento da planilha se houver erro ao criar repasse
      console.error('❌ Erro ao criar repasse automaticamente:', transferError);
    }
  } catch (error) {
    console.error('Erro ao salvar planilha:', error);
    throw error;
  }
};

// Criar repasse automaticamente a partir de uma planilha
const createTransferFromSpreadsheet = async (spreadsheet: SpreadsheetData): Promise<void> => {
  try {
    // Verificar se já existe um repasse para esta planilha (evitar duplicação)
    // Determinar período para buscar repasse existente
    let periodoParaBusca: string | undefined;
    if (spreadsheet.type === 'daily' && spreadsheet.referenceDate) {
      const dateStr = spreadsheet.referenceDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        periodoParaBusca = `${day}/${month}/${year}`;
      } else {
        const date = new Date(spreadsheet.referenceDate);
        periodoParaBusca = date.toLocaleDateString('pt-BR');
      }
    } else if (spreadsheet.referenceMonth) {
      const [year, month] = spreadsheet.referenceMonth.split('-');
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoParaBusca = `${monthNames[parseInt(month) - 1]}/${year}`;
    }
    
    console.log('🔍 Verificando se já existe repasse para período:', periodoParaBusca);
    
    // Buscar repasses existentes do mesmo cliente
    const { getTransfers } = await import('./transferService');
    const allTransfers = await getTransfers();
    const existingTransfers = allTransfers.filter(t => t.customerId === spreadsheet.customerId);
    const existingTransfer = existingTransfers.find(t => 
      t.customerId === spreadsheet.customerId &&
      t.periodo === periodoParaBusca
    );
    
    if (existingTransfer) {
      console.log('⚠️ Repasse já existe para este período:', existingTransfer.id);
    } else {
      console.log('✅ Nenhum repasse encontrado para este período, criando novo...');
    }
    
    // Se já existe um repasse para este período, atualizar ao invés de criar novo
    if (existingTransfer) {
      console.log('Repasse já existe para este período, atualizando valores...');
      // Atualizar o repasse existente com os novos valores
      const { updateTransfer } = await import('./transferService');
      
      // Buscar valores customizados dos cards editados pelo administrador
      const customValues = await getCustomerCardValues(
        spreadsheet.customerId,
        spreadsheet.terminalId,
        spreadsheet.referenceMonth,
        spreadsheet.referenceDate,
        spreadsheet.type || 'monthly'
      );
      
      // Calcular métricas da planilha (usar como fallback)
      const metrics = await calculateSpreadsheetMetrics(spreadsheet);
      
      // Usar valores customizados se existirem, senão usar valores calculados da planilha
      let valorBruto = customValues?.valorBruto ?? metrics.valorBrutoTotal;
      
      // Taxa: usar valor absoluto dos cards se existir (já está em R$), senão calcular
      let taxas: number;
      if (customValues?.taxa !== undefined && customValues.taxa > 0) {
        taxas = customValues.taxa;
      } else if (customValues?.valorBruto !== undefined && customValues.valorBruto > 0) {
        taxas = customValues.valorBruto * 0.051;
      } else if (metrics.taxaMedia > 0) {
        taxas = metrics.valorBrutoTotal * (metrics.taxaMedia / 100);
      } else {
        taxas = metrics.valorBrutoTotal * 0.051;
      }
      
      // Valor líquido: usar customizado se existir, senão calcular
      let valorLiquido = customValues?.valorLiquido;
      if (!valorLiquido || valorLiquido <= 0) {
        valorLiquido = valorBruto - taxas;
      }
      
      // Atualizar repasse existente apenas se houver valores válidos
      if (valorBruto > 0) {
        await updateTransfer(existingTransfer.id, {
          valorBruto,
          taxas,
          valorLiquido,
          // Manter período, status e data de envio existentes
        });
        console.log('✅ Repasse atualizado automaticamente para planilha:', spreadsheet.id);
        
        // Disparar evento para atualizar a lista de repasses na interface
        // Usar setTimeout para garantir que o evento seja disparado após a atualização do banco
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const event = new CustomEvent('transferCreated', {
              detail: {
                customerId: spreadsheet.customerId,
                terminalId: spreadsheet.terminalId,
                type: spreadsheet.type || 'monthly',
                referenceDate: spreadsheet.referenceDate,
                referenceMonth: spreadsheet.referenceMonth,
                action: 'updated',
                transferId: existingTransfer.id
              }
            });
            window.dispatchEvent(event);
            console.log('✅ Evento transferCreated disparado (atualização) para atualizar interface', event.detail);
          }
        }, 100);
      }
      return; // Não criar novo repasse
    }
    
    // Se não existe repasse, criar um novo
    // Buscar valores customizados dos cards editados pelo administrador
    const customValues = await getCustomerCardValues(
      spreadsheet.customerId,
      spreadsheet.terminalId,
      spreadsheet.referenceMonth,
      spreadsheet.referenceDate,
      spreadsheet.type || 'monthly'
    );
    
    // Calcular métricas da planilha (usar como fallback)
    const metrics = await calculateSpreadsheetMetrics(spreadsheet);
    
    // Usar valores customizados se existirem, senão usar valores calculados da planilha
    let valorBruto = customValues?.valorBruto ?? metrics.valorBrutoTotal;
    
    // Taxa: usar valor absoluto dos cards se existir (já está em R$), senão calcular
    let taxas: number;
    if (customValues?.taxa !== undefined && customValues.taxa > 0) {
      // Taxa nos cards já é valor absoluto em reais (R$), não porcentagem
      taxas = customValues.taxa;
    } else if (customValues?.valorBruto !== undefined && customValues.valorBruto > 0) {
      // Se tem valor bruto customizado mas não tem taxa customizada, calcular 5,10%
      taxas = customValues.valorBruto * 0.051;
    } else if (metrics.taxaMedia > 0) {
      // Se a planilha tem taxa média, usar ela
      taxas = metrics.valorBrutoTotal * (metrics.taxaMedia / 100);
    } else {
      // Fallback: 5,10% do valor bruto
      taxas = metrics.valorBrutoTotal * 0.051;
    }
    
    // Valor líquido: usar customizado se existir, senão calcular
    let valorLiquido = customValues?.valorLiquido;
    if (!valorLiquido || valorLiquido <= 0) {
      valorLiquido = valorBruto - taxas;
    }
    
    // Verificar se há valores válidos
    if (valorBruto <= 0) {
      console.log('Planilha sem valor bruto válido, não criando repasse');
      return;
    }
    
    // Obter nome do cliente
    const customers = await getCustomers();
    const customer = customers.find(c => c.id === spreadsheet.customerId);
    const customerName = customer?.name || '';
    
    // Determinar período/referência
    let periodo: string | undefined;
    let dataEnvio: string = '';
    
    if (spreadsheet.type === 'daily' && spreadsheet.referenceDate) {
      // Para planilhas diárias, usar a data formatada
      // referenceDate já está no formato YYYY-MM-DD, usar diretamente
      const dateStr = spreadsheet.referenceDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Se já está no formato correto, usar diretamente
        dataEnvio = dateStr;
        // Formatar para exibição no período
        const [year, month, day] = dateStr.split('-');
        periodo = `${day}/${month}/${year}`;
      } else {
        // Se não está no formato correto, tentar criar Date e formatar
        const date = new Date(spreadsheet.referenceDate);
        periodo = date.toLocaleDateString('pt-BR');
        // Usar métodos locais para evitar problemas de timezone
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dataEnvio = `${year}-${month}-${day}`;
      }
    } else if (spreadsheet.referenceMonth) {
      // Para planilhas mensais, usar o mês formatado
      const [year, month] = spreadsheet.referenceMonth.split('-');
      const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodo = `${monthNames[parseInt(month) - 1]}/${year}`;
      // Para planilhas mensais, usar a data de upload (uploadedAt) como data de envio
      if (spreadsheet.uploadedAt) {
        const uploadDate = new Date(spreadsheet.uploadedAt);
        // Usar métodos locais para evitar problemas de timezone
        const uploadYear = uploadDate.getFullYear();
        const uploadMonth = String(uploadDate.getMonth() + 1).padStart(2, '0');
        const uploadDay = String(uploadDate.getDate()).padStart(2, '0');
        dataEnvio = `${uploadYear}-${uploadMonth}-${uploadDay}`;
      }
    }
    
    // Criar o repasse com status Pendente e data de envio preenchida com a data da planilha
    const newTransfer = await createTransfer({
      periodo,
      valorBruto,
      taxas,
      valorLiquido,
      status: 'pendente',
      dataEnvio: dataEnvio, // Data da planilha (referenceDate para diárias, uploadedAt para mensais)
      customerId: spreadsheet.customerId,
      customerName,
    });
    
    console.log('✅ Repasse criado automaticamente para planilha:', {
      planilhaId: spreadsheet.id,
      repasseId: newTransfer.id,
      periodo,
      valorBruto,
      dataEnvio,
      usandoValoresCustomizados: !!customValues
    });
    
    // Disparar evento para atualizar a lista de repasses na interface
    // Usar setTimeout para garantir que o evento seja disparado após a criação no banco
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('transferCreated', {
          detail: {
            customerId: spreadsheet.customerId,
            terminalId: spreadsheet.terminalId,
            type: spreadsheet.type || 'monthly',
            referenceDate: spreadsheet.referenceDate,
            referenceMonth: spreadsheet.referenceMonth,
            action: 'created',
            transferId: newTransfer.id
          }
        });
        window.dispatchEvent(event);
        console.log('✅ Evento transferCreated disparado (criação) para atualizar interface', event.detail);
      }
    }, 100);
  } catch (error) {
    console.error('Erro ao criar repasse a partir da planilha:', error);
    throw error;
  }
};

// Deletar planilha de um cliente
export const deleteSpreadsheet = async (customerId: string, terminalId?: string): Promise<void> => {
  try {
    let query = supabase
      .from('customer_spreadsheets')
      .delete()
      .eq('customer_id', customerId);

    if (terminalId) {
      query = query.eq('terminal_id', terminalId);
    } else {
      query = query.is('terminal_id', null);
    }

    const { error } = await query;

    if (error) {
      console.error('Erro ao deletar planilha:', error);
      throw error;
    }
  } catch (error) {
    console.error('Erro ao deletar planilha:', error);
    throw error;
  }
};

