import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTransfers, createTransfer, updateTransfer, deleteTransfer } from '../services/transferService';
import { getCustomers } from '../services/customerService';
import { getCustomerCardValues } from '../services/customerCardValuesService';
import { Transfer, TransferStatus, Customer } from '../types';
import { Plus, Edit, Trash2, CheckCircle, Clock, XCircle } from 'lucide-react';

// Função para formatar valores em Real brasileiro
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Função para formatar data brasileira
const formatDate = (dateString: string): string => {
  if (!dateString || dateString.trim() === '') {
    return '-';
  }
  return new Date(dateString).toLocaleDateString('pt-BR');
};

// Função para extrair data no formato YYYY-MM-DD sem problemas de timezone
// SOLUÇÃO DEFINITIVA: Converter UTC para timezone local antes de extrair a data
const extractDateOnly = (dateString: string): string => {
  if (!dateString || dateString.trim() === '') {
    return '';
  }
  
  // Se já está no formato YYYY-MM-DD, retornar direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Se é uma data ISO completa (vinda do PostgreSQL como TIMESTAMPTZ em UTC)
  // Precisamos converter para o timezone local antes de extrair a data
  try {
    // Criar Date object a partir da string ISO (que está em UTC)
    const utcDate = new Date(dateString);
    
    if (isNaN(utcDate.getTime())) {
      return '';
    }
    
    // IMPORTANTE: Usar métodos locais (getFullYear, getMonth, getDate)
    // Esses métodos automaticamente convertem de UTC para o timezone local
    // Isso garante que a data exibida seja a data correta no timezone do usuário
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    
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

// Função para obter cor e ícone do status
const getStatusDisplay = (status: TransferStatus) => {
  switch (status) {
    case 'enviado':
      return {
        label: 'Enviado',
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        iconColor: 'text-green-600',
      };
    case 'pendente':
      return {
        label: 'Pendente',
        color: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
        iconColor: 'text-yellow-600',
      };
    case 'nao_enviado':
      return {
        label: 'Não Enviado',
        color: 'bg-red-100 text-red-800',
        icon: XCircle,
        iconColor: 'text-red-600',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
        icon: Clock,
        iconColor: 'text-gray-600',
      };
  }
};

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
  // Substitui vírgula por ponto
  valorLimpo = valorLimpo.replace(',', '.');
  
  return parseFloat(valorLimpo) || 0;
};

const Transfers = () => {
  const { isAdmin, user } = useAuth();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [formData, setFormData] = useState({
    valorBruto: '',
    taxas: '',
    valorLiquido: '',
    status: 'pendente' as TransferStatus,
    dataEnvio: new Date().toISOString().split('T')[0],
    customerId: '',
    periodo: '',
  });

  useEffect(() => {
    loadTransfers();
    if (isAdmin()) {
      loadCustomers();
    }
    
    // Ouvir eventos de atualização dos valores dos cards para sincronizar repasses
    const handleCardValuesUpdated = () => {
      loadTransfers();
    };
    
    // Ouvir evento de criação de repasse para atualizar a lista imediatamente
    const handleTransferCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('📢 Evento transferCreated recebido na página Transfers:', customEvent.detail);
      console.log('📢 Ação:', customEvent.detail?.action || 'desconhecida');
      
      // Recarregar lista de repasses após um delay para garantir que o banco foi atualizado
      setTimeout(() => {
        console.log('🔄 Recarregando lista de repasses...');
        loadTransfers();
      }, 500);
    };
    
    window.addEventListener('cardValuesUpdated', handleCardValuesUpdated);
    window.addEventListener('transferCreated', handleTransferCreated);
    
    return () => {
      window.removeEventListener('cardValuesUpdated', handleCardValuesUpdated);
      window.removeEventListener('transferCreated', handleTransferCreated);
    };
  }, [isAdmin]);

  const loadCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadTransfers = async () => {
    setIsLoading(true);
    try {
      let data = await getTransfers();
      
      // Se for cliente, filtrar apenas repasses do cliente logado
      if (!isAdmin() && user?.customerId) {
        data = data.filter(t => t.customerId === user.customerId);
      }
      
      // Sincronizar valores dos repasses com os valores dos cards editados
      data = await syncTransfersWithCardValues(data);
      
      setTransfers(data);
    } catch (error) {
      console.error('Erro ao carregar repasses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sincronizar valores dos repasses com os valores dos cards editados pelo administrador
  const syncTransfersWithCardValues = async (transfers: Transfer[]): Promise<Transfer[]> => {
    const syncedTransfers = [...transfers];
    
    for (let i = 0; i < syncedTransfers.length; i++) {
      const transfer = syncedTransfers[i];
      
      // Extrair informações do período para buscar valores dos cards
      let referenceMonth: string | undefined;
      let referenceDate: string | undefined;
      let type: 'monthly' | 'daily' | undefined = 'monthly';
      
      if (transfer.periodo) {
        // Tentar identificar se é mensal ou diária pelo formato do período
        // Mensal: "Janeiro/2024" ou "01/2024"
        // Diária: "15/01/2024" ou "15/1/2024"
        const periodoParts = transfer.periodo.split('/');
        
        if (periodoParts.length === 2) {
          // Formato mensal: "Janeiro/2024"
          const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const monthIndex = monthNames.findIndex(m => m.toLowerCase() === periodoParts[0].toLowerCase());
          if (monthIndex >= 0) {
            const month = String(monthIndex + 1).padStart(2, '0');
            referenceMonth = `${periodoParts[1]}-${month}`;
            type = 'monthly';
          }
        } else if (periodoParts.length === 3) {
          // Formato diária: "15/01/2024"
          const day = periodoParts[0].padStart(2, '0');
          const month = periodoParts[1].padStart(2, '0');
          const year = periodoParts[2];
          referenceDate = `${year}-${month}-${day}`;
          referenceMonth = `${year}-${month}`;
          type = 'daily';
        }
      }
      
      // Buscar valores customizados dos cards
      const customValues = getCustomerCardValues(
        transfer.customerId,
        undefined, // terminalId - não usar para buscar valores gerais do cliente
        referenceMonth,
        referenceDate,
        type
      );
      
      // Se encontrou valores customizados, atualizar o repasse com os valores dos cards
      if (customValues) {
        const values = customValues as any;
        // Usar valores dos cards se existirem, senão manter valores do repasse
        let valorBruto = values.valorBruto !== undefined && values.valorBruto > 0 
          ? values.valorBruto 
          : transfer.valorBruto;
        
        // Taxa: usar valor absoluto dos cards se existir (já está em R$), senão calcular 5,10% do valor bruto
        let taxas = transfer.taxas;
        if (values.taxa !== undefined && values.taxa > 0) {
          // Taxa nos cards já é valor absoluto em reais (R$), não porcentagem
          taxas = values.taxa;
        } else if (values.valorBruto !== undefined && values.valorBruto > 0) {
          // Se tem valor bruto customizado mas não tem taxa customizada, calcular 5,10%
          taxas = valorBruto * 0.051;
        }
        
        // Usar valor líquido dos cards se existir, senão calcular
        let valorLiquido = values.valorLiquido !== undefined && values.valorLiquido > 0
          ? values.valorLiquido
          : (valorBruto - taxas);
        
        // Atualizar o repasse com os valores dos cards
        syncedTransfers[i] = {
          ...transfer,
          valorBruto,
          taxas,
          valorLiquido,
        };
        
        // Atualizar no banco de dados também (silenciosamente)
        updateTransfer(transfer.id, {
          valorBruto,
          taxas,
          valorLiquido,
        }).catch(err => {
          console.error('Erro ao sincronizar repasse:', err);
        });
      }
    }
    
    return syncedTransfers;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const valorBruto = parseValorBrasileiro(formData.valorBruto);
      const taxas = parseValorBrasileiro(formData.taxas);
      const valorLiquido = parseValorBrasileiro(formData.valorLiquido);

      // Validar valores
      if (valorBruto <= 0) {
        alert('O valor bruto deve ser maior que zero.');
        return;
      }

      if (taxas < 0) {
        alert('As taxas não podem ser negativas.');
        return;
      }

      if (valorLiquido <= 0) {
        alert('O valor líquido deve ser maior que zero.');
        return;
      }

      // Validar cliente
      if (!formData.customerId) {
        alert('Por favor, selecione um cliente.');
        return;
      }

      // Buscar nome do cliente
      const selectedCustomer = customers.find(c => c.id === formData.customerId);
      const customerName = selectedCustomer?.name || '';

      // Se status for "enviado" e não tiver data, usar data atual
      let dataEnvio = formData.dataEnvio;
      if (formData.status === 'enviado' && (!dataEnvio || dataEnvio.trim() === '')) {
        // Criar data atual no formato YYYY-MM-DD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dataEnvio = `${year}-${month}-${day}`;
      } else if (dataEnvio && dataEnvio.trim() !== '') {
        // Garantir que a data está no formato YYYY-MM-DD
        // O input type="date" sempre retorna neste formato
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEnvio)) {
          // Se não está no formato correto, tentar extrair
          const dateMatch = dataEnvio.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            dataEnvio = dateMatch[1];
          }
        }
      }

      const transferData: Omit<Transfer, 'id' | 'createdAt'> = {
        periodo: formData.periodo || undefined,
        valorBruto,
        taxas,
        valorLiquido,
        status: formData.status,
        dataEnvio: dataEnvio || '',
        customerId: formData.customerId,
        customerName,
      };

      if (editingTransfer) {
        await updateTransfer(editingTransfer.id, transferData);
      } else {
        await createTransfer(transferData);
      }

      setShowModal(false);
      setEditingTransfer(null);
      setFormData({
        periodo: '',
        valorBruto: '',
        taxas: '',
        valorLiquido: '',
        status: 'pendente',
        dataEnvio: new Date().toISOString().split('T')[0],
        customerId: '',
      });
      loadTransfers();
    } catch (error) {
      console.error('Erro ao salvar repasse:', error);
      alert('Erro ao salvar repasse. Tente novamente.');
    }
  };

  const handleEdit = (transfer: Transfer) => {
    setEditingTransfer(transfer);
    setFormData({
      periodo: transfer.periodo || '',
      valorBruto: transfer.valorBruto.toFixed(2).replace('.', ','),
      taxas: transfer.taxas.toFixed(2).replace('.', ','),
      valorLiquido: transfer.valorLiquido.toFixed(2).replace('.', ','),
      status: transfer.status,
      dataEnvio: transfer.dataEnvio && transfer.dataEnvio.trim() !== '' 
        ? extractDateOnly(transfer.dataEnvio)
        : '',
      customerId: transfer.customerId,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este repasse?')) {
      try {
        await deleteTransfer(id);
        loadTransfers();
      } catch (error) {
        console.error('Erro ao excluir repasse:', error);
        alert('Erro ao excluir repasse. Tente novamente.');
      }
    }
  };

  const openNewTransferModal = () => {
    setEditingTransfer(null);
    setFormData({
      periodo: '',
      valorBruto: '',
      taxas: '',
      valorLiquido: '',
      status: 'pendente',
      dataEnvio: new Date().toISOString().split('T')[0],
      customerId: '',
    });
    setShowModal(true);
  };

  // Calcular taxa automaticamente (5,10%) quando valor bruto mudar
  // Sempre recalcula quando o valor bruto mudar (campo de taxas continua editável)
  useEffect(() => {
    if (formData.valorBruto) {
      const valorBruto = parseValorBrasileiro(formData.valorBruto);
      if (valorBruto > 0) {
        // Calcular 5,10% do valor bruto
        const taxaCalculada = valorBruto * 0.051;
        setFormData(prev => ({
          ...prev,
          taxas: taxaCalculada.toFixed(2).replace('.', ','),
        }));
      } else if (valorBruto === 0 || !formData.valorBruto.trim()) {
        // Se valor bruto for zerado ou vazio, zerar também as taxas
        setFormData(prev => ({
          ...prev,
          taxas: '',
        }));
      }
    }
  }, [formData.valorBruto]);

  // Calcular valor líquido automaticamente quando valor bruto ou taxas mudarem
  useEffect(() => {
    if (formData.valorBruto && formData.taxas) {
      const valorBruto = parseValorBrasileiro(formData.valorBruto);
      const taxas = parseValorBrasileiro(formData.taxas);
      const valorLiquido = valorBruto - taxas;
      if (valorLiquido >= 0) {
        setFormData(prev => ({
          ...prev,
          valorLiquido: valorLiquido.toFixed(2).replace('.', ','),
        }));
      }
    }
  }, [formData.valorBruto, formData.taxas]);



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black mb-2">Histórico de Repasses</h1>
          <p className="text-gray-600">
            {isAdmin() ? 'Gerencie o histórico de repasses financeiros' : 'Visualize o histórico de repasses financeiros'}
          </p>
        </div>
        {isAdmin() && (
          <button
            onClick={openNewTransferModal}
            className="bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Repasse
          </button>
        )}
      </div>

      <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black text-white">
                {isAdmin() && <th className="text-left py-4 px-6 font-semibold">Cliente</th>}
                <th className="text-left py-4 px-6 font-semibold">Período</th>
                <th className="text-left py-4 px-6 font-semibold">Valor Bruto</th>
                <th className="text-left py-4 px-6 font-semibold">Taxas</th>
                <th className="text-left py-4 px-6 font-semibold">Valor Líquido</th>
                <th className="text-left py-4 px-6 font-semibold">Status</th>
                <th className="text-left py-4 px-6 font-semibold">Data do Envio</th>
                <th className="text-left py-4 px-6 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin() ? 8 : 7} className="py-8 px-6 text-center text-gray-500">
                    {isAdmin() 
                      ? 'Nenhum repasse cadastrado. Clique em "Novo Repasse" para adicionar.'
                      : 'Nenhum repasse cadastrado.'}
                  </td>
                </tr>
              ) : (
                transfers.map((transfer) => {
                  const statusDisplay = getStatusDisplay(transfer.status);
                  const StatusIcon = statusDisplay.icon;
                  return (
                    <tr key={transfer.id} className="border-b border-gray-200 hover:bg-gray-50">
                      {isAdmin() && (
                        <td className="py-4 px-6 text-gray-700 font-medium">
                          {transfer.customerName || 'N/A'}
                        </td>
                      )}
                      <td className="py-4 px-6 text-gray-700">{transfer.periodo || '-'}</td>
                      <td className="py-4 px-6 text-gray-700">{formatCurrency(transfer.valorBruto)}</td>
                      <td className="py-4 px-6 text-gray-700">{formatCurrency(transfer.taxas)}</td>
                      <td className="py-4 px-6 text-gray-700 font-semibold">
                        {formatCurrency(transfer.valorLiquido)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center w-fit ${statusDisplay.color}`}
                        >
                          <StatusIcon className={`w-3 h-3 mr-1 ${statusDisplay.iconColor}`} />
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-700">{formatDate(transfer.dataEnvio)}</td>
                      {isAdmin() && (
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEdit(transfer)}
                              className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(transfer.id)}
                              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criar/Editar Repasse */}
      {showModal && isAdmin() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-black mb-4">
              {editingTransfer ? 'Editar Repasse' : 'Novo Repasse'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  required
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Período
                </label>
                <input
                  type="text"
                  value={formData.periodo}
                  onChange={(e) => setFormData({ ...formData, periodo: e.target.value })}
                  placeholder="Ex: Janeiro/2024 ou 15/01/2024"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exemplos: "Janeiro/2024" (mensal) ou "15/01/2024" (diária)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Valor Bruto (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.valorBruto}
                    onChange={(e) => setFormData({ ...formData, valorBruto: e.target.value })}
                    required
                    placeholder="0,00"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Taxas (R$) <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-2">(5,10% calculado automaticamente)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.taxas}
                    onChange={(e) => {
                      setFormData({ ...formData, taxas: e.target.value });
                    }}
                    required
                    placeholder="0,00"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Valor Líquido (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.valorLiquido}
                    onChange={(e) => setFormData({ ...formData, valorLiquido: e.target.value })}
                    required
                    placeholder="0,00"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors bg-gray-50"
                    readOnly
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculado automaticamente (Valor Bruto - Taxas)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TransferStatus })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="enviado">Enviado</option>
                    <option value="pendente">Pendente</option>
                    <option value="nao_enviado">Não Enviado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Data do Envio
                    {formData.status === 'enviado' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="date"
                    value={formData.dataEnvio}
                    onChange={(e) => setFormData({ ...formData, dataEnvio: e.target.value })}
                    required={formData.status === 'enviado'}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                  {formData.status !== 'enviado' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Deixe vazio quando o repasse ainda não foi enviado
                    </p>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  {editingTransfer ? 'Salvar Alterações' : 'Criar Repasse'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingTransfer(null);
                  }}
                  className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;


