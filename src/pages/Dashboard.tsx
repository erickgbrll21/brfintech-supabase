import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  DollarSign, 
  ShoppingCart, 
  FileSpreadsheet,
  Percent,
  Download
} from 'lucide-react';
import KPICard from '../components/KPICard';
import FilterBar from '../components/FilterBar';
import { useAuth } from '../context/AuthContext';
import { getSales } from '../services/salesService';
import { getCustomerById } from '../services/customerService';
import { getSpreadsheetByCustomerId, getSpreadsheetByTerminalId, getSpreadsheetsByCustomerId, SpreadsheetData, getAvailableDays, getSpreadsheetByDate, getAvailableMonths, calculateSpreadsheetMetrics } from '../services/spreadsheetService';
import CustomerSpreadsheet from '../components/CustomerSpreadsheet';
import { getCustomerTax } from '../services/customerTaxService';
import { getCustomerCardValues } from '../services/customerCardValuesService';
import { FilterOptions, Sale } from '../types';

const Dashboard = () => {
  const { user, isCustomer, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerTerminals, setCustomerTerminals] = useState<Array<{ id: string; terminalId: string; name?: string }>>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('all'); // 'all' para todas as contas
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [spreadsheetMetrics, setSpreadsheetMetrics] = useState<any>(null);
  const [showSpreadsheetModal, setShowSpreadsheetModal] = useState(false);
  const [selectedTerminalForUpload, setSelectedTerminalForUpload] = useState<string | null>(null);
  const [spreadsheetDataDaily, setSpreadsheetDataDaily] = useState<SpreadsheetData | null>(null);
  const [activeTab, setActiveTab] = useState<'monthly' | 'daily'>('monthly');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Função para formatar mês (YYYY-MM) para exibição (MM/YYYY)
  const formatMonth = (month: string): string => {
    if (!month) return '';
    const [year, monthNum] = month.split('-');
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${monthNames[parseInt(monthNum) - 1]}/${year}`;
  };

  // Ref para rastrear a última aba e planilha usada para atualizar valores
  const lastMetricsUpdateRef = useRef<{
    tab: 'monthly' | 'daily';
    spreadsheetId: string | null;
  }>({ tab: 'monthly', spreadsheetId: null });

  // Refs para rastrear se o usuário já interagiu manualmente com as seleções
  const userSelectedMonthRef = useRef<boolean>(false);
  const userSelectedDayRef = useRef<boolean>(false);
  const lastUserSelectedMonthRef = useRef<string>('');
  const lastUserSelectedDayRef = useRef<string>('');

  // Se for cliente, carregar suas contas e planilha
  // Atualizar automaticamente quando a planilha for reimportada
  useEffect(() => {
    if (!isCustomer() || !user?.customerId) {
      return;
    }

    let isMounted = true;
    // Usar objeto para garantir que o hash seja compartilhado entre renderizações
    const hashRef = { current: '' };

    const loadCustomerData = async () => {
      if (!isCustomer() || !user?.customerId || !isMounted) return;
      
      // IMPORTANTE: Se o usuário já selecionou manualmente, apenas atualizar os dados
      // mas NUNCA alterar a seleção
      const userHasSelectedMonth = userSelectedMonthRef.current && lastUserSelectedMonthRef.current;
      const userHasSelectedDay = userSelectedDayRef.current && lastUserSelectedDayRef.current;
      
      try {
        const customer = await getCustomerById(user.customerId);
        if (!customer || !isMounted) return;
        
        const terminals = customer.cieloTerminals?.map(t => ({
          id: t.id,
          terminalId: t.terminalId,
          name: t.name,
        })) || 
        (customer.cieloTerminalId ? [{
          id: `temp_${customer.cieloTerminalId}`,
          terminalId: customer.cieloTerminalId,
          name: `Conta ${customer.name}`,
        }] : []);
        
        setCustomerTerminals(prev => {
          // Só atualizar se mudou
          const prevStr = JSON.stringify(prev);
          const newStr = JSON.stringify(terminals);
          return prevStr === newStr ? prev : terminals;
        });
        
        // Carregar planilha baseado na seleção
        let spreadsheet: SpreadsheetData | null = null;
        
        if (selectedTerminalId === 'all') {
          // Se "Todas" estiver selecionado, buscar todas as planilhas do cliente
          const allSpreadsheets = await getSpreadsheetsByCustomerId(user.customerId);
          if (allSpreadsheets.length > 0) {
            // Se houver apenas uma planilha (sem terminalId), usar ela
            const generalSpreadsheet = allSpreadsheets.find(s => !s.terminalId);
            if (generalSpreadsheet) {
              spreadsheet = generalSpreadsheet;
            } else {
              // Usar a primeira planilha para exibição
              spreadsheet = allSpreadsheets[0];
            }
          }
        } else {
          // Se uma conta específica estiver selecionada, buscar sua planilha
          spreadsheet = await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId);
          if (!spreadsheet) {
            // Se não encontrar planilha da conta, tentar planilha geral do cliente
            spreadsheet = await getSpreadsheetByCustomerId(user.customerId);
          }
        }
        
        // Obter taxa atual do cliente para incluir no hash
        const customerTax = await getCustomerTax(user.customerId);
        
        // Criar hash simples que detecta mudanças essenciais
        const currentHash = spreadsheet 
          ? `${spreadsheet.uploadedAt}-${spreadsheet.data?.length || 0}-${customerTax || 'null'}-${selectedTerminalId}` 
          : '';
        
        // Carregar meses disponíveis para planilhas mensais
        const terminalIdForMonths = selectedTerminalId === 'all' ? undefined : selectedTerminalId;
        const months = await getAvailableMonths(user.customerId, terminalIdForMonths, 'monthly');
        setAvailableMonths(months);
        
        // PRIORIDADE ABSOLUTA: Se o usuário já selecionou manualmente, SEMPRE preservar
        // Esta verificação deve vir ANTES de qualquer outra lógica
        if (userHasSelectedMonth) {
          // Usuário já selecionou manualmente - SEMPRE preservar essa seleção
          const preservedMonth = lastUserSelectedMonthRef.current;
          // Garantir que a seleção está correta
          if (selectedMonth !== preservedMonth) {
            setSelectedMonth(preservedMonth);
          }
          
          // Tentar carregar a planilha para o mês preservado
          const monthSpreadsheet = selectedTerminalId === 'all'
            ? await getSpreadsheetByCustomerId(user.customerId, preservedMonth, 'monthly')
            : (selectedTerminalId && selectedTerminalId !== 'all' ? await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, preservedMonth, 'monthly') : null);
          if (monthSpreadsheet) {
            setSpreadsheetData(monthSpreadsheet);
          } else {
            setSpreadsheetData(null);
          }
        } else if (selectedMonth && months.includes(selectedMonth) && !userHasSelectedMonth) {
          // Mês selecionado está na lista - manter e recarregar (mas usuário não interagiu ainda)
          const monthSpreadsheet = selectedTerminalId === 'all'
            ? await getSpreadsheetByCustomerId(user.customerId, selectedMonth, 'monthly')
            : (selectedTerminalId && selectedTerminalId !== 'all' ? await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, selectedMonth, 'monthly') : null);
          if (monthSpreadsheet) {
            setSpreadsheetData(monthSpreadsheet);
          } else {
            setSpreadsheetData(null);
          }
        } else if (months.length > 0 && !selectedMonth && !userHasSelectedMonth) {
          // Se não há mês selecionado mas há meses disponíveis, usar o mais recente
          // MAS apenas se o usuário ainda não interagiu manualmente
          setSelectedMonth(months[0]);
          const monthSpreadsheet = selectedTerminalId === 'all'
            ? await getSpreadsheetByCustomerId(user.customerId, months[0], 'monthly')
            : await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, months[0], 'monthly');
          if (monthSpreadsheet) {
            setSpreadsheetData(monthSpreadsheet);
          } else {
            setSpreadsheetData(null);
          }
        } else if (spreadsheet && !userHasSelectedMonth && !selectedMonth) {
          // Se não há meses disponíveis mas há planilha, usar a planilha atual
          // MAS apenas se o usuário ainda não interagiu manualmente E não há mês selecionado
          setSpreadsheetData(spreadsheet);
          if (spreadsheet.referenceMonth && !userHasSelectedMonth) {
            setSelectedMonth(spreadsheet.referenceMonth);
          }
        } else if (!userHasSelectedMonth) {
          // Limpar seleção se não há meses disponíveis
          // MAS apenas se o usuário ainda não interagiu manualmente
          setSelectedMonth('');
          setSpreadsheetData(null);
        }
        // Se userHasSelectedMonth é true, NÃO fazer NADA - preservar a seleção do usuário
        
        // Carregar planilha diária mais recente
        let spreadsheetDaily: SpreadsheetData | null = null;
        if (selectedTerminalId === 'all') {
          const allSpreadsheetsDaily = (await getSpreadsheetsByCustomerId(user.customerId)).filter(s => (s.type || 'monthly') === 'daily');
          if (allSpreadsheetsDaily.length > 0) {
            const generalSpreadsheetDaily = allSpreadsheetsDaily.find(s => !s.terminalId);
            spreadsheetDaily = generalSpreadsheetDaily || allSpreadsheetsDaily[0];
          }
        } else {
          spreadsheetDaily = await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, undefined, 'daily');
          if (!spreadsheetDaily) {
            spreadsheetDaily = await getSpreadsheetByCustomerId(user.customerId, undefined, 'daily');
          }
        }
        
        // Carregar dias disponíveis para planilhas diárias
        const terminalIdForDays = selectedTerminalId === 'all' ? undefined : selectedTerminalId;
        const days = await getAvailableDays(user.customerId, terminalIdForDays);
        setAvailableDays(days);
        
        // PRIORIDADE ABSOLUTA: Se o usuário já selecionou manualmente, SEMPRE preservar
        // Esta verificação deve vir ANTES de qualquer outra lógica
        if (userHasSelectedDay) {
          // Usuário já selecionou manualmente - SEMPRE preservar essa seleção
          const preservedDay = lastUserSelectedDayRef.current;
          // Garantir que a seleção está correta
          if (selectedDay !== preservedDay) {
            setSelectedDay(preservedDay);
          }
          
          // Tentar carregar a planilha para o dia preservado
          const daySpreadsheet = await getSpreadsheetByDate(user.customerId, preservedDay, terminalIdForDays);
          setSpreadsheetDataDaily(daySpreadsheet || null);
          
          // Se estamos na aba diária e há planilha carregada, garantir que os cards apareçam
          if (activeTab === 'daily' && daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
            const metrics = await calculateSpreadsheetMetrics(daySpreadsheet);
            const customValues = await getCustomerCardValues(
              user.customerId,
              terminalIdForDays,
              undefined,
              preservedDay,
              'daily'
            );
            if (customValues) {
              setSpreadsheetMetrics({
                totalVendas: customValues.quantidadeVendas || 0,
                valorBrutoTotal: customValues.valorBruto || 0,
                taxaMedia: customValues.taxa || 0,
                valorLiquidoTotal: customValues.valorLiquido || 0,
                hasCustomValues: true,
              });
            } else {
              setSpreadsheetMetrics({
                totalVendas: metrics.totalVendas || 0,
                valorBrutoTotal: metrics.valorBrutoTotal || 0,
                taxaMedia: metrics.taxaMedia || 0,
                valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                hasCustomValues: false,
              });
            }
          }
        } else if (selectedDay && days.includes(selectedDay) && !userHasSelectedDay) {
          // Dia selecionado está na lista - manter e recarregar (mas usuário não interagiu ainda)
          const daySpreadsheet = await getSpreadsheetByDate(user.customerId, selectedDay, terminalIdForDays);
          setSpreadsheetDataDaily(daySpreadsheet || null);
          // Se estamos na aba diária e há planilha carregada, garantir que os cards apareçam
          if (activeTab === 'daily' && daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
            // Calcular métricas imediatamente para que os cards apareçam
            const metrics = await calculateSpreadsheetMetrics(daySpreadsheet);
            const customValues = await getCustomerCardValues(
              user.customerId,
              terminalIdForDays,
              undefined,
              selectedDay,
              'daily'
            );
            if (customValues) {
              setSpreadsheetMetrics({
                totalVendas: customValues.quantidadeVendas || 0,
                valorBrutoTotal: customValues.valorBruto || 0,
                taxaMedia: customValues.taxa || 0,
                valorLiquidoTotal: customValues.valorLiquido || 0,
                hasCustomValues: true,
              });
            } else {
              setSpreadsheetMetrics({
                totalVendas: metrics.totalVendas || 0,
                valorBrutoTotal: metrics.valorBrutoTotal || 0,
                taxaMedia: metrics.taxaMedia || 0,
                valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                hasCustomValues: false,
              });
            }
          }
        } else if (days.length > 0 && !selectedDay && !userHasSelectedDay) {
          // Se não há dia selecionado mas há dias disponíveis, usar o mais recente
          // MAS apenas se o usuário ainda não interagiu manualmente
          const mostRecentDay = days[0]; // Dias já vêm ordenados do mais recente
          setSelectedDay(mostRecentDay);
          const daySpreadsheet = await getSpreadsheetByDate(user.customerId, mostRecentDay, terminalIdForDays);
          setSpreadsheetDataDaily(daySpreadsheet || null);
          // Se estamos na aba diária e acabamos de selecionar um dia, garantir que os cards apareçam
          if (activeTab === 'daily' && daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
            // Calcular métricas imediatamente para que os cards apareçam
            const metrics = await calculateSpreadsheetMetrics(daySpreadsheet);
            const customValues = await getCustomerCardValues(
              user.customerId,
              terminalIdForDays,
              undefined,
              mostRecentDay,
              'daily'
            );
            if (customValues) {
              setSpreadsheetMetrics({
                totalVendas: customValues.quantidadeVendas || 0,
                valorBrutoTotal: customValues.valorBruto || 0,
                taxaMedia: customValues.taxa || 0,
                valorLiquidoTotal: customValues.valorLiquido || 0,
                hasCustomValues: true,
              });
            } else {
              setSpreadsheetMetrics({
                totalVendas: metrics.totalVendas || 0,
                valorBrutoTotal: metrics.valorBrutoTotal || 0,
                taxaMedia: metrics.taxaMedia || 0,
                valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                hasCustomValues: false,
              });
            }
          }
        } else if (!userHasSelectedDay) {
          // Limpar seleção se não há dias disponíveis
          // MAS apenas se o usuário ainda não interagiu manualmente
          setSelectedDay('');
          setSpreadsheetDataDaily(null);
        }
        // Se userHasSelectedDay é true, NÃO fazer NADA - preservar a seleção do usuário
        
        // NÃO atualizar valores dos cards aqui - isso será feito em um useEffect separado
        // que só executa quando há mudança explícita (troca de aba, seleção de mês/dia, etc.)
        // O useEffect que roda a cada 5 segundos apenas atualiza os dados das planilhas, não os valores dos cards
        // EXCETO quando uma planilha diária é adicionada pela primeira vez (acima)
        
        hashRef.current = currentHash;
        
        // Se tiver apenas uma conta e não estiver já na página do terminal, redirecionar
        if (terminals.length === 1 && !window.location.pathname.includes('/terminal/')) {
          navigate(`/terminal/${terminals[0].terminalId}`, { replace: true });
          return;
        }
      } catch (err) {
        console.error('Erro ao carregar dados do cliente:', err);
      }
    };
    
    // Carregar imediatamente
    loadCustomerData();
    
    // Atualizar automaticamente a cada 5 segundos (reduzido de 2 para melhor performance)
    const interval = setInterval(() => {
      if (isMounted) {
        loadCustomerData();
      }
    }, 5000);
    
    // Escutar evento de atualização da planilha para atualização imediata
    const handleSpreadsheetUpdate = (event: CustomEvent) => {
      const eventTerminalId = event.detail?.terminalId;
      const eventCustomerId = event.detail?.customerId;
      const eventType = event.detail?.type; // Tipo da planilha (daily ou monthly)
      const eventReferenceDate = event.detail?.referenceDate; // Data de referência para planilhas diárias
      
      // Atualizar se for do mesmo cliente E (mesmo terminal OU não especificou terminal OU está em "all")
      if (eventCustomerId === user?.customerId && isMounted) {
        if (!eventTerminalId || eventTerminalId === selectedTerminalId || selectedTerminalId === 'all') {
          // Se for planilha diária e temos a data de referência, selecionar esse dia ANTES de carregar dados
          if (eventType === 'daily' && eventReferenceDate) {
            // Mudar para aba diária se estiver na mensal
            if (activeTab === 'monthly') {
              setActiveTab('daily');
            }
            // Atualizar o dia primeiro, depois carregar dados após um pequeno delay para garantir que o estado foi atualizado
            // Marcar como interação do usuário (via evento de atualização)
            userSelectedDayRef.current = true;
            lastUserSelectedDayRef.current = eventReferenceDate;
            setSelectedDay(eventReferenceDate);
            setTimeout(() => {
              hashRef.current = '';
              loadCustomerData();
            }, 100);
          } else {
            // Para planilhas mensais ou quando não há data de referência, atualizar imediatamente
            hashRef.current = '';
            loadCustomerData();
          }
        }
      }
    };
    
    // Escutar evento de atualização dos valores dos cards
    const handleCardValuesUpdate = (event: CustomEvent) => {
      const eventTerminalId = event.detail?.terminalId;
      const eventCustomerId = event.detail?.customerId;
      
      // Atualizar se for do mesmo cliente E (mesmo terminal OU não especificou terminal OU está em "all")
      if (eventCustomerId === user?.customerId && isMounted) {
        if (!eventTerminalId || eventTerminalId === selectedTerminalId || selectedTerminalId === 'all') {
          // Forçar atualização imediata quando valores dos cards são alterados
          hashRef.current = '';
          loadCustomerData();
        }
      }
    };
    
    window.addEventListener('spreadsheetUpdated', handleSpreadsheetUpdate as EventListener);
    window.addEventListener('cardValuesUpdated', handleCardValuesUpdate as EventListener);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('spreadsheetUpdated', handleSpreadsheetUpdate as EventListener);
      window.removeEventListener('cardValuesUpdated', handleCardValuesUpdate as EventListener);
    };
  }, [isCustomer, user?.customerId, selectedTerminalId, selectedMonth, selectedDay]);

  // useEffect SEPARADO para atualizar valores dos cards apenas quando houver mudança explícita
  // (troca de aba, seleção de mês/dia, etc.) - NÃO executa a cada 5 segundos
  useEffect(() => {
    if (!isCustomer() || !user?.customerId) {
      return;
    }

    const updateCardValues = async () => {
      // Garantir que temos customerId (TypeScript não infere isso mesmo com o check acima)
      if (!user?.customerId) return;
      const customerId = user.customerId;
      
      // Garantir que terminalIdForValues e terminalIdForDays sejam string ou undefined
      const terminalIdForValues: string | undefined = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
      const terminalIdForDays: string | undefined = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
      
      // Determinar qual planilha usar baseado na aba ativa
      let activeSpreadsheet: SpreadsheetData | null = null;
      
      if (activeTab === 'monthly') {
        // Para mensal, APENAS usar planilhas mensais
        if (selectedMonth) {
          const month = selectedMonth; // Criar variável local para ajudar TypeScript
          let monthSpreadsheet: SpreadsheetData | null = null;
          if (selectedTerminalId === 'all') {
            monthSpreadsheet = await getSpreadsheetByCustomerId(customerId, month, 'monthly');
          } else {
            // TypeScript: selectedTerminalId é string aqui (não é 'all')
            monthSpreadsheet = await getSpreadsheetByTerminalId(selectedTerminalId as string, user.customerId, month, 'monthly');
          }
          if (monthSpreadsheet && (monthSpreadsheet.type || 'monthly') === 'monthly') {
            activeSpreadsheet = monthSpreadsheet;
          } else if (spreadsheetData && (spreadsheetData.type || 'monthly') === 'monthly') {
            activeSpreadsheet = spreadsheetData;
          }
        } else {
          if (spreadsheetData && (spreadsheetData.type || 'monthly') === 'monthly') {
            activeSpreadsheet = spreadsheetData;
          }
        }
      } else if (activeTab === 'daily') {
        // Para diária, APENAS usar planilhas diárias
        if (selectedDay) {
          const day = selectedDay; // Criar variável local para ajudar TypeScript
          const daySpreadsheet = await getSpreadsheetByDate(user.customerId, day, terminalIdForDays);
          if (daySpreadsheet && daySpreadsheet.type === 'daily') {
            activeSpreadsheet = daySpreadsheet;
          } else if (spreadsheetDataDaily && spreadsheetDataDaily.type === 'daily') {
            activeSpreadsheet = spreadsheetDataDaily;
          }
        } else {
          if (spreadsheetDataDaily && spreadsheetDataDaily.type === 'daily') {
            activeSpreadsheet = spreadsheetDataDaily;
          }
        }
      }
      
      // Atualizar valores apenas se houver planilha válida do tipo correto
      if (activeSpreadsheet && activeSpreadsheet.data && activeSpreadsheet.data.length > 0) {
        const isDailyType = activeTab === 'daily';
        const spreadsheetIsDaily = activeSpreadsheet.type === 'daily';
        
        if (isDailyType === spreadsheetIsDaily) {
          const customValues = await getCustomerCardValues(
            customerId, 
            terminalIdForValues,
            spreadsheetIsDaily ? undefined : activeSpreadsheet.referenceMonth,
            spreadsheetIsDaily ? activeSpreadsheet.referenceDate : undefined,
            activeSpreadsheet.type || (activeTab === 'daily' ? 'daily' : 'monthly')
          );
        
          if (customValues) {
            setSpreadsheetMetrics({
              totalVendas: customValues.quantidadeVendas || 0,
              valorBrutoTotal: customValues.valorBruto || 0,
              taxaMedia: customValues.taxa || 0,
              valorLiquidoTotal: customValues.valorLiquido || 0,
              hasCustomValues: true,
            });
          } else {
            const metrics = await calculateSpreadsheetMetrics(activeSpreadsheet);
            setSpreadsheetMetrics({
              totalVendas: metrics.totalVendas || 0,
              valorBrutoTotal: metrics.valorBrutoTotal || 0,
              taxaMedia: metrics.taxaMedia || 0,
              valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
              hasCustomValues: false,
            });
          }
        }
      } else if (activeTab === 'monthly' && (!spreadsheetData || !spreadsheetData.data || spreadsheetData.data.length === 0)) {
        setSpreadsheetMetrics(null);
      } else if (activeTab === 'daily') {
        // Para planilhas diárias, se não houver planilha carregada mas houver dias disponíveis,
        // tentar carregar a planilha do dia mais recente automaticamente
        // MAS apenas se o usuário ainda não interagiu manualmente
        if (!spreadsheetDataDaily || !spreadsheetDataDaily.data || spreadsheetDataDaily.data.length === 0) {
          if (availableDays.length > 0 && !selectedDay && !userSelectedDayRef.current) {
            // Se há dias disponíveis mas nenhum dia selecionado, selecionar o mais recente
            // MAS apenas se o usuário ainda não interagiu manualmente
            const mostRecentDay = availableDays[0];
            setSelectedDay(mostRecentDay);
            // Não definir metrics como null aqui, pois o useEffect será executado novamente
            // quando selectedDay mudar e a planilha for carregada
            return;
          }
          setSpreadsheetMetrics(null);
        }
      }
    };

    updateCardValues();
  }, [isCustomer, user?.customerId, selectedTerminalId, selectedMonth, selectedDay, activeTab, spreadsheetData, spreadsheetDataDaily, availableDays]);

  const handleFilterChange = useCallback((newFilters: FilterOptions) => {
    setFilters(prevFilters => {
      // Comparação profunda para evitar atualizações desnecessárias
      const prevStr = JSON.stringify(prevFilters);
      const newStr = JSON.stringify(newFilters);
      if (prevStr === newStr) {
        return prevFilters;
      }
      return newFilters;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    
    const loadData = async () => {
      // Não carregar dados de vendas se for cliente (eles veem apenas a planilha)
      if (isCustomer()) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      try {
        // Se for cliente, filtrar apenas vendas de suas contas
        let effectiveFilters = { ...filters };
        
        if (isCustomer() && customerTerminals.length > 0) {
          // Filtrar vendas por todas as contas do cliente
          // Como não temos filtro múltiplo, vamos filtrar depois
          effectiveFilters = filters;
        }
        
        const salesData = await getSales(effectiveFilters);

        // Se for cliente, filtrar vendas apenas das suas contas
        let filteredSales = salesData;
        if (isCustomer() && customerTerminals.length > 0) {
          const terminalIds = customerTerminals.map(t => t.terminalId);
          
          // Se uma conta específica foi selecionada, filtrar por ela
          if (selectedTerminalId !== 'all') {
            filteredSales = salesData.filter(sale => 
              sale.customerId === user?.customerId && 
              sale.cieloTerminalId === selectedTerminalId
            );
          } else {
            // Se "todas" foi selecionado, mostrar todas as contas do cliente
            filteredSales = salesData.filter(sale => 
              sale.customerId === user?.customerId || 
              (sale.cieloTerminalId && terminalIds.includes(sale.cieloTerminalId))
            );
          }
          
          if (!cancelled) {
            setRecentSales(filteredSales.slice(0, 10));
          }
          return;
        }

        if (!cancelled) {
          setRecentSales((salesData || []).slice(0, 10));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Erro ao carregar dados do dashboard:', err);
          setError('Erro ao carregar dados. Tente novamente.');
          setRecentSales([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    // Só carregar dados de vendas se não for cliente
    if (!isCustomer()) {
      loadData();
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [filters, isCustomer, customerTerminals, user, selectedTerminalId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-black mb-1 md:mb-2">
          {isCustomer() ? 'Meu Dashboard' : 'Dashboard de Vendas'}
        </h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">
          {isCustomer() 
            ? 'Visão geral das suas vendas e métricas' 
            : 'Visão geral das vendas e métricas da BR FINTECH'}
        </p>
        {isCustomer() && customerTerminals.length > 0 && (
          <div className="mt-4 bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-black mb-2">
                  Selecionar Conta
                </label>
                <select
                  value={selectedTerminalId}
                  onChange={(e) => setSelectedTerminalId(e.target.value)}
                  className="w-full md:w-auto px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors bg-white"
                >
                  <option value="all">Todas as Contas</option>
                  {customerTerminals.map((term) => (
                    <option key={term.id} value={term.terminalId}>
                      {term.name || term.terminalId}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Escolha qual conta deseja visualizar ou selecione "Todas" para ver dados agregados.
                </p>
              </div>
              {/* Botões de upload apenas para administradores */}
              {isAdmin() && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedTerminalForUpload(null);
                      setShowSpreadsheetModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold text-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    {spreadsheetData ? 'Gerenciar Planilha' : 'Enviar Planilha'}
                  </button>
                  {customerTerminals.length > 1 && (
                    <button
                      onClick={() => {
                        const terminal = customerTerminals.find(t => t.terminalId === selectedTerminalId && selectedTerminalId !== 'all');
                        if (terminal) {
                          setSelectedTerminalForUpload(terminal.terminalId);
                          setShowSpreadsheetModal(true);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold text-sm"
                      disabled={selectedTerminalId === 'all'}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Planilha da Conta
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="mt-4 bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {!isCustomer() && (
        <FilterBar
          onFilterChange={handleFilterChange}
        />
      )}


      {/* KPI Cards da Planilha - Apenas para Clientes */}
      {/* Ordem: Quantidade de Vendas, Valor Bruto, Taxa, Valor Líquido */}
      {/* Mostrar cards quando houver planilha selecionada (mensal ou diária) e métricas calculadas */}
      {isCustomer() && spreadsheetMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
          <KPICard
            title="Quantidade de Vendas"
            value={spreadsheetMetrics.totalVendas ?? 0}
            icon={ShoppingCart}
            format="number"
          />
          <KPICard
            title="Valor Bruto"
            value={spreadsheetMetrics.valorBrutoTotal ?? 0}
            icon={DollarSign}
            format="currency"
          />
          <KPICard
            title="Taxa"
            value={spreadsheetMetrics.taxaMedia ?? 0}
            icon={Percent}
            format={spreadsheetMetrics.hasCustomValues ? "currency" : "percentage"}
          />
          <KPICard
            title="Valor Líquido"
            value={spreadsheetMetrics.valorLiquidoTotal ?? 0}
            icon={DollarSign}
            format="currency"
          />
        </div>
      )}

      {/* Seção de Planilhas - Apenas para Clientes */}
      {isCustomer() && (spreadsheetData || spreadsheetDataDaily) && (
        <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
          {/* Tabs para Mensal e Diária */}
          <div className="border-b-2 border-black">
            <div className="flex">
              <button
                onClick={async () => {
                  setActiveTab('monthly');
                  // Resetar ref para forçar atualização ao trocar de aba
                  lastMetricsUpdateRef.current = { tab: 'monthly', spreadsheetId: null };
                  // Atualizar métricas quando mudar para aba mensal
                  if (user?.customerId) {
                    const terminalIdForValues = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
                    // Buscar a planilha mensal correta baseada no mês selecionado
                    let monthSpreadsheet: SpreadsheetData | null = null;
                    if (selectedMonth) {
                      monthSpreadsheet = selectedTerminalId === 'all'
                        ? await getSpreadsheetByCustomerId(user.customerId, selectedMonth, 'monthly')
                        : await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, selectedMonth, 'monthly');
                    } else if (spreadsheetData) {
                      monthSpreadsheet = spreadsheetData;
                    }
                    
                    if (monthSpreadsheet && monthSpreadsheet.data && monthSpreadsheet.data.length > 0) {
                      const customValues = await getCustomerCardValues(
                        user.customerId, 
                        terminalIdForValues,
                        monthSpreadsheet.referenceMonth,
                        undefined, // Não usar referenceDate para mensais
                        'monthly'
                      );
                      if (customValues) {
                        setSpreadsheetMetrics({
                          totalVendas: customValues.quantidadeVendas || 0,
                          valorBrutoTotal: customValues.valorBruto || 0,
                          taxaMedia: customValues.taxa || 0,
                          valorLiquidoTotal: customValues.valorLiquido || 0,
                          hasCustomValues: true,
                        });
                      } else {
                        const metrics = await calculateSpreadsheetMetrics(monthSpreadsheet);
                        setSpreadsheetMetrics({
                          totalVendas: metrics.totalVendas || 0,
                          valorBrutoTotal: metrics.valorBrutoTotal || 0,
                          taxaMedia: metrics.taxaMedia || 0,
                          valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                          hasCustomValues: false,
                        });
                      }
                    } else {
                      setSpreadsheetMetrics(null);
                    }
                  }
                }}
                className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                  activeTab === 'monthly'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                📊 Planilha Mensal
              </button>
              <button
                onClick={async () => {
                  setActiveTab('daily');
                  // Resetar ref para forçar atualização ao trocar de aba
                  lastMetricsUpdateRef.current = { tab: 'daily', spreadsheetId: null };
                  // Atualizar métricas quando mudar para aba diária
                  if (user?.customerId) {
                    const terminalIdForValues = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
                    // Buscar a planilha diária correta baseada no dia selecionado
                    let daySpreadsheet: SpreadsheetData | null = null;
                    if (selectedDay) {
                      daySpreadsheet = await getSpreadsheetByDate(user.customerId, selectedDay, terminalIdForValues);
                    } else if (spreadsheetDataDaily) {
                      daySpreadsheet = spreadsheetDataDaily;
                    }
                    
                    if (daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
                      // Para planilhas diárias, usar apenas referenceDate, não referenceMonth
                      const customValues = await getCustomerCardValues(
                        user.customerId, 
                        terminalIdForValues,
                        undefined, // Não usar referenceMonth para planilhas diárias
                        daySpreadsheet.referenceDate,
                        'daily' // Forçar tipo daily
                      );
                      if (customValues) {
                        setSpreadsheetMetrics({
                          totalVendas: customValues.quantidadeVendas || 0,
                          valorBrutoTotal: customValues.valorBruto || 0,
                          taxaMedia: customValues.taxa || 0,
                          valorLiquidoTotal: customValues.valorLiquido || 0,
                          hasCustomValues: true,
                        });
                      } else {
                        const metrics = await calculateSpreadsheetMetrics(daySpreadsheet);
                        setSpreadsheetMetrics({
                          totalVendas: metrics.totalVendas || 0,
                          valorBrutoTotal: metrics.valorBrutoTotal || 0,
                          taxaMedia: metrics.taxaMedia || 0,
                          valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                          hasCustomValues: false,
                        });
                      }
                    } else {
                      setSpreadsheetMetrics(null);
                    }
                  }
                }}
                className={`flex-1 py-3 px-4 font-semibold transition-colors ${
                  activeTab === 'daily'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                📅 Planilha Diária
              </button>
            </div>
          </div>

          {/* Conteúdo da Aba Mensal */}
          {activeTab === 'monthly' && spreadsheetData && spreadsheetData.data && spreadsheetData.data.length > 0 && (
            <>
              <div className="p-4 md:p-6 border-b-2 border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 md:w-6 md:h-6 text-black" />
              <div>
                      <h3 className="text-base md:text-lg font-bold text-black">Planilha Mensal</h3>
                <p className="text-xs md:text-sm text-gray-600">
                  {spreadsheetData.fileName} • {new Date(spreadsheetData.uploadedAt).toLocaleDateString('pt-BR')}
                        {spreadsheetData.referenceMonth && (
                          <span className="ml-2 font-semibold text-blue-700">
                            ({spreadsheetData.referenceMonth.split('-').reverse().join('/')})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {spreadsheetData.data.length} linhas • {spreadsheetData.headers.length} colunas
                </p>
              </div>
            </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        const wb = XLSX.utils.book_new();
                        const wsData = [spreadsheetData.headers, ...spreadsheetData.data.map((row: any) => spreadsheetData.headers.map(header => row[header] || ''))];
                        const ws = XLSX.utils.aoa_to_sheet(wsData);
                        XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
                        XLSX.writeFile(wb, spreadsheetData.fileName || `planilha_mensal_${spreadsheetData.referenceMonth || 'atual'}.xlsx`);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Baixar
                    </button>
                    {/* Campo de filtro por mês */}
                    {availableMonths.length > 0 && (
                      <select
                        value={selectedMonth}
                        onChange={async (e) => {
                          const monthValue = e.target.value;
                          // Marcar que o usuário interagiu manualmente
                          userSelectedMonthRef.current = true;
                          lastUserSelectedMonthRef.current = monthValue;
                          setSelectedMonth(monthValue);
                          if (monthValue && user?.customerId) {
                            const monthSpreadsheet = selectedTerminalId === 'all'
                              ? await getSpreadsheetByCustomerId(user.customerId, monthValue, 'monthly')
                              : await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId, monthValue, 'monthly');
                            setSpreadsheetData(monthSpreadsheet);
                            
                            // Calcular métricas da planilha selecionada
                            if (monthSpreadsheet && monthSpreadsheet.data && monthSpreadsheet.data.length > 0) {
                              const terminalIdForValues = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
                              const customValues = await getCustomerCardValues(
                                user.customerId, 
                                terminalIdForValues,
                                monthSpreadsheet.referenceMonth,
                                monthSpreadsheet.referenceDate,
                                monthSpreadsheet.type || 'monthly'
                              );
                              
                              if (customValues) {
                                setSpreadsheetMetrics({
                                  totalVendas: customValues.quantidadeVendas || 0,
                                  valorBrutoTotal: customValues.valorBruto || 0,
                                  taxaMedia: customValues.taxa || 0,
                                  valorLiquidoTotal: customValues.valorLiquido || 0,
                                  hasCustomValues: true,
                                });
                              } else {
                                const metrics = await calculateSpreadsheetMetrics(monthSpreadsheet);
                                setSpreadsheetMetrics({
                                  totalVendas: metrics.totalVendas || 0,
                                  valorBrutoTotal: metrics.valorBrutoTotal || 0,
                                  taxaMedia: metrics.taxaMedia || 0,
                                  valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                                  hasCustomValues: false,
                                });
                              }
                            } else {
                              setSpreadsheetMetrics(null);
                            }
                          } else {
                            setSpreadsheetData(null);
                            setSpreadsheetMetrics(null);
                          }
                        }}
                        className="px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white font-semibold text-sm"
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
                  </div>
                </div>
          </div>
              <div className="p-4 md:p-6">
          <div className="overflow-x-auto border-2 border-gray-200 rounded-lg">
            <table className="w-full min-w-full">
              <thead>
                <tr className="bg-black text-white">
                  {spreadsheetData.headers.map((header, index) => (
                          <th key={index} className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spreadsheetData.data.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}>
                          {spreadsheetData.headers.map((header, colIndex) => (
                            <td key={colIndex} className="py-3 px-4 text-sm text-gray-700 border-b border-gray-200">
                              {row[header] !== null && row[header] !== undefined ? String(row[header]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Conteúdo da Aba Diária */}
          {activeTab === 'daily' && spreadsheetDataDaily && spreadsheetDataDaily.data && spreadsheetDataDaily.data.length > 0 && (
            <>
              <div className="p-4 md:p-6 border-b-2 border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 md:w-6 md:h-6 text-black" />
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-black">Planilha Diária</h3>
                      <p className="text-xs md:text-sm text-gray-600">
                        {spreadsheetDataDaily.fileName} • {new Date(spreadsheetDataDaily.uploadedAt).toLocaleDateString('pt-BR')}
                        {spreadsheetDataDaily.referenceDate && (
                          <span className="ml-2 font-semibold text-green-700">
                            (📅 {new Date(spreadsheetDataDaily.referenceDate).toLocaleDateString('pt-BR')})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {spreadsheetDataDaily.data.length} linhas • {spreadsheetDataDaily.headers.length} colunas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        if (!spreadsheetDataDaily) return;
                        
                        // Se temos o arquivo original, usar ele para preservar formatação exata
                        if (spreadsheetDataDaily.originalFile) {
                          try {
                            const base64Data = spreadsheetDataDaily.originalFile;
                            const byteCharacters = atob(base64Data);
                            const byteNumbers = new Array(byteCharacters.length);
                            for (let i = 0; i < byteCharacters.length; i++) {
                              byteNumbers[i] = byteCharacters.charCodeAt(i);
                            }
                            const byteArray = new Uint8Array(byteNumbers);
                            const blob = new Blob([byteArray], { 
                              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                            });
                            
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = spreadsheetDataDaily.fileName || `planilha_diaria_${spreadsheetDataDaily.referenceDate || 'atual'}.xlsx`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                            return;
                          } catch (error) {
                            console.error('Erro ao fazer download do arquivo original:', error);
                          }
                        }
                        
                        // Fallback: reconstruir planilha
                        const wb = XLSX.utils.book_new();
                        const wsData = [spreadsheetDataDaily.headers, ...spreadsheetDataDaily.data.map((row: any) => spreadsheetDataDaily.headers.map(header => row[header] || ''))];
                        const ws = XLSX.utils.aoa_to_sheet(wsData);
                        XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
                        XLSX.writeFile(wb, spreadsheetDataDaily.fileName || `planilha_diaria_${spreadsheetDataDaily.referenceDate || 'atual'}.xlsx`);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Baixar
                    </button>
                    {/* Campo de filtro por dia */}
                    {availableDays.length > 0 && (
                      <select
                        value={selectedDay}
                        onChange={async (e) => {
                          const dayValue = e.target.value;
                          // Marcar que o usuário interagiu manualmente
                          userSelectedDayRef.current = true;
                          lastUserSelectedDayRef.current = dayValue;
                          setSelectedDay(dayValue);
                          if (dayValue && user?.customerId) {
                            const terminalIdForDays = selectedTerminalId === 'all' ? undefined : selectedTerminalId;
                            const daySpreadsheet = await getSpreadsheetByDate(user.customerId, dayValue, terminalIdForDays);
                            setSpreadsheetDataDaily(daySpreadsheet);
                            
                            // Calcular métricas da planilha diária selecionada
                            if (daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
                              // Para planilhas diárias, usar apenas referenceDate, não referenceMonth
                              const customValues = await getCustomerCardValues(
                                user.customerId, 
                                terminalIdForDays,
                                undefined, // Não usar referenceMonth para planilhas diárias
                                daySpreadsheet.referenceDate,
                                'daily' // Forçar tipo daily
                              );
                              
                              if (customValues) {
                                setSpreadsheetMetrics({
                                  totalVendas: customValues.quantidadeVendas || 0,
                                  valorBrutoTotal: customValues.valorBruto || 0,
                                  taxaMedia: customValues.taxa || 0,
                                  valorLiquidoTotal: customValues.valorLiquido || 0,
                                  hasCustomValues: true,
                                });
                              } else {
                                const metrics = await calculateSpreadsheetMetrics(daySpreadsheet);
                                setSpreadsheetMetrics({
                                  totalVendas: metrics.totalVendas || 0,
                                  valorBrutoTotal: metrics.valorBrutoTotal || 0,
                                  taxaMedia: metrics.taxaMedia || 0,
                                  valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                                  hasCustomValues: false,
                                });
                              }
                            } else {
                              setSpreadsheetMetrics(null);
                            }
                          } else {
                            setSpreadsheetDataDaily(null);
                            setSpreadsheetMetrics(null);
                          }
                        }}
                        className="px-4 py-2 border-2 border-green-300 rounded-lg focus:outline-none focus:border-green-500 transition-colors bg-white font-semibold text-sm"
                        title="Selecione o dia para visualizar a planilha diária"
                      >
                        <option value="">Selecione o dia</option>
                        {availableDays.map(day => {
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
                  </div>
                </div>
              </div>
              <div className="p-4 md:p-6">
                <div className="overflow-x-auto border-2 border-gray-200 rounded-lg">
                  <table className="w-full min-w-full">
                    <thead>
                      <tr className="bg-black text-white">
                        {spreadsheetDataDaily.headers.map((header, index) => (
                          <th key={index} className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spreadsheetDataDaily.data.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}>
                          {spreadsheetDataDaily.headers.map((header, colIndex) => (
                            <td key={colIndex} className="py-3 px-4 text-sm text-gray-700 border-b border-gray-200">
                              {row[header] !== null && row[header] !== undefined ? String(row[header]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
              </div>
            </>
          )}

          {/* Mensagem quando não há planilha na aba selecionada */}
          {activeTab === 'monthly' && (!spreadsheetData || !spreadsheetData.data || spreadsheetData.data.length === 0) && (
            <div className="p-8 text-center">
              <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Nenhuma planilha mensal disponível</p>
              <p className="text-gray-500 text-sm mt-2">Aguardando administrador enviar planilha mensal</p>
            </div>
          )}

          {activeTab === 'daily' && (!spreadsheetDataDaily || !spreadsheetDataDaily.data || spreadsheetDataDaily.data.length === 0) && (
            <div className="p-8 text-center">
              <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Nenhuma planilha diária disponível</p>
              <p className="text-gray-500 text-sm mt-2">Aguardando administrador enviar planilha diária</p>
            </div>
          )}
        </div>
      )}

      {/* Tabela de Vendas Recentes - Apenas para Administradores */}
      {isAdmin() && (
      <div className="bg-white border-2 border-black rounded-lg p-3 md:p-4 lg:p-6 overflow-x-auto">
        <h3 className="text-sm md:text-base lg:text-lg font-semibold text-black mb-2 md:mb-3 lg:mb-4">Vendas Recentes</h3>
        {recentSales.length === 0 ? (
          <div className="text-center py-8 md:py-12">
            <ShoppingCart className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-base md:text-lg font-medium mb-2">Nenhuma venda registrada</p>
            <p className="text-gray-500 text-xs md:text-sm px-4">O dashboard está pronto para uso. As vendas aparecerão aqui quando forem cadastradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">Data</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">Cliente</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">Produto</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap hidden md:table-cell">Região</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">Valor</th>
                    <th className="text-left py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-gray-700 whitespace-nowrap">
                        {new Date(sale.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-gray-700 truncate max-w-[120px] md:max-w-none">
                        {sale.customerName}
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-gray-700 truncate max-w-[100px] md:max-w-none">
                        {sale.product}
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm text-gray-700 whitespace-nowrap hidden md:table-cell">
                        {sale.region}
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-4 text-xs md:text-sm font-semibold text-black whitespace-nowrap">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.amount)}
                      </td>
                      <td className="py-2 md:py-3 px-2 md:px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            sale.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : sale.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {sale.status === 'completed' ? 'Concluída' : sale.status === 'pending' ? 'Pendente' : 'Cancelada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Modal de Planilha - Para Clientes e Administradores */}
      {showSpreadsheetModal && user?.customerId && (
        <CustomerSpreadsheet
          customerId={user.customerId}
          customerName={user.name || 'Cliente'}
          terminalId={selectedTerminalForUpload || undefined}
          terminalName={selectedTerminalForUpload 
            ? customerTerminals.find(t => t.terminalId === selectedTerminalForUpload)?.name || selectedTerminalForUpload
            : undefined}
          onClose={async () => {
            setShowSpreadsheetModal(false);
            setSelectedTerminalForUpload(null);
            // Recarregar dados após fechar o modal
            if (isCustomer() && user?.customerId) {
              let spreadsheet: SpreadsheetData | null = null;
              
              if (selectedTerminalId === 'all') {
                const allSpreadsheets = await getSpreadsheetsByCustomerId(user.customerId);
                if (allSpreadsheets.length > 0) {
                  const generalSpreadsheet = allSpreadsheets.find(s => !s.terminalId);
                  if (generalSpreadsheet) {
                    spreadsheet = generalSpreadsheet;
                  } else {
                    spreadsheet = allSpreadsheets[0];
                  }
                }
              } else {
                spreadsheet = await getSpreadsheetByTerminalId(selectedTerminalId, user.customerId);
                if (!spreadsheet) {
                  spreadsheet = await getSpreadsheetByCustomerId(user.customerId);
                }
              }
              
              setSpreadsheetData(spreadsheet);
              
              // Buscar valores customizados específicos da planilha selecionada
              if (spreadsheet && spreadsheet.data && spreadsheet.data.length > 0) {
                const terminalIdForValues = selectedTerminalId !== 'all' ? selectedTerminalId : undefined;
                const customValues = await getCustomerCardValues(
                  user.customerId, 
                  terminalIdForValues,
                  spreadsheet.referenceMonth,
                  spreadsheet.referenceDate,
                  spreadsheet.type || 'monthly'
                );
              
                if (customValues) {
                  // Usar valores customizados
                setSpreadsheetMetrics({
                  totalVendas: customValues.quantidadeVendas || 0,
                  valorBrutoTotal: customValues.valorBruto || 0,
                  taxaMedia: customValues.taxa || 0,
                  valorLiquidoTotal: customValues.valorLiquido || 0,
                  hasCustomValues: true,
                });
              } else {
                  // Se não houver valores customizados, calcular da planilha
                  const metrics = await calculateSpreadsheetMetrics(spreadsheet);
                  setSpreadsheetMetrics({
                    totalVendas: metrics.totalVendas || 0,
                    valorBrutoTotal: metrics.valorBrutoTotal || 0,
                    taxaMedia: metrics.taxaMedia || 0,
                    valorLiquidoTotal: metrics.valorLiquidoTotal || 0,
                    hasCustomValues: false,
                  });
                }
              } else {
                // Se não houver planilha, não mostrar métricas
                setSpreadsheetMetrics(null);
              }
            }
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;

