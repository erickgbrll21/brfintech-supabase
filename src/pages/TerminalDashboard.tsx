import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  DollarSign, 
  ShoppingCart, 
  CreditCard,
  ArrowLeft,
  FileSpreadsheet,
  Percent,
  Download
} from 'lucide-react';
import KPICard from '../components/KPICard';
import FilterBar from '../components/FilterBar';
import { useAuth } from '../context/AuthContext';
import { getSales } from '../services/salesService';
import { getCustomerByTerminalId, getAllTerminals, getCustomerById } from '../services/customerService';
import { getSpreadsheetByCustomerId, getSpreadsheetByTerminalId, SpreadsheetData, getAvailableDays, getSpreadsheetByDate, getAvailableMonths, calculateSpreadsheetMetrics } from '../services/spreadsheetService';
import CustomerSpreadsheet from '../components/CustomerSpreadsheet';
import { getCustomerTax } from '../services/customerTaxService';
import { getCustomerCardValues } from '../services/customerCardValuesService';
import { FilterOptions, Sale, CieloTerminal } from '../types';

const TerminalDashboard = () => {
  const { terminalId } = useParams<{ terminalId: string }>();
  const navigate = useNavigate();
  const { user, isCustomer, isAdmin } = useAuth();
  const [terminal, setTerminal] = useState<CieloTerminal | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({ terminalId });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerTerminals, setCustomerTerminals] = useState<Array<{ id: string; terminalId: string; name?: string }>>([]);
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [spreadsheetMetrics, setSpreadsheetMetrics] = useState<any>(null);
  const [showSpreadsheetModal, setShowSpreadsheetModal] = useState(false);
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

  // Refs para rastrear se o usuário já interagiu manualmente com as seleções
  const userSelectedMonthRef = useRef<boolean>(false);
  const userSelectedDayRef = useRef<boolean>(false);
  const lastUserSelectedMonthRef = useRef<string>('');
  const lastUserSelectedDayRef = useRef<string>('');


  // Carregar informações da conta
  // Atualizar automaticamente quando a planilha for reimportada
  useEffect(() => {
    const loadTerminalInfo = async () => {
      if (!terminalId) {
        setError('ID da conta não fornecido');
        setIsLoading(false);
        return;
      }

      try {
        // Se for cliente, verificar se a conta pertence a ele e carregar todas as contas
        if (isCustomer() && user?.customerId) {
          const customer = await getCustomerById(user.customerId);
          if (customer) {
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
            
            setCustomerTerminals(terminals);
            
            // Carregar meses disponíveis para planilhas mensais
            const months = await getAvailableMonths(user.customerId, terminalId, 'monthly');
            setAvailableMonths(months);
            
            // Carregar planilha mensal da conta específica (prioridade) ou do cliente
            let spreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, undefined, 'monthly');
            if (!spreadsheet) {
              spreadsheet = await getSpreadsheetByCustomerId(user.customerId, undefined, 'monthly');
            }
            
            // PRIORIDADE ABSOLUTA: Se o usuário já selecionou manualmente, SEMPRE preservar
            // Esta verificação deve vir ANTES de qualquer outra lógica
            if (userSelectedMonthRef.current && lastUserSelectedMonthRef.current) {
              // Usuário já selecionou manualmente - SEMPRE preservar essa seleção
              const preservedMonth = lastUserSelectedMonthRef.current;
              // Garantir que a seleção está correta
              if (selectedMonth !== preservedMonth) {
                setSelectedMonth(preservedMonth);
              }
              
              // Tentar carregar a planilha para o mês preservado
              const monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, preservedMonth, 'monthly');
              if (monthSpreadsheet) {
                setSpreadsheetData(monthSpreadsheet);
              } else {
                setSpreadsheetData(spreadsheet);
              }
            } else if (selectedMonth && months.includes(selectedMonth) && !userSelectedMonthRef.current) {
              // Mês selecionado está na lista - manter e recarregar (mas usuário não interagiu ainda)
              const monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, selectedMonth, 'monthly');
              if (monthSpreadsheet) {
                setSpreadsheetData(monthSpreadsheet);
              } else {
                setSpreadsheetData(spreadsheet);
              }
            } else if (months.length > 0 && !selectedMonth && !userSelectedMonthRef.current) {
              // Se não há mês selecionado mas há meses disponíveis, usar o mais recente
              // MAS apenas se o usuário ainda não interagiu manualmente
              setSelectedMonth(months[0]);
              const monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, months[0], 'monthly');
              if (monthSpreadsheet) {
                setSpreadsheetData(monthSpreadsheet);
              } else {
                setSpreadsheetData(spreadsheet);
              }
            } else if (spreadsheet && !userSelectedMonthRef.current && !selectedMonth) {
              // Se não há meses disponíveis mas há planilha, usar a planilha atual
              // MAS apenas se o usuário ainda não interagiu manualmente E não há mês selecionado
              setSpreadsheetData(spreadsheet);
              if (spreadsheet.referenceMonth && !userSelectedMonthRef.current) {
                setSelectedMonth(spreadsheet.referenceMonth);
              }
            } else if (!userSelectedMonthRef.current) {
              // Limpar seleção se não há meses disponíveis
              // MAS apenas se o usuário ainda não interagiu manualmente
              setSelectedMonth('');
            }
            
            // Carregar planilha diária da conta específica (prioridade) ou do cliente
            let spreadsheetDaily = await getSpreadsheetByTerminalId(terminalId, user.customerId, undefined, 'daily');
            if (!spreadsheetDaily) {
              spreadsheetDaily = await getSpreadsheetByCustomerId(user.customerId, undefined, 'daily');
            }
            setSpreadsheetDataDaily(spreadsheetDaily);
            
            // Carregar dias disponíveis para planilhas diárias
            const days = await getAvailableDays(user.customerId, terminalId);
            setAvailableDays(days);
            
            // PRIORIDADE ABSOLUTA: Se o usuário já selecionou manualmente, SEMPRE preservar
            // Esta verificação deve vir ANTES de qualquer outra lógica
            if (userSelectedDayRef.current && lastUserSelectedDayRef.current) {
              // Usuário já selecionou manualmente - SEMPRE preservar essa seleção
              const preservedDay = lastUserSelectedDayRef.current;
              // Garantir que a seleção está correta
              if (selectedDay !== preservedDay) {
                setSelectedDay(preservedDay);
              }
              
              // Tentar carregar a planilha para o dia preservado
              const daySpreadsheet = await getSpreadsheetByDate(user.customerId, preservedDay, terminalId);
              if (daySpreadsheet) {
                setSpreadsheetDataDaily(daySpreadsheet);
              }
            } else if (selectedDay && days.includes(selectedDay) && !userSelectedDayRef.current) {
              // Dia selecionado está na lista - manter e recarregar (mas usuário não interagiu ainda)
              const daySpreadsheet = await getSpreadsheetByDate(user.customerId, selectedDay, terminalId);
              if (daySpreadsheet) {
                setSpreadsheetDataDaily(daySpreadsheet);
              }
            } else if (days.length > 0 && !selectedDay && !userSelectedDayRef.current) {
              // Se não há dia selecionado mas há dias disponíveis, usar o mais recente
              // MAS apenas se o usuário ainda não interagiu manualmente
              setSelectedDay(days[0]);
              const daySpreadsheet = await getSpreadsheetByDate(user.customerId, days[0], terminalId);
              if (daySpreadsheet) {
                setSpreadsheetDataDaily(daySpreadsheet);
              }
            } else if (!userSelectedDayRef.current) {
              // Limpar seleção se não há dias disponíveis
              // MAS apenas se o usuário ainda não interagiu manualmente
              setSelectedDay('');
            }
            
            // NÃO atualizar valores dos cards aqui - isso será feito em um useEffect separado
            // que só executa quando há mudança explícita (troca de aba, seleção de mês/dia, etc.)
            
            const terminalIds = terminals.map(t => t.terminalId);
            if (!terminalIds.includes(terminalId)) {
              setError('Você não tem permissão para acessar esta conta');
              setIsLoading(false);
              return;
            }
          }
        }
        
        // Buscar cliente associado primeiro (mais direto)
        const customer = await getCustomerByTerminalId(terminalId);
        
        if (customer) {
          setCustomerName(customer.name);
          
          // Buscar a conta específica
          if (customer.cieloTerminals && customer.cieloTerminals.length > 0) {
            const foundTerminal = customer.cieloTerminals.find(t => t.terminalId === terminalId);
            if (foundTerminal) {
              setTerminal(foundTerminal);
            } else {
              // Criar terminal temporário se não encontrado
              setTerminal({
                id: `temp_${terminalId}`,
                terminalId,
                name: `Conta ${customer.name}`,
                createdAt: new Date().toISOString(),
              });
            }
          } else if (customer.cieloTerminalId === terminalId) {
            // Compatibilidade com formato antigo
            setTerminal({
              id: `temp_${terminalId}`,
              terminalId,
              name: `Conta ${customer.name}`,
              createdAt: new Date().toISOString(),
            });
          }
        } else {
          // Se não encontrou cliente, tentar buscar todas as contas
          const terminals = await getAllTerminals();
          const foundTerminal = terminals.find(t => t.terminalId === terminalId);
          
          if (foundTerminal) {
            setTerminal(foundTerminal);
          } else {
            setError('Conta não encontrada');
          }
        }
      } catch (err) {
        console.error('Erro ao carregar informações da conta:', err);
        setError('Erro ao carregar informações da conta');
      } finally {
        setIsLoading(false);
      }
    };

    // Carregar imediatamente
    loadTerminalInfo();
    
    let isMounted = true;
    // Usar objeto para garantir que o hash seja compartilhado
    const hashRef = { current: '' };
    
    // Função para recarregar dados da planilha (otimizada)
    // IMPORTANTE: Esta função NÃO deve alterar seleções do usuário
    const reloadSpreadsheetData = async () => {
      if (!isMounted || !isCustomer() || !user?.customerId || !terminalId) return;
      
      // IMPORTANTE: Se o usuário já selecionou manualmente, NÃO alterar as planilhas
      // Apenas atualizar os dados se necessário, mas preservar a seleção
      
      // Para planilhas mensais: só atualizar se não houver seleção manual
      if (!userSelectedMonthRef.current) {
        // Priorizar planilha da conta, senão buscar do cliente
        let spreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId);
        if (!spreadsheet) {
          spreadsheet = await getSpreadsheetByCustomerId(user.customerId);
        }
        
        // Obter taxa atual do cliente para incluir no hash
        const customerTax = await getCustomerTax(user.customerId);
        
        // Criar hash simples que detecta mudanças essenciais
        // Hash inclui: data de upload, quantidade de linhas e taxa atual
        const currentHash = spreadsheet 
          ? `${spreadsheet.uploadedAt}-${spreadsheet.data?.length || 0}-${customerTax || 'null'}` 
          : '';
        
        // Atualizar planilha mensal apenas se não houver seleção manual
        setSpreadsheetData(spreadsheet);
        hashRef.current = currentHash;
      }
      
      // Para planilhas diárias: só atualizar se não houver seleção manual
      if (!userSelectedDayRef.current) {
        // Carregar planilha diária também
        let spreadsheetDaily = await getSpreadsheetByTerminalId(terminalId, user.customerId, undefined, 'daily');
        if (!spreadsheetDaily) {
          spreadsheetDaily = await getSpreadsheetByCustomerId(user.customerId, undefined, 'daily');
        }
        setSpreadsheetDataDaily(spreadsheetDaily);
      } else if (userSelectedDayRef.current && lastUserSelectedDayRef.current) {
        // Se o usuário já selecionou manualmente, apenas recarregar a planilha do dia selecionado
        // para garantir que os dados estão atualizados, mas SEM alterar a seleção
        const daySpreadsheet = await getSpreadsheetByDate(user.customerId, lastUserSelectedDayRef.current, terminalId);
        if (daySpreadsheet) {
          setSpreadsheetDataDaily(daySpreadsheet);
        }
      }
      
      // NÃO atualizar valores dos cards aqui - isso será feito apenas nos useEffects
      // que são executados quando há mudança explícita (troca de aba, seleção de mês/dia, etc.)
      // Esta função apenas atualiza os dados das planilhas, não os valores exibidos nos cards
    };
    
    // Carregar planilha inicialmente
    reloadSpreadsheetData();
    
    // Atualizar automaticamente a cada 5 segundos (reduzido de 2 para melhor performance)
    const interval = setInterval(() => {
      if (isMounted) {
        reloadSpreadsheetData();
      }
    }, 5000);
    
    // Escutar evento de atualização da planilha para atualização imediata
    const handleSpreadsheetUpdate = (event: CustomEvent) => {
      const eventTerminalId = event.detail?.terminalId;
      const eventCustomerId = event.detail?.customerId;
      const eventType = event.detail?.type; // Tipo da planilha (daily ou monthly)
      const eventReferenceDate = event.detail?.referenceDate; // Data de referência para planilhas diárias
      
      // Atualizar se for do mesmo cliente E (mesmo terminal OU não especificou terminal)
      if (eventCustomerId === user?.customerId && isMounted) {
        if (!eventTerminalId || eventTerminalId === terminalId) {
          // Se for planilha diária e temos a data de referência, selecionar esse dia ANTES de carregar dados
          if (eventType === 'daily' && eventReferenceDate) {
            // Mudar para aba diária se estiver na mensal para que os cards apareçam
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
              reloadSpreadsheetData();
            }, 100);
          } else {
            // Para planilhas mensais ou quando não há data de referência, atualizar imediatamente
            hashRef.current = '';
            reloadSpreadsheetData();
          }
        }
      }
    };
    
    // Escutar evento de atualização dos valores dos cards
    const handleCardValuesUpdate = (event: CustomEvent) => {
      const eventTerminalId = event.detail?.terminalId;
      const eventCustomerId = event.detail?.customerId;
      
      // Atualizar se for do mesmo cliente E (mesmo terminal OU não especificou terminal)
      if (eventCustomerId === user?.customerId && isMounted) {
        if (!eventTerminalId || eventTerminalId === terminalId) {
          // Forçar atualização imediata quando valores dos cards são alterados
          hashRef.current = '';
          reloadSpreadsheetData();
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
  }, [terminalId, isCustomer, user?.customerId, selectedMonth, selectedDay, activeTab]);

  // useEffect SEPARADO para atualizar valores dos cards apenas quando houver mudança explícita
  // (troca de aba, seleção de mês/dia, etc.) - NÃO executa a cada 5 segundos
  useEffect(() => {
    if (!isCustomer() || !user?.customerId || !terminalId) {
      return;
    }

    const updateCardValues = async () => {
      // Garantir que temos customerId e terminalId (TypeScript não infere isso mesmo com o check acima)
      if (!user?.customerId || !terminalId) return;
      const customerId = user.customerId;
      
      // Determinar qual planilha usar baseado na aba ativa
      let activeSpreadsheet: SpreadsheetData | null = null;
      
      if (activeTab === 'monthly') {
        // Para mensal, APENAS usar planilhas mensais
        if (selectedMonth) {
          const monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, customerId, selectedMonth, 'monthly');
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
          const daySpreadsheet = await getSpreadsheetByDate(customerId, day, terminalId || undefined);
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
            terminalId || undefined,
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
      } else if (activeTab === 'daily' && (!spreadsheetDataDaily || !spreadsheetDataDaily.data || spreadsheetDataDaily.data.length === 0)) {
        setSpreadsheetMetrics(null);
      }
    };

    updateCardValues();
  }, [isCustomer, user?.customerId, terminalId, selectedMonth, selectedDay, activeTab, spreadsheetData, spreadsheetDataDaily]);

  const handleFilterChange = useCallback((newFilters: FilterOptions) => {
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilters, terminalId };
      const prevStr = JSON.stringify(prevFilters);
      const newStr = JSON.stringify(updatedFilters);
      if (prevStr === newStr) {
        return prevFilters;
      }
      return updatedFilters;
    });
  }, [terminalId]);

  const loadDashboardData = useCallback(async () => {
    if (!terminalId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const cancelled = { current: false };
      
      const filtersWithTerminal = { ...filters, terminalId };
      
      const salesData = await getSales(filtersWithTerminal);

      if (cancelled.current) return;

      setRecentSales(salesData.slice(0, 10));
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, terminalId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (isLoading && !terminal) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  if (error && !terminal) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-lg p-8 text-center">
        <CreditCard className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-black mb-2">Erro</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => navigate('/customers')}
          className="bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
        >
          Voltar para Clientes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(isCustomer() ? '/' : '/customers')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-black mb-1">
              {isCustomer() ? 'Meu Dashboard' : `Dashboard - ${terminal?.name || terminalId}`}
            </h1>
            {customerName && !isCustomer() && (
              <p className="text-sm md:text-base text-gray-600">
                Cliente: <span className="font-semibold">{customerName}</span>
              </p>
            )}
            {terminal && (
              <p className="text-xs md:text-sm text-gray-500">
                Terminal ID: <span className="font-mono">{terminal.terminalId}</span>
              </p>
            )}
          </div>
        </div>
        
        {/* Seletor de conta para clientes com múltiplas */}
        {isCustomer() && customerTerminals.length > 1 && terminalId && (
          <div className="w-full md:w-auto">
            <label className="block text-sm font-medium text-black mb-2">
              Trocar Conta
            </label>
            <select
              value={terminalId}
              onChange={(e) => navigate(`/terminal/${e.target.value}`, { replace: true })}
              className="w-full md:w-auto px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors bg-white"
            >
              {customerTerminals.map((term) => (
                <option key={term.id} value={term.terminalId}>
                  {term.name || term.terminalId}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filtros - apenas para administradores */}
      {!isCustomer() && (
        <FilterBar
          onFilterChange={handleFilterChange}
        />
      )}

      {/* Mensagem de erro */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}


      {/* KPI Cards da Planilha - Apenas para Clientes */}
      {/* Ordem: Quantidade de Vendas, Valor Bruto, Taxa, Valor Líquido */}
      {/* Mostrar cards quando houver planilha selecionada (mensal ou diária) e métricas calculadas */}
      {isCustomer() && spreadsheetMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <KPICard
            title="Quantidade de Vendas"
            value={spreadsheetMetrics?.totalVendas ?? 0}
            icon={ShoppingCart}
            format="number"
          />
          <KPICard
            title="Valor Bruto"
            value={spreadsheetMetrics?.valorBrutoTotal ?? 0}
            icon={DollarSign}
            format="currency"
          />
          <KPICard
            title="Taxa"
            value={spreadsheetMetrics?.taxaMedia ?? 0}
            icon={Percent}
            format={spreadsheetMetrics?.hasCustomValues ? "currency" : "percentage"}
          />
          <KPICard
            title="Valor Líquido"
            value={spreadsheetMetrics?.valorLiquidoTotal ?? 0}
            icon={DollarSign}
            format="currency"
          />
        </div>
      )}

      {/* Botão para Gerenciar Planilha - Apenas para Administradores */}
      {isAdmin() && user?.customerId && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowSpreadsheetModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold"
          >
            <FileSpreadsheet className="w-5 h-5" />
            {spreadsheetData ? 'Gerenciar Planilha' : 'Enviar Planilha'}
          </button>
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
                  // Atualizar métricas imediatamente ao trocar para aba mensal
                  if (user?.customerId && terminalId) {
                    let monthSpreadsheet: SpreadsheetData | null = null;
                    if (selectedMonth) {
                      monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, selectedMonth, 'monthly');
                    } else if (spreadsheetData) {
                      monthSpreadsheet = spreadsheetData;
                    }
                    
                    if (monthSpreadsheet && monthSpreadsheet.data && monthSpreadsheet.data.length > 0) {
                      const customValues = await getCustomerCardValues(
                        user.customerId, 
                        terminalId,
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
                  // Atualizar métricas imediatamente ao trocar para aba diária
                  if (user?.customerId) {
                    let daySpreadsheet: SpreadsheetData | null = null;
                    if (selectedDay) {
                      daySpreadsheet = await getSpreadsheetByDate(user.customerId, selectedDay, terminalId);
                    } else if (spreadsheetDataDaily) {
                      daySpreadsheet = spreadsheetDataDaily;
                    }
                    
                    if (daySpreadsheet && daySpreadsheet.data && daySpreadsheet.data.length > 0) {
                      const customValues = await getCustomerCardValues(
                        user.customerId, 
                        terminalId,
                        undefined, // Não usar referenceMonth para diárias
                        daySpreadsheet.referenceDate,
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
                        {spreadsheetData.referenceMonth && <span className="ml-2 font-semibold text-blue-700">({spreadsheetData.referenceMonth.split('-').reverse().join('/')})</span>}
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
                          if (monthValue && user?.customerId && terminalId) {
                            const monthSpreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId, monthValue, 'monthly');
                            setSpreadsheetData(monthSpreadsheet);
                          } else {
                            setSpreadsheetData(null);
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
                          <th key={index} className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap">{header}</th>
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
                        {spreadsheetDataDaily.referenceDate && <span className="ml-2 font-semibold text-green-700">(📅 {new Date(spreadsheetDataDaily.referenceDate).toLocaleDateString('pt-BR')})</span>}
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
                          if (dayValue && user?.customerId && terminalId) {
                            const daySpreadsheet = await getSpreadsheetByDate(user.customerId, dayValue, terminalId);
                            setSpreadsheetDataDaily(daySpreadsheet);
                          } else {
                            setSpreadsheetDataDaily(null);
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
                          <th key={index} className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap">{header}</th>
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

      {/* Vendas Recentes - Apenas para Administradores */}
      {isAdmin() && (
      <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
        <div className="p-4 md:p-6 border-b-2 border-black">
          <h2 className="text-lg md:text-xl font-bold text-black">Vendas Recentes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black text-white">
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Data</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Produto</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Cliente</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Valor</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    Nenhuma venda encontrada para esta conta
                  </td>
                </tr>
              ) : (
                recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">
                      {new Date(sale.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">{sale.product}</td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">{sale.customerName}</td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base font-semibold text-black">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.amount)}
                    </td>
                    <td className="py-3 px-4 md:px-6">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          sale.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : sale.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sale.status === 'completed'
                          ? 'Concluída'
                          : sale.status === 'pending'
                          ? 'Pendente'
                          : 'Cancelada'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal de Planilha - Para Clientes e Administradores */}
      {showSpreadsheetModal && user?.customerId && (
        <CustomerSpreadsheet
          customerId={user.customerId}
          customerName={customerName || user.name || 'Cliente'}
          terminalId={terminalId}
          terminalName={terminal?.name || terminalId}
          onClose={async () => {
            setShowSpreadsheetModal(false);
            // Recarregar dados após fechar o modal
            if (isCustomer() && user?.customerId && terminalId) {
              let spreadsheet = await getSpreadsheetByTerminalId(terminalId, user.customerId);
              if (!spreadsheet) {
                spreadsheet = await getSpreadsheetByCustomerId(user.customerId);
              }
              setSpreadsheetData(spreadsheet);
              
              // Buscar valores customizados específicos da planilha selecionada
              if (spreadsheet && spreadsheet.data && spreadsheet.data.length > 0) {
                // Para planilhas diárias, usar apenas referenceDate; para mensais, usar referenceMonth
                const isDaily = spreadsheet.type === 'daily';
                const customValues = await getCustomerCardValues(
                  user.customerId, 
                  terminalId,
                  isDaily ? undefined : spreadsheet.referenceMonth, // Não usar referenceMonth para diárias
                  isDaily ? spreadsheet.referenceDate : undefined, // Usar referenceDate apenas para diárias
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

export default TerminalDashboard;

