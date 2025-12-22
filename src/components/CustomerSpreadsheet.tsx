import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Download, Trash2, Check, Eye, Calendar, Edit2, Save } from 'lucide-react';
import { getSpreadsheetByCustomerId, getSpreadsheetByTerminalId, saveSpreadsheet, deleteSpreadsheet, SpreadsheetData, parseSpreadsheetToSales, getAvailableMonths, getAvailableDays, getSpreadsheetByDate, calculateSpreadsheetMetrics } from '../services/spreadsheetService';
import { useAuth } from '../context/AuthContext';
import { getCustomerCardValues, saveCustomerCardValues, deleteCustomerCardValues } from '../services/customerCardValuesService';

interface CustomerSpreadsheetProps {
  customerId: string;
  customerName: string;
  terminalId?: string; // ID da conta (opcional)
  terminalName?: string; // Nome da conta (opcional)
  onClose: () => void;
}

const CustomerSpreadsheet = ({ customerId, customerName, terminalId, terminalName, onClose }: CustomerSpreadsheetProps) => {
  const { isAdmin, user } = useAuth();
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<SpreadsheetData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [referenceMonth, setReferenceMonth] = useState<string>('');
  const [referenceDate, setReferenceDate] = useState<string>('');
  const [spreadsheetType, setSpreadsheetType] = useState<'monthly' | 'daily'>('monthly');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [showEditCardValues, setShowEditCardValues] = useState(false);
  const [cardValues, setCardValues] = useState({
    quantidadeVendas: '',
    valorBruto: '',
    taxa: '',
    valorLiquido: '',
  });
  const [spreadsheetMetrics, setSpreadsheetMetrics] = useState<any>(null);
  const [description, setDescription] = useState<string>(''); // Descrição da planilha (apenas para administradores)
  const [showEditDescription, setShowEditDescription] = useState(false); // Modal para editar descrição
  const [editingDescription, setEditingDescription] = useState<string>(''); // Descrição sendo editada
  
  // Função auxiliar para atualizar planilha e descrição juntas
  const updateSpreadsheetData = (data: SpreadsheetData | null) => {
    setSpreadsheetData(data);
    if (data?.description) {
      setDescription(data.description);
    } else {
      setDescription('');
    }
  };
  
  // Refs para rastrear se a seleção foi feita manualmente pelo usuário
  // Isso evita que useEffects alterem a seleção após o usuário ter escolhido manualmente
  const userSelectedMonthRef = useRef<boolean>(false);
  const userSelectedDayRef = useRef<boolean>(false);
  const isInitialLoadRef = useRef<boolean>(true);
  const lockSelectionRef = useRef<boolean>(false); // Bloqueio completo de alterações automáticas
  const lastSelectedDayRef = useRef<string>(''); // Último dia selecionado pelo usuário
  const lastSelectedMonthRef = useRef<string>(''); // Último mês selecionado pelo usuário
  const hasUserInteractedRef = useRef<boolean>(false); // Flag para saber se o usuário já interagiu
  const monthsLoadedRef = useRef<boolean>(false); // Flag para saber se os meses já foram carregados
  const daysLoadedRef = useRef<boolean>(false); // Flag para saber se os dias já foram carregados
  
  // Função para converter valor formatado brasileiro para número
  const parseValorBrasileiro = (valor: string): number => {
    if (!valor) return 0;
    
    // Remove caracteres não numéricos exceto vírgula e ponto
    let valorLimpo = valor.replace(/[^\d,.-]/g, '');
    
    // Se não tem vírgula, pode ser formato americano ou número sem decimais
    if (!valorLimpo.includes(',')) {
      // Se tem ponto, pode ser formato americano (ex: 51242.29)
      if (valorLimpo.includes('.')) {
        return parseFloat(valorLimpo) || 0;
      }
      // Se não tem nem vírgula nem ponto, é número inteiro
      return parseFloat(valorLimpo) || 0;
    }
    
    // Formato brasileiro: ponto = milhar, vírgula = decimal
    // Exemplo: 51.242,29 -> 51242.29
    // Remove pontos (separadores de milhar)
    valorLimpo = valorLimpo.replace(/\./g, '');
    // Substitui vírgula (decimal) por ponto para parseFloat
    valorLimpo = valorLimpo.replace(',', '.');
    
    return parseFloat(valorLimpo) || 0;
  };

  // Função para formatar número no formato brasileiro (1.000,00)
  const formatarValorBrasileiro = (valor: string | number): string => {
    // Se receber número, formatar diretamente
    if (typeof valor === 'number') {
      if (isNaN(valor) || valor < 0) return '';
      return valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    
    // Se receber string, primeiro converter para número
    const valorNum = parseValorBrasileiro(valor);
    
    if (isNaN(valorNum) || valorNum < 0) return '';
    
    // Formatar com pontos para milhares e vírgula para decimais
    return valorNum.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };
  
  // Função para limpar e normalizar entrada do usuário (permite digitação livre)
  const normalizarEntrada = (valor: string): string => {
    // Remove tudo exceto números, vírgula e ponto
    return valor.replace(/[^\d,.-]/g, '');
  };
  
  // Constante da taxa: 5,10%
  const TAXA_PERCENTUAL = 5.10;
  
  // Função para formatar mês (YYYY-MM) para exibição (MM/YYYY)
  const formatMonth = (month: string): string => {
    if (!month) return '';
    const [year, monthNum] = month.split('-');
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${monthNames[parseInt(monthNum) - 1]}/${year}`;
  };
  
  // Função para obter mês atual no formato YYYY-MM
  const getCurrentMonth = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };
  

  // Carregar meses disponíveis quando tipo mudar
  useEffect(() => {
    // SOLUÇÃO RADICAL: Se o usuário já interagiu, NUNCA mais alterar a seleção automaticamente
    if (hasUserInteractedRef.current) {
      // Apenas atualizar a lista de meses disponíveis, mas NUNCA alterar a seleção
      const loadMonthsOnly = async () => {
        const months = await getAvailableMonths(customerId, terminalId, spreadsheetType);
        const monthsString = months.sort((a, b) => a.localeCompare(b)).join(',');
        const currentMonthsString = [...availableMonths].sort((a, b) => a.localeCompare(b)).join(',');
        
        if (monthsString !== currentMonthsString) {
          setAvailableMonths(months);
        }
      };
      loadMonthsOnly();
      return; // SAIR IMEDIATAMENTE - não fazer mais nada
    }
    
    // BLOQUEIO: Se a seleção está bloqueada, não fazer alterações automáticas
    if (lockSelectionRef.current) {
      return;
    }
    
    const loadMonths = async () => {
      const months = await getAvailableMonths(customerId, terminalId, spreadsheetType);
      monthsLoadedRef.current = true;
      
      // IMPORTANTE: Só atualizar a lista de meses se realmente mudou
      const monthsString = months.sort((a, b) => a.localeCompare(b)).join(',');
      const currentMonthsString = [...availableMonths].sort((a, b) => a.localeCompare(b)).join(',');
      
      if (monthsString !== currentMonthsString) {
        setAvailableMonths(months);
      }
    
      // SOLUÇÃO: Só fazer seleção automática no PRIMEIRO carregamento
      // Depois disso, NUNCA mais alterar automaticamente
      if (spreadsheetType === 'monthly') {
        // Para mensais: limpar dias apenas se não houver bloqueio
        if (!lockSelectionRef.current && !hasUserInteractedRef.current) {
          setAvailableDays([]);
          if (!userSelectedDayRef.current) {
            setSelectedDay('');
          }
        }
        
        // IMPORTANTE: Só selecionar automaticamente o primeiro mês se:
        // 1. É o carregamento inicial E não há bloqueio E usuário não interagiu
        if (months.length > 0 && !lockSelectionRef.current && !hasUserInteractedRef.current) {
          if (!selectedMonth && isInitialLoadRef.current) {
            // Se não há seleção e é carregamento inicial, selecionar o primeiro
            setSelectedMonth(months[0]);
            lastSelectedMonthRef.current = months[0];
            isInitialLoadRef.current = false;
          }
        }
      } else {
        // Para diárias: preservar seleção do mês se ainda estiver disponível
        if (months.length > 0 && !lockSelectionRef.current && !hasUserInteractedRef.current) {
          if (!selectedMonth && isInitialLoadRef.current) {
            // Se não há seleção e é carregamento inicial, selecionar o primeiro
            setSelectedMonth(months[0]);
            lastSelectedMonthRef.current = months[0];
            isInitialLoadRef.current = false;
          }
        }
      }
    };
    loadMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetType, customerId, terminalId]);
  
  // Carregar dias quando mês mudar (apenas para diárias)
  useEffect(() => {
    // SOLUÇÃO RADICAL: Se o usuário já interagiu, NUNCA mais alterar a seleção automaticamente
    if (hasUserInteractedRef.current) {
      // Apenas atualizar a lista de dias disponíveis, mas NUNCA alterar a seleção
      const loadDaysOnly = async () => {
        if (spreadsheetType === 'daily' && selectedMonth) {
          const days = await getAvailableDays(customerId, terminalId, selectedMonth);
          const daysString = days.sort((a, b) => a.localeCompare(b)).join(',');
          const currentDaysString = [...availableDays].sort((a, b) => a.localeCompare(b)).join(',');
          
          if (daysString !== currentDaysString) {
            setAvailableDays(days);
          }
        }
      };
      loadDaysOnly();
      return; // SAIR IMEDIATAMENTE - não fazer mais nada
    }
    
    // BLOQUEIO: Se a seleção está bloqueada, não fazer alterações automáticas
    if (lockSelectionRef.current) {
      return;
    }
    
    let isMounted = true; // Flag para evitar atualizações após desmontagem
    
    const loadDays = async () => {
      if (spreadsheetType === 'daily' && selectedMonth) {
        const days = await getAvailableDays(customerId, terminalId, selectedMonth);
        daysLoadedRef.current = true;
        
        // Verificar se o componente ainda está montado antes de atualizar
        if (!isMounted) return;
        
        // BLOQUEIO: Verificar novamente se ainda está bloqueado
        if (lockSelectionRef.current || hasUserInteractedRef.current) {
          // Apenas atualizar a lista, não a seleção
          const daysString = days.sort((a, b) => a.localeCompare(b)).join(',');
          const currentDaysString = [...availableDays].sort((a, b) => a.localeCompare(b)).join(',');
          
          if (daysString !== currentDaysString) {
            setAvailableDays(days);
          }
          return;
        }
        
        // IMPORTANTE: Comparar se a lista de dias realmente mudou antes de atualizar
        const daysString = days.sort((a, b) => a.localeCompare(b)).join(',');
        const currentDaysString = [...availableDays].sort((a, b) => a.localeCompare(b)).join(',');
        
        // Só atualizar se a lista realmente mudou
        if (daysString !== currentDaysString) {
          setAvailableDays(days);
          
          // SOLUÇÃO: Só alterar seleção se for o primeiro carregamento E não houver bloqueio
          // Depois disso, NUNCA mais alterar automaticamente
          if (!hasUserInteractedRef.current && !lockSelectionRef.current) {
            // Não fazer nada - deixar o usuário escolher manualmente
            // Não selecionar automaticamente após o primeiro carregamento
          }
        }
      } else if (spreadsheetType === 'daily' && !selectedMonth) {
        // Se não há mês selecionado, limpar dias apenas se realmente não há mês
        // E não houver interação do usuário
        if (isMounted && !lockSelectionRef.current && !hasUserInteractedRef.current) {
          setAvailableDays([]);
        }
      }
    };
    
    loadDays();
    
    return () => {
      isMounted = false; // Marcar como desmontado ao limpar
    };
    // Adicionar selectedDay e availableDays nas dependências para evitar stale closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, spreadsheetType, customerId, terminalId]);
  
  // Carregar planilha mensal quando mês for selecionado
  useEffect(() => {
    const loadSpreadsheet = async () => {
      if (spreadsheetType === 'monthly' && selectedMonth) {
        const data = terminalId 
          ? await getSpreadsheetByTerminalId(terminalId, customerId, selectedMonth, 'monthly')
          : await getSpreadsheetByCustomerId(customerId, selectedMonth, 'monthly');
        updateSpreadsheetData(data);
      } else if (spreadsheetType === 'monthly') {
        updateSpreadsheetData(null);
      }
    };
    loadSpreadsheet();
  }, [selectedMonth, spreadsheetType, customerId, terminalId]);
  
  // Carregar planilha diária quando dia for selecionado
  useEffect(() => {
    // SOLUÇÃO RADICAL: Se o usuário já interagiu, NUNCA mais recarregar automaticamente
    if (hasUserInteractedRef.current && userSelectedDayRef.current) {
      // Se o usuário selecionou manualmente, apenas garantir que a planilha está carregada
      // mas NUNCA alterar a seleção ou recarregar se já está carregada
      if (selectedDay && spreadsheetData && spreadsheetData.referenceDate === selectedDay) {
        // Planilha já está carregada corretamente - não fazer NADA
        return;
      }
      // Se a planilha não está carregada mas há seleção bloqueada, carregar UMA VEZ sem alterar seleção
      // Mas só se a seleção atual corresponde à seleção bloqueada
      if (selectedDay && selectedDay === lastSelectedDayRef.current) {
        // Carregar planilha para a data bloqueada, mas não alterar seleção
        const loadOnce = async () => {
          const data = await getSpreadsheetByDate(customerId, selectedDay, terminalId);
          if (data && data.referenceDate === selectedDay && selectedDay === lastSelectedDayRef.current) {
            updateSpreadsheetData(data);
          }
        };
        loadOnce();
      }
      return; // SAIR IMEDIATAMENTE após carregar uma vez
    }
    
    // BLOQUEIO: Se a seleção está bloqueada, não fazer alterações automáticas
    if (lockSelectionRef.current && userSelectedDayRef.current) {
      return;
    }
    
    let isMounted = true; // Flag para evitar atualizações após desmontagem
    let currentSelectedDay = selectedDay; // Capturar valor atual
    
    const loadSpreadsheet = async () => {
      if (spreadsheetType === 'daily' && currentSelectedDay) {
        // IMPORTANTE: Verificar se a planilha já está carregada para esta data
        // Isso evita recarregamentos desnecessários que podem causar mudanças na seleção
        if (spreadsheetData && spreadsheetData.referenceDate === currentSelectedDay) {
          // Planilha já está carregada para esta data - não recarregar
          return;
        }
        
        const data = await getSpreadsheetByDate(customerId, currentSelectedDay, terminalId);
        
        // Verificar se o componente ainda está montado e se a seleção não mudou
        if (!isMounted) return;
        
        // BLOQUEIO: Se a seleção está bloqueada, verificar se ainda é a mesma
        if (lockSelectionRef.current && userSelectedDayRef.current) {
          // Verificar se a seleção atual ainda é a mesma que foi bloqueada
          if (selectedDay !== lastSelectedDayRef.current && lastSelectedDayRef.current) {
            // A seleção mudou - não fazer nada, manter a seleção bloqueada
            return;
          }
        }
        
        // IMPORTANTE: Verificar novamente se selectedDay ainda é o mesmo
        // Isso evita race conditions onde múltiplas chamadas podem completar em ordem diferente
        if (selectedDay !== currentSelectedDay) {
          // A seleção mudou enquanto carregava - ignorar resultado
          return;
        }
        
        // IMPORTANTE: Só atualizar se ainda estamos na mesma data selecionada
        if (currentSelectedDay && data && data.referenceDate === currentSelectedDay) {
          setSpreadsheetData(data);
        } else if (!data && currentSelectedDay) {
          // Se não encontrou planilha mas ainda há uma data selecionada, limpar
          // Mas só se não houver bloqueio
          if (!lockSelectionRef.current || !userSelectedDayRef.current) {
            updateSpreadsheetData(null);
          }
        }
      } else if (spreadsheetType === 'daily' && !currentSelectedDay) {
        // Se não há dia selecionado, limpar planilha apenas se realmente não há seleção
        // E não houver bloqueio
        if (isMounted && !selectedDay && (!lockSelectionRef.current || !userSelectedDayRef.current)) {
          updateSpreadsheetData(null);
        }
      }
    };
    
    loadSpreadsheet();
    
    return () => {
      isMounted = false; // Marcar como desmontado ao limpar
    };
  }, [selectedDay, spreadsheetType, customerId, terminalId]);

  // Calcular métricas da planilha quando ela mudar
  useEffect(() => {
    const loadMetrics = async () => {
      if (spreadsheetData && spreadsheetData.data && spreadsheetData.data.length > 0) {
        try {
          const metrics = await calculateSpreadsheetMetrics(spreadsheetData);
          // Garantir que todos os valores tenham defaults
          setSpreadsheetMetrics({
            ...metrics,
            totalVendas: metrics?.totalVendas ?? 0,
            valorBrutoTotal: metrics?.valorBrutoTotal ?? 0,
            taxaMedia: metrics?.taxaMedia ?? 0,
            valorLiquidoTotal: metrics?.valorLiquidoTotal ?? 0,
          } as any);
          
          // Carregar valores customizados específicos desta planilha (se existirem)
          // Não preencher automaticamente com valores calculados - apenas manualmente
          const customValues = await getCustomerCardValues(
            customerId, 
            terminalId,
            spreadsheetData.referenceMonth,
            spreadsheetData.referenceDate,
            spreadsheetData.type || 'monthly'
          );
          if (customValues) {
            // Se houver valores customizados salvos, carregar eles
            setCardValues({
              quantidadeVendas: customValues.quantidadeVendas ? formatarValorBrasileiro(customValues.quantidadeVendas.toString()) : '',
              valorBruto: customValues.valorBruto ? formatarValorBrasileiro(customValues.valorBruto.toString()) : '',
              taxa: customValues.taxa ? formatarValorBrasileiro(customValues.taxa.toString()) : '',
              valorLiquido: customValues.valorLiquido ? formatarValorBrasileiro(customValues.valorLiquido.toString()) : '',
            });
          } else {
            // Não preencher automaticamente - campos ficam vazios para preenchimento manual
            setCardValues({
              quantidadeVendas: '',
              valorBruto: '',
              taxa: '',
              valorLiquido: '',
            });
          }
        } catch (error) {
          console.error('Erro ao calcular métricas:', error);
          setSpreadsheetMetrics(null);
          setCardValues({
            quantidadeVendas: '',
            valorBruto: '',
            taxa: '',
            valorLiquido: '',
          });
        }
      } else {
        setSpreadsheetMetrics(null);
        setCardValues({
          quantidadeVendas: '',
          valorBruto: '',
          taxa: '',
          valorLiquido: '',
        });
      }
    };
    
    loadMetrics();
  }, [spreadsheetData, customerId, terminalId]);
  
  // Inicializar mês de referência e data com valores atuais (apenas uma vez)
  useEffect(() => {
    // IMPORTANTE: Só inicializar se realmente não houver valor definido
    // Não re-executar se já houver valores definidos pelo usuário
    if (!referenceMonth) {
      setReferenceMonth(getCurrentMonth());
    }
    if (!referenceDate && spreadsheetType === 'daily') {
      const today = new Date().toISOString().split('T')[0];
      setReferenceDate(today);
    }
    // Remover dependências que causam re-execução desnecessária
    // Este useEffect deve executar apenas quando o componente monta ou quando o tipo muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetType]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Verificar se é administrador antes de permitir upload
    if (!isAdmin()) {
      setError('Apenas administradores podem fazer upload de planilhas.');
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    // Verificar se é um arquivo Excel
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setError('Por favor, selecione um arquivo Excel (.xlsx ou .xls)');
      return;
    }

    // Validar tamanho máximo (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB em bytes
    if (file.size > MAX_FILE_SIZE) {
      setError('O arquivo excede o tamanho máximo permitido de 5MB');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Ler arquivo como ArrayBuffer primeiro para converter para base64 e binary
      const reader = new FileReader();
      
      reader.onload = (e) => {
        (async () => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
              setError('Erro ao ler o arquivo');
              setIsUploading(false);
              return;
            }
            
            // Converter ArrayBuffer para base64 (para preservar arquivo original)
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const originalFileBase64 = btoa(binary);
            
            // Converter ArrayBuffer para binary string para processar com XLSX
            const data = binary;
            const workbook = XLSX.read(data, { type: 'binary' });
            
            // Pegar a primeira planilha
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Usar defval: '' para garantir que todas as células sejam lidas
            // raw: true para preservar valores numéricos exatos da planilha
            // blankrows: true para não pular linhas vazias
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1, 
              defval: '',
              raw: true, // Preservar valores numéricos originais da planilha
              blankrows: true // NÃO pular linhas vazias - manter TODAS as linhas
            });
            
            if (jsonData.length === 0) {
              setError('A planilha está vazia');
              setIsUploading(false);
              return;
            }

            // Primeira linha são os cabeçalhos - LER TODAS AS COLUNAS
            const headerRow = jsonData[0] as any[] || [];
            
            // Extrair TODOS os cabeçalhos da planilha, preservando nomes originais
            // Se uma coluna não tiver nome, usar um nome padrão baseado no índice
            const headers: string[] = [];
            headerRow.forEach((headerValue, index) => {
              if (headerValue !== undefined && headerValue !== null && String(headerValue).trim() !== '') {
                // Preservar nome original da coluna exatamente como está na planilha
                headers.push(String(headerValue).trim());
              } else {
                // Se a coluna não tiver nome, criar um nome padrão
                headers.push(`Coluna ${index + 1}`);
              }
            });
            
            // Se não encontrou cabeçalhos, criar cabeçalhos padrão baseados no número de colunas
            if (headers.length === 0 && jsonData.length > 0) {
              const firstRow = jsonData[0] as any[] || [];
              for (let i = 0; i < firstRow.length; i++) {
                headers.push(`Coluna ${i + 1}`);
              }
            }
            
            // Determinar o número máximo de colunas em todas as linhas
            let maxColumns = headers.length;
            jsonData.forEach((row: any) => {
              if (Array.isArray(row) && row.length > maxColumns) {
                maxColumns = row.length;
              }
            });
            
            // Garantir que temos cabeçalhos para todas as colunas
            while (headers.length < maxColumns) {
              headers.push(`Coluna ${headers.length + 1}`);
            }
            
            console.log('=== LEITURA COMPLETA DA PLANILHA ===');
            console.log(`Total de colunas encontradas: ${headers.length}`);
            console.log('Cabeçalhos:', headers);
            console.log(`Total de linhas (incluindo cabeçalho): ${jsonData.length}`);
            
            // Processar TODAS as linhas (sem pular nenhuma)
            // Garantir que todas as linhas sejam processadas, mesmo as vazias
            // Preservar TODOS os valores exatamente como estão na planilha
            const rows = jsonData.slice(1).map((row: any) => {
              const obj: Record<string, any> = {};
              
              // Processar TODAS as colunas, não apenas algumas
              headers.forEach((headerName, colIndex) => {
                // Ler valor da célula - preservar valor original exatamente como está
                let value: any = '';
                
                if (Array.isArray(row)) {
                  // Se a linha é um array, pegar o valor pelo índice
                  value = row[colIndex];
                } else if (typeof row === 'object' && row !== null) {
                  // Se a linha é um objeto, tentar pegar pelo nome da coluna
                  value = row[headerName] !== undefined ? row[headerName] : row[colIndex];
                }
                
                // Preservar valor exato da planilha:
                // - Se for número, manter como número
                // - Se for string, manter como string
                // - Se for data, manter como está
                // - Se for null/undefined, usar string vazia
                if (value === null || value === undefined) {
                  obj[headerName] = '';
                } else {
                  // Preservar tipo original - não converter nada
                  obj[headerName] = value;
                }
              });
              
              return obj;
            });
            
            // NÃO filtrar linhas vazias - manter TODAS as linhas da planilha
            // Isso garante que nenhuma linha seja ignorada
            console.log(`Total de linhas processadas: ${rows.length} (incluindo linhas vazias)`);
            console.log(`Total de colunas processadas: ${headers.length}`);
            console.log(`Planilha processada completamente: ${rows.length} linhas × ${headers.length} colunas`);

            // Processar vendas estruturadas
            const sales = await parseSpreadsheetToSales(rows, headers, customerId);

            // Usar mês de referência selecionado ou mês atual
            const monthToUse = referenceMonth || getCurrentMonth();

            const spreadsheet: SpreadsheetData = {
              customerId,
              terminalId: terminalId || undefined,
              fileName: file.name,
              uploadedAt: new Date().toISOString(),
              referenceMonth: monthToUse,
              referenceDate: referenceDate || undefined, // Sempre salvar a data selecionada
              type: spreadsheetType,
              data: rows,
              headers,
              sales,
              originalFile: originalFileBase64, // Salvar arquivo original em base64 para preservar formatação
              description: description || undefined, // Descrição da planilha
            };

            // Mostrar prévia antes de salvar
            setPreviewData(spreadsheet);
            setShowPreview(true);
            setIsUploading(false);
          } catch (err) {
            console.error('Erro ao processar planilha:', err);
            setError('Erro ao processar a planilha. Verifique se o arquivo está no formato correto.');
            setIsUploading(false);
          }
        })();
      };

      reader.onerror = () => {
        setError('Erro ao ler o arquivo');
        setIsUploading(false);
      };

      // Ler como ArrayBuffer para poder converter para base64 e binary
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao fazer upload do arquivo');
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    // Verificar se é administrador antes de permitir exclusão
    if (!isAdmin()) {
      setError('Apenas administradores podem excluir planilhas.');
      return;
    }
    
    if (window.confirm('Tem certeza que deseja excluir esta planilha?')) {
      await deleteSpreadsheet(customerId, terminalId);
      updateSpreadsheetData(null);
    }
  };

  const handleConfirmSave = async () => {
    if (!previewData) return;
    
    try {
      // Garantir que o referenceMonth está definido
      // IMPORTANTE: Para planilhas diárias, garantir que referenceDate está definido
      const finalReferenceDate = spreadsheetType === 'daily' 
        ? (referenceDate || previewData.referenceDate || new Date().toISOString().split('T')[0])
        : undefined;
      
      const spreadsheetToSave = {
        ...previewData,
        referenceMonth: referenceMonth || getCurrentMonth(),
        referenceDate: finalReferenceDate,
        type: spreadsheetType,
        description: description || previewData.description || undefined, // Incluir descrição ao salvar
      };
      
      await saveSpreadsheet(spreadsheetToSave);
      
      // Limpar descrição após salvar
      setDescription('');
      
      // Recarregar meses e dias disponíveis baseado no tipo
      if (spreadsheetToSave.type === 'daily') {
        const days = await getAvailableDays(customerId, terminalId, spreadsheetToSave.referenceMonth);
        setAvailableDays(days);
        
        // Selecionar o dia da planilha salva
        if (spreadsheetToSave.referenceDate && days.includes(spreadsheetToSave.referenceDate)) {
          setSelectedDay(spreadsheetToSave.referenceDate);
        } else if (days.length > 0) {
          setSelectedDay(days[0]);
        }
        
        // Recarregar meses também
        const months = await getAvailableMonths(customerId, terminalId, 'daily');
        setAvailableMonths(months);
        
        // Selecionar o mês da planilha salva
        const savedMonth = spreadsheetToSave.referenceMonth;
        if (months.includes(savedMonth)) {
          setSelectedMonth(savedMonth);
        } else if (months.length > 0) {
          setSelectedMonth(months[0]);
        }
      } else {
        // Recarregar meses disponíveis
        const months = await getAvailableMonths(customerId, terminalId, 'monthly');
        setAvailableMonths(months);
        
        // Selecionar o mês da planilha salva
        const savedMonth = spreadsheetToSave.referenceMonth;
        if (months.includes(savedMonth)) {
          setSelectedMonth(savedMonth);
        } else if (months.length > 0) {
          setSelectedMonth(months[0]);
        }
      }
      
      setSpreadsheetData(spreadsheetToSave);
      setPreviewData(null);
      setShowPreview(false);
      
      // Mostrar mensagem de sucesso baseada no tipo
      const dataLabel = spreadsheetToSave.referenceDate 
        ? formatDateLocal(spreadsheetToSave.referenceDate)
        : spreadsheetToSave.referenceMonth?.split('-').reverse().join('/');
      
      if (spreadsheetToSave.type === 'daily') {
        alert(`✅ Planilha diária adicionada com sucesso!\n\nData: ${dataLabel}\nArquivo: ${spreadsheetToSave.fileName}\n\nVocê pode adicionar mais planilhas diárias para outros dias.`);
        // Manter o tipo como 'daily' para permitir adicionar mais planilhas diárias
        // Apenas resetar a data de referência para permitir selecionar um novo dia
        setReferenceDate('');
        // Manter o mês atual ou o mês da planilha salva
        if (spreadsheetToSave.referenceMonth) {
          setReferenceMonth(spreadsheetToSave.referenceMonth);
        }
      } else {
        alert(`✅ Planilha mensal salva com sucesso!\n\nMês: ${dataLabel}\nArquivo: ${spreadsheetToSave.fileName}\n\nSe já existia uma planilha mensal deste mês, ela foi substituída.`);
        // Resetar tipo para mensal apenas se for planilha mensal
        setSpreadsheetType('monthly');
        setReferenceDate('');
        setReferenceMonth(getCurrentMonth());
      }
      
      // Disparar evento customizado para atualizar dashboards em tempo real
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('spreadsheetUpdated', { 
          detail: { 
            customerId: spreadsheetToSave.customerId, 
            terminalId: spreadsheetToSave.terminalId,
            type: spreadsheetToSave.type || 'monthly',
            referenceDate: spreadsheetToSave.referenceDate,
            referenceMonth: spreadsheetToSave.referenceMonth,
            forceUpdate: true 
          } 
        }));
      }, 100);
    } catch (error) {
      console.error('Erro ao salvar planilha:', error);
      setError('Erro ao salvar a planilha. Tente novamente.');
    }
  };

  const handleCancelPreview = () => {
    setPreviewData(null);
    setShowPreview(false);
    setIsUploading(false);
  };

  const handleDownload = () => {
    if (!spreadsheetData) return;

    // Se temos o arquivo original, usar ele para preservar formatação exata
    if (spreadsheetData.originalFile) {
      try {
        // Converter base64 para blob e fazer download
        const base64Data = spreadsheetData.originalFile;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        // Criar link de download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = spreadsheetData.fileName || `planilha_${customerName}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        console.log('✅ Download do arquivo original realizado (formatação preservada)');
        return;
      } catch (error) {
        console.error('Erro ao fazer download do arquivo original:', error);
        // Se falhar, tentar método alternativo abaixo
      }
    }

    // Fallback: Se não temos arquivo original, reconstruir (comportamento antigo)
    console.warn('⚠️ Arquivo original não disponível, reconstruindo planilha (pode perder formatação)');
    const wb = XLSX.utils.book_new();
    const wsData = [
      spreadsheetData.headers,
      ...spreadsheetData.data.map(row => spreadsheetData.headers.map(header => row[header] || ''))
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha');

    // Download
    XLSX.writeFile(wb, spreadsheetData.fileName || `planilha_${customerName}.xlsx`);
  };

  const handleOpenEditCardValues = () => {
    if (spreadsheetData && spreadsheetMetrics) {
      // Campos zerados ao abrir o modal
      setCardValues({
        quantidadeVendas: '',
        valorBruto: '',
        taxa: '',
        valorLiquido: '',
      });
      setShowEditCardValues(true);
    }
  };

  const handleSaveCardValues = async () => {
    if (!spreadsheetData) return;
    
    try {
      const values: any = {};
      
      // Converter valores usando parseValorBrasileiro para garantir conversão correta
      if (cardValues.quantidadeVendas) {
        values.quantidadeVendas = parseFloat(cardValues.quantidadeVendas.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      }
      if (cardValues.valorBruto) {
        values.valorBruto = parseValorBrasileiro(cardValues.valorBruto);
      }
      if (cardValues.taxa) {
        values.taxa = parseValorBrasileiro(cardValues.taxa);
      }
      if (cardValues.valorLiquido) {
        values.valorLiquido = parseValorBrasileiro(cardValues.valorLiquido);
      }

      await saveCustomerCardValues(
        customerId, 
        values, 
        user?.id, 
        terminalId,
        spreadsheetData.referenceMonth,
        spreadsheetData.referenceDate,
        spreadsheetData.type || 'monthly'
      );
      setShowEditCardValues(false);
      
      // Recarregar métricas da planilha para garantir que estão atualizadas
      if (spreadsheetData && spreadsheetData.data && spreadsheetData.data.length > 0) {
        try {
          const metrics = await calculateSpreadsheetMetrics(spreadsheetData);
          // Garantir que todos os valores tenham defaults
          setSpreadsheetMetrics({
            ...metrics,
            totalVendas: metrics?.totalVendas ?? 0,
            valorBrutoTotal: metrics?.valorBrutoTotal ?? 0,
            taxaMedia: metrics?.taxaMedia ?? 0,
            valorLiquidoTotal: metrics?.valorLiquidoTotal ?? 0,
          } as any);
        } catch (error) {
          console.error('Erro ao recarregar métricas:', error);
        }
      }
      
      // Disparar evento para atualizar dashboards
      window.dispatchEvent(new CustomEvent('cardValuesUpdated', { 
        detail: { 
          customerId, 
          terminalId,
          referenceMonth: spreadsheetData.referenceMonth,
          referenceDate: spreadsheetData.referenceDate,
          type: spreadsheetData.type || 'monthly'
        } 
      }));
      
      alert('✅ Valores dos cards salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar valores dos cards:', error);
      alert('❌ Erro ao salvar valores dos cards. Tente novamente.');
    }
  };

  const handleDeleteCardValues = async () => {
    if (!spreadsheetData) return;
    
    if (window.confirm('Tem certeza que deseja remover os valores customizados dos cards? Eles voltarão a ser calculados automaticamente da planilha.')) {
      try {
        await deleteCustomerCardValues(
          customerId, 
          terminalId,
          spreadsheetData.referenceMonth,
          spreadsheetData.referenceDate,
          spreadsheetData.type || 'monthly'
        );
        setShowEditCardValues(false);
        
        // Recarregar métricas da planilha para garantir que estão atualizadas
        if (spreadsheetData && spreadsheetData.data && spreadsheetData.data.length > 0) {
          try {
            const metrics = await calculateSpreadsheetMetrics(spreadsheetData);
            // Garantir que todos os valores tenham defaults
            setSpreadsheetMetrics({
              ...metrics,
              totalVendas: metrics?.totalVendas ?? 0,
              valorBrutoTotal: metrics?.valorBrutoTotal ?? 0,
              taxaMedia: metrics?.taxaMedia ?? 0,
              valorLiquidoTotal: metrics?.valorLiquidoTotal ?? 0,
            } as any);
          } catch (error) {
            console.error('Erro ao recarregar métricas:', error);
          }
        }
        
        // Disparar evento para atualizar dashboards
        window.dispatchEvent(new CustomEvent('cardValuesUpdated', { 
          detail: { 
            customerId, 
            terminalId,
            referenceMonth: spreadsheetData.referenceMonth,
            referenceDate: spreadsheetData.referenceDate,
            type: spreadsheetData.type || 'monthly'
          } 
        }));
        
        alert('✅ Valores customizados removidos. Os cards voltarão a usar valores da planilha.');
      } catch (error) {
        console.error('Erro ao deletar valores dos cards:', error);
        alert('❌ Erro ao remover valores customizados. Tente novamente.');
      }
    }
  };

  return (
    <>
      {/* Modal de Prévia */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg border-2 border-black w-full max-w-5xl max-h-[85vh] flex flex-col">
            {/* Header da Prévia */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b-2 border-black">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6 md:w-8 md:h-8 text-black" />
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-black">Prévia dos Dados</h2>
                  <p className="text-sm text-gray-600">
                    {previewData.fileName} • {previewData.data.length} linhas • {previewData.headers.length} colunas
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelPreview}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 md:w-6 md:h-6 text-black" />
              </button>
            </div>

            {/* Conteúdo da Prévia */}
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-3">
                  Revise os dados abaixo antes de salvar. Esta planilha será vinculada ao cliente <strong>{customerName}</strong>.
                </p>
                 <div className="mt-3 space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-blue-900 mb-2">
                       Tipo de Planilha *
                     </label>
                     <select
                       value={spreadsheetType}
                       onChange={(e) => setSpreadsheetType(e.target.value as 'monthly' | 'daily')}
                       className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                     >
                       <option value="monthly">📊 Mensal - Resumo do mês completo</option>
                       <option value="daily">📅 Diária - Vendas de um dia específico</option>
                     </select>
                     <p className="text-xs text-blue-700 mt-1">
                       Escolha se esta planilha contém dados mensais ou de um dia específico
                     </p>
                   </div>
                   
                   <div>
                     <label className="block text-sm font-medium text-blue-900 mb-2">
                       Dia de Referência *
                     </label>
                     <input
                       type="date"
                       value={referenceDate}
                       onChange={(e) => {
                         setReferenceDate(e.target.value);
                         // Atualizar referenceMonth automaticamente baseado na data
                         if (e.target.value) {
                           const [year, month] = e.target.value.split('-');
                           setReferenceMonth(`${year}-${month}`);
                         }
                       }}
                       required
                       className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                     />
                     <p className="text-xs text-blue-700 mt-1">
                       {spreadsheetType === 'monthly' 
                         ? 'Selecione qualquer dia do mês de referência (apenas mês/ano será usado)'
                         : 'Selecione o dia específico desta planilha diária'}
                     </p>
                   </div>
                   
                   {/* Campo de Descrição - Apenas para administradores */}
                   {isAdmin() && (
                     <div>
                       <label className="block text-sm font-medium text-blue-900 mb-2">
                         Descrição da Planilha
                       </label>
                       <textarea
                         value={description}
                         onChange={(e) => setDescription(e.target.value)}
                         placeholder="Adicione uma descrição para esta planilha (opcional)"
                         rows={3}
                         className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                       />
                       <p className="text-xs text-blue-700 mt-1">
                         Esta descrição será visível para o cliente ao visualizar a planilha
                       </p>
                     </div>
                   )}
                 </div>
              </div>

              {/* Tabela de Prévia - Todas as Colunas */}
              <div className="overflow-x-auto border-2 border-black rounded-lg mb-4">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="bg-black text-white">
                      {previewData.headers.map((header, index) => (
                        <th
                          key={index}
                          className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.data.slice(0, 10).map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      >
                        {previewData.headers.map((header, colIndex) => (
                          <td
                            key={colIndex}
                            className="py-3 px-4 text-sm text-gray-700 border-b border-gray-200"
                          >
                            {row[header] !== null && row[header] !== undefined
                              ? String(row[header])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewData.data.length > 10 && (
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Mostrando as primeiras 10 linhas de {previewData.data.length} totais
                </p>
              )}

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleConfirmSave}
                  className="flex-1 flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  <Check className="w-5 h-5" />
                  Confirmar e Salvar
                </button>
                <button
                  onClick={handleCancelPreview}
                  className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Principal */}
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg border-2 border-black w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b-2 border-black flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-1">
            <FileSpreadsheet className="w-6 h-6 md:w-8 md:h-8 text-black" />
            <div className="flex-1">
              <h2 className="text-lg md:text-xl font-bold text-black">
                {spreadsheetType === 'monthly' ? '📊 Planilhas Mensais' : '📅 Planilhas Diárias'} - {terminalName ? `${terminalName} (${customerName})` : customerName}
              </h2>
              {spreadsheetData && (
                <div>
                  <p className="text-sm text-gray-600">
                    {spreadsheetData.fileName} • {new Date(spreadsheetData.uploadedAt).toLocaleDateString('pt-BR')}
                    {spreadsheetData.referenceDate && spreadsheetType === 'daily' && (
                      <span className="ml-2 font-semibold text-green-700">
                        📅 {formatDateLocal(spreadsheetData.referenceDate)}
                      </span>
                    )}
                    {spreadsheetData.referenceMonth && spreadsheetType === 'monthly' && (
                      <span className="ml-2 font-semibold text-blue-700">
                        📊 {formatMonth(spreadsheetData.referenceMonth)}
                      </span>
                    )}
                  </p>
                  {spreadsheetData.description && spreadsheetData.description.trim() !== '' && (
                    <p className="text-sm text-gray-700 mt-2 italic border-l-4 border-blue-500 pl-3 font-bold">
                      {spreadsheetData.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de Tipo de Planilha - Visível para todos */}
            <select
              value={spreadsheetType}
                onChange={(e) => {
                  setSpreadsheetType(e.target.value as 'monthly' | 'daily');
                  setSelectedMonth('');
                  setSelectedDay('');
                }}
              className="px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white font-semibold text-sm"
              title={isAdmin() ? "Selecione o tipo de planilha para gerenciar" : "Selecione o tipo de planilha para visualizar"}
            >
              <option value="monthly">📊 Mensal</option>
              <option value="daily">📅 Diária</option>
            </select>
            
            {/* Seletor de Mês - Para ambos os tipos */}
            {spreadsheetType === 'monthly' && availableMonths.length > 0 && (
              <select
                value={selectedMonth}
                onChange={async (e) => {
                  const monthValue = e.target.value;
                  // SOLUÇÃO RADICAL: Marcar que o usuário interagiu - isso BLOQUEIA TODAS as alterações automáticas
                  hasUserInteractedRef.current = true;
                  lockSelectionRef.current = true;
                  userSelectedMonthRef.current = true;
                  lastSelectedMonthRef.current = monthValue;
                  
                  setSelectedMonth(monthValue);
                  // Carregar planilha imediatamente
                  if (monthValue) {
                    const data = terminalId 
                      ? await getSpreadsheetByTerminalId(terminalId, customerId, monthValue, 'monthly')
                      : await getSpreadsheetByCustomerId(customerId, monthValue, 'monthly');
                    setSpreadsheetData(data);
                  } else {
                    updateSpreadsheetData(null);
                  }
                }}
                className="px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white font-semibold"
                title="Selecione o mês para visualizar a planilha mensal"
              >
                <option value="">Selecione o mês</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>
                    📊 {formatMonth(month)}
                  </option>
                ))}
              </select>
            )}
            
            {/* Seletor de Mês - Para planilhas diárias */}
            {spreadsheetType === 'daily' && availableMonths.length > 0 && (
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const monthValue = e.target.value;
                  // SOLUÇÃO RADICAL: Marcar que o usuário interagiu - isso BLOQUEIA TODAS as alterações automáticas
                  hasUserInteractedRef.current = true;
                  lockSelectionRef.current = true;
                  userSelectedMonthRef.current = true;
                  lastSelectedMonthRef.current = monthValue;
                  
                  setSelectedMonth(monthValue);
                  // Limpar dia ao mudar mês (mas marcar que foi ação do usuário)
                  if (!userSelectedDayRef.current) {
                    setSelectedDay('');
                    lastSelectedDayRef.current = '';
                  }
                }}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 transition-colors bg-white"
                title="Selecione o mês para filtrar os dias"
              >
                <option value="">Selecione o mês</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>
                    {formatMonth(month)}
                  </option>
                ))}
              </select>
            )}
            
            {/* Seletor de Dia - Apenas para planilhas diárias */}
            {spreadsheetType === 'daily' && selectedMonth && availableDays.length > 0 && (
              <select
                value={selectedDay}
                onChange={async (e) => {
                  const dayValue = e.target.value;
                  // SOLUÇÃO RADICAL: Marcar que o usuário interagiu - isso BLOQUEIA TODAS as alterações automáticas
                  hasUserInteractedRef.current = true;
                  lockSelectionRef.current = true;
                  userSelectedDayRef.current = true;
                  lastSelectedDayRef.current = dayValue;
                  
                  setSelectedDay(dayValue);
                  // Carregar planilha imediatamente quando selecionar o dia
                  if (dayValue) {
                    const data = await getSpreadsheetByDate(customerId, dayValue, terminalId);
                    setSpreadsheetData(data);
                  } else {
                    updateSpreadsheetData(null);
                  }
                }}
                className="px-4 py-2 border-2 border-green-300 rounded-lg focus:outline-none focus:border-green-500 transition-colors bg-white font-semibold"
                title="Selecione o dia para visualizar a planilha diária"
              >
                <option value="">Selecione o dia</option>
                {availableDays.map(day => {
                  // Formatar data sem problemas de timezone
                  const parts = day.split('-');
                  let formattedDate = day;
                  if (parts.length === 3) {
                    const [year, month, dayNum] = parts;
                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(dayNum));
                    formattedDate = date.toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    });
                  }
                  return (
                    <option key={day} value={day}>
                      📅 {formattedDate}
                    </option>
                  );
                })}
              </select>
            )}
            
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 text-black" />
          </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border-2 border-red-300 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Visualização de Dias Disponíveis - Apenas para planilhas diárias */}
          {spreadsheetType === 'daily' && selectedMonth && availableDays.length > 0 && (
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-green-700" />
                <h3 className="text-lg font-bold text-green-900">
                  Selecione o Dia para Visualizar a Planilha
                </h3>
                <span className="ml-auto text-sm text-green-700 font-semibold">
                  {availableDays.length} {availableDays.length === 1 ? 'dia disponível' : 'dias disponíveis'}
                </span>
              </div>
              
              {/* Lista de Dias em Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {availableDays.map(day => {
                  // Formatar data sem problemas de timezone
                  const parts = day.split('-');
                  let formattedDate = day;
                  let weekday = '';
                  if (parts.length === 3) {
                    const [year, month, dayNum] = parts;
                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(dayNum));
                    formattedDate = date.toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    });
                    weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
                  }
                  const isSelected = selectedDay === day;
                  
                  return (
                    <button
                      key={day}
                      onClick={async () => {
                        // SOLUÇÃO RADICAL: Marcar que o usuário interagiu - isso BLOQUEIA TODAS as alterações automáticas
                        hasUserInteractedRef.current = true;
                        lockSelectionRef.current = true;
                        userSelectedDayRef.current = true;
                        lastSelectedDayRef.current = day;
                        
                        // Atualizar dia selecionado e carregar planilha imediatamente
                        setSelectedDay(day);
                        const data = await getSpreadsheetByDate(customerId, day, terminalId);
                        updateSpreadsheetData(data);
                      }}
                      className={`p-4 rounded-lg border-2 transition-all text-center ${
                        isSelected
                          ? 'bg-green-600 text-white border-green-700 shadow-lg scale-105 font-bold'
                          : 'bg-white text-green-700 border-green-300 hover:bg-green-100 hover:border-green-400 hover:shadow-md'
                      }`}
                    >
                      <div className={`text-xs font-semibold uppercase mb-1 ${isSelected ? 'text-green-100' : 'text-green-600'}`}>
                        {weekday}
                      </div>
                      <div className={`text-base font-bold ${isSelected ? 'text-white' : 'text-green-800'}`}>
                        {formattedDate}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <p className="mt-4 text-sm text-green-700 text-center font-medium">
                {selectedDay 
                  ? `✅ Dia selecionado: ${formatDateLocal(selectedDay)}`
                  : '👆 Clique em um dia acima para visualizar a planilha correspondente'}
              </p>
            </div>
          )}
          

          {!spreadsheetData ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileSpreadsheet className="w-16 h-16 md:w-20 md:h-20 text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2 text-center font-medium">
                {spreadsheetType === 'daily' 
                  ? (selectedMonth 
                      ? (selectedDay 
                          ? `Nenhuma planilha encontrada para o dia ${formatDateLocal(selectedDay)}. Verifique se a planilha foi salva corretamente.`
                          : availableDays.length > 0
                            ? 'Selecione um dia no seletor acima para visualizar a planilha'
                            : 'Nenhuma planilha diária encontrada para o mês selecionado')
                      : availableMonths.length > 0
                        ? 'Selecione um mês para ver os dias disponíveis'
                        : 'Nenhuma planilha diária carregada para este cliente')
                  : (selectedMonth 
                      ? 'Nenhuma planilha encontrada para o mês selecionado' 
                      : availableMonths.length > 0
                        ? 'Selecione um mês para visualizar a planilha'
                        : 'Nenhuma planilha carregada para este cliente')}
              </p>
              {spreadsheetType === 'daily' && availableDays.length > 0 ? (
                <div className="mt-4">
                  <p className="text-gray-500 mb-4 text-center text-sm">
                    {availableDays.length} {availableDays.length === 1 ? 'dia disponível' : 'dias disponíveis'} com planilhas diárias
                  </p>
                  <p className="text-gray-500 mb-4 text-center text-sm">
                    Selecione um dia no seletor acima para visualizar a planilha
                  </p>
                </div>
              ) : availableMonths.length > 0 ? (
                <div className="mt-4">
                  <p className="text-gray-500 mb-4 text-center text-sm">
                    Selecione outro mês no seletor acima
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 mb-6 text-center text-sm">
                    {isAdmin() 
                      ? 'Envie uma planilha Excel (.xlsx ou .xls) com tamanho máximo de 5MB'
                      : 'Aguardando administrador enviar planilha'}
                  </p>
                  {isAdmin() && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
                <div className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold">
                  <Upload className="w-5 h-5" />
                  <span>{isUploading ? 'Carregando...' : 'Enviar Planilha Excel'}</span>
                </div>
              </label>
                  )}
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Actions - Apenas para Administradores */}
              {isAdmin() && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileSpreadsheet className="w-5 h-5 text-blue-700" />
                    <h4 className="font-semibold text-blue-900">Gerenciar Planilhas</h4>
                  </div>
                  
                  {/* Informação sobre tipos de planilha */}
                  <div className="mb-3 text-sm text-blue-800 space-y-1">
                    <p>• <strong>Planilha Mensal:</strong> 1 por mês (novo upload substitui a anterior)</p>
                    <p>• <strong>Planilha Diária:</strong> Múltiplas permitidas (novo upload adiciona nova entrada)</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                    <div className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-semibold">
                      <Upload className="w-4 h-4" />
                        <span>{isUploading ? 'Carregando...' : 'Enviar Nova Planilha'}</span>
                    </div>
                  </label>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                      title="Excluir planilha atual exibida"
                  >
                    <Trash2 className="w-4 h-4" />
                      Excluir Esta Planilha
                  </button>
                  </div>
                </div>
              )}
              {/* Botões de Ação - Disponíveis para todos */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-semibold"
                  title="Baixar planilha atual"
                >
                  <Download className="w-4 h-4" />
                  Baixar Planilha
                </button>
                {/* Botão de Editar Descrição - Apenas para administradores quando há planilha selecionada */}
                {isAdmin() && spreadsheetData && (
                  <button
                    onClick={() => {
                      setEditingDescription(spreadsheetData.description || '');
                      setShowEditDescription(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
                    title="Editar descrição da planilha"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar Descrição
                  </button>
                )}
                {/* Botão de Editar Valores dos Cards - Apenas quando há planilha selecionada */}
                {spreadsheetData && spreadsheetMetrics && (
                  <button
                    onClick={handleOpenEditCardValues}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
                    title="Editar valores dos cards KPI"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar Valores dos Cards
                  </button>
                )}
              </div>

              {/* Table - Todas as Colunas da Planilha */}
              <div className="overflow-x-auto border-2 border-black rounded-lg">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="bg-black text-white">
                      {spreadsheetData.headers.map((header, index) => (
                        <th
                          key={index}
                          className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spreadsheetData.data.length === 0 ? (
                      <tr>
                        <td
                          colSpan={spreadsheetData.headers.length}
                          className="py-8 text-center text-gray-500"
                        >
                          Nenhum dado encontrado
                        </td>
                      </tr>
                    ) : (
                      spreadsheetData.data.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}
                        >
                          {spreadsheetData.headers.map((header, colIndex) => (
                            <td
                              key={colIndex}
                              className="py-3 px-4 text-sm text-gray-700 border-b border-gray-200"
                            >
                              {row[header] !== null && row[header] !== undefined
                                ? String(row[header])
                                : '-'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Info */}
              <div className="mt-4 text-sm text-gray-600">
                Total de linhas: {spreadsheetData.data.length} | Total de colunas: {spreadsheetData.headers.length}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição de Valores dos Cards */}
      {/* Modal de Editar Descrição */}
      {showEditDescription && spreadsheetData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-lg border-2 border-black w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b-2 border-black">
              <div className="flex items-center gap-3">
                <Edit2 className="w-6 h-6 md:w-8 md:h-8 text-black" />
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-black">Editar Descrição da Planilha</h2>
                  <p className="text-sm text-gray-600">
                    {spreadsheetData.fileName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEditDescription(false);
                  setEditingDescription('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 md:w-6 md:h-6 text-black" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-black mb-2">
                  Descrição da Planilha
                </label>
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  placeholder="Adicione uma descrição para esta planilha (opcional)"
                  rows={5}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Esta descrição será visível para o cliente ao visualizar a planilha
                </p>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-3 p-4 md:p-6 border-t-2 border-black">
              <button
                onClick={async () => {
                  try {
                    // Atualizar apenas a descrição da planilha existente
                    const updatedSpreadsheet: SpreadsheetData = {
                      ...spreadsheetData,
                      description: editingDescription.trim() || undefined,
                    };
                    
                    await saveSpreadsheet(updatedSpreadsheet);
                    updateSpreadsheetData(updatedSpreadsheet);
                    setShowEditDescription(false);
                    setEditingDescription('');
                  } catch (error) {
                    console.error('Erro ao salvar descrição:', error);
                    alert('Erro ao salvar descrição. Tente novamente.');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                <Save className="w-5 h-5" />
                Salvar Descrição
              </button>
              <button
                onClick={() => {
                  setShowEditDescription(false);
                  setEditingDescription('');
                }}
                className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCardValues && spreadsheetData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-lg border-2 border-black w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b-2 border-black">
              <div className="flex items-center gap-3">
                <Edit2 className="w-6 h-6 md:w-8 md:h-8 text-black" />
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-black">Editar Valores dos Cards</h2>
                  <p className="text-sm text-gray-600">
                    {spreadsheetType === 'monthly' 
                      ? `Planilha Mensal - ${formatMonth(selectedMonth)}`
                      : `Planilha Diária - ${formatDateLocal(selectedDay)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditCardValues(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 md:w-6 md:h-6 text-black" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Valores calculados da planilha:</strong> Os valores abaixo foram calculados automaticamente da planilha selecionada. 
                  Você pode editá-los manualmente se necessário.
                </p>
              </div>

              <div className="space-y-4">
                {/* Quantidade de Vendas */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Quantidade de Vendas
                  </label>
                  <input
                    type="text"
                    value={cardValues.quantidadeVendas}
                    onChange={(e) => setCardValues({ ...cardValues, quantidadeVendas: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    placeholder="0"
                  />
                  {spreadsheetMetrics && spreadsheetMetrics.totalVendas !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Valor calculado: {(spreadsheetMetrics.totalVendas || 0).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                {/* Valor Bruto */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Valor Bruto (R$)
                  </label>
                  <input
                    type="text"
                    value={cardValues.valorBruto}
                    onChange={(e) => {
                      let valorBruto = e.target.value;
                      
                      // Se vazio, limpar tudo
                      if (!valorBruto || valorBruto.trim() === '') {
                        setCardValues({ ...cardValues, valorBruto: '', taxa: '', valorLiquido: '' });
                        return;
                      }
                      
                      // Normalizar entrada (remove caracteres inválidos, mas mantém números, vírgula e ponto)
                      valorBruto = normalizarEntrada(valorBruto);
                      
                      // Converter para número (remove formatação)
                      const valorBrutoNum = parseValorBrasileiro(valorBruto);
                      
                      // Atualizar campo com valor normalizado (permite digitação livre)
                      setCardValues({ ...cardValues, valorBruto: valorBruto });
                      
                      // Se o valor é válido, calcular e formatar os outros campos
                      if (valorBrutoNum > 0) {
                        // Calcular taxa automaticamente (5,10%)
                        const taxaCalculada = (valorBrutoNum * TAXA_PERCENTUAL) / 100;
                        // Calcular valor líquido automaticamente
                        const valorLiquidoCalculado = valorBrutoNum - taxaCalculada;
                        
                        // Formatar apenas os campos calculados
                        const taxaFormatada = formatarValorBrasileiro(taxaCalculada);
                        const valorLiquidoFormatado = formatarValorBrasileiro(valorLiquidoCalculado);
                        
                        setCardValues({
                          ...cardValues,
                          valorBruto: valorBruto, // Mantém o valor digitado sem formatar ainda
                          taxa: taxaFormatada,
                          valorLiquido: valorLiquidoFormatado,
                        });
                      }
                    }}
                    onBlur={(e) => {
                      // Quando o campo perde o foco, formatar o valor bruto
                      const valorBruto = e.target.value;
                      if (valorBruto) {
                        const valorBrutoNum = parseValorBrasileiro(valorBruto);
                        if (valorBrutoNum > 0) {
                          const valorBrutoFormatado = formatarValorBrasileiro(valorBrutoNum);
                          setCardValues({ ...cardValues, valorBruto: valorBrutoFormatado });
                        }
                      }
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    placeholder="0,00"
                  />
                  {spreadsheetMetrics && spreadsheetMetrics.valorBrutoTotal !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Valor calculado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(spreadsheetMetrics.valorBrutoTotal || 0)}
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">
                    💡 Ao inserir o valor bruto, a taxa (5,10% em R$) e o valor líquido serão calculados automaticamente.
                  </p>
                </div>

                {/* Taxa */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Taxa (R$)
                  </label>
                  <input
                    type="text"
                    value={cardValues.taxa}
                    onChange={(e) => {
                      const taxa = e.target.value;
                      
                      // Se vazio, limpar
                      if (!taxa || taxa.trim() === '') {
                        setCardValues({ ...cardValues, taxa: '' });
                        return;
                      }
                      
                      const taxaNum = parseValorBrasileiro(taxa);
                      const taxaFormatada = taxaNum > 0 ? formatarValorBrasileiro(taxaNum) : taxa;
                      
                      setCardValues({ ...cardValues, taxa: taxaFormatada });
                      
                      // Recalcular valor líquido se houver valor bruto
                      if (cardValues.valorBruto && taxaNum > 0) {
                        const valorBrutoNum = parseValorBrasileiro(cardValues.valorBruto);
                        if (valorBrutoNum > 0) {
                          const valorLiquidoCalculado = valorBrutoNum - taxaNum;
                          const valorLiquidoFormatado = formatarValorBrasileiro(valorLiquidoCalculado);
                          setCardValues({ ...cardValues, taxa: taxaFormatada, valorLiquido: valorLiquidoFormatado });
                        }
                      }
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    placeholder="0,00"
                  />
                  {spreadsheetMetrics && spreadsheetMetrics.taxaMedia !== undefined && spreadsheetMetrics.valorBrutoTotal !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Valor calculado da planilha: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((spreadsheetMetrics.taxaMedia || 0) * (spreadsheetMetrics.valorBrutoTotal || 0) / 100)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Taxa calculada automaticamente: 5,10% do valor bruto (em R$).
                  </p>
                </div>

                {/* Valor Líquido */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Valor Líquido (R$)
                  </label>
                  <input
                    type="text"
                    value={cardValues.valorLiquido}
                    readOnly
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors bg-gray-50"
                    placeholder="0,00"
                  />
                  {spreadsheetMetrics && spreadsheetMetrics.valorLiquidoTotal !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Valor calculado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(spreadsheetMetrics.valorLiquidoTotal || 0)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Valor líquido calculado automaticamente (Valor Bruto - Taxa).
                  </p>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-3 p-4 md:p-6 border-t-2 border-gray-200">
              <button
                onClick={handleSaveCardValues}
                className="flex-1 flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                <Save className="w-5 h-5" />
                Salvar Valores
              </button>
              {spreadsheetData && spreadsheetMetrics && (
                <button
                  onClick={handleDeleteCardValues}
                  className="px-4 py-3 bg-red-100 text-red-700 rounded-lg font-semibold hover:bg-red-200 transition-colors"
                  title="Remover valores customizados e voltar a usar valores da planilha"
                >
                  Remover Customização
                </button>
              )}
              <button
                onClick={() => setShowEditCardValues(false)}
                className="px-4 py-3 bg-gray-200 text-black rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

// Função auxiliar para formatar data sem problemas de timezone (usada em múltiplos componentes)
const formatDateLocal = (dateString: string): string => {
  if (!dateString) return '';
  // Se a data está no formato YYYY-MM-DD, extrair diretamente sem usar Date
  // para evitar problemas de timezone
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    // Criar data local diretamente
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  // Fallback para formato de data padrão
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export default CustomerSpreadsheet;

