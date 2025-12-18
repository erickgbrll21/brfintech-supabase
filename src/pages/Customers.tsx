import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCustomers, updateCustomer, createCustomer, deleteCustomer } from '../services/customerService';
import { saveCustomerTax } from '../services/customerTaxService';
import { saveCustomerCardValues, deleteCustomerCardValues } from '../services/customerCardValuesService';
import { Customer, CieloTerminal } from '../types';
import { Plus, Edit, Trash2, Shield, Search, Building2, CreditCard, X, ExternalLink, DollarSign, FileSpreadsheet, Percent, Settings } from 'lucide-react';
import CustomerSpreadsheet from '../components/CustomerSpreadsheet';

const Customers = () => {
  const { isAdmin, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState<'name'>('name');

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

  const initialFormData = {
    name: '',
    email: '',
    phone: '',
    cpfCnpj: '',
    status: 'active' as 'active' | 'inactive',
    region: '',
    username: '',
    password: '',
    cieloTerminals: [] as Array<{ terminalId: string; name: string }>,
  };

  const [formData, setFormData] = useState(initialFormData);
  
  const [newTerminal, setNewTerminal] = useState({ terminalId: '', name: '' });
  const [selectedCustomerForSpreadsheet, setSelectedCustomerForSpreadsheet] = useState<{ id: string; name: string } | null>(null);
  const [selectedCustomerForTax, setSelectedCustomerForTax] = useState<{ id: string; name: string } | null>(null);
  const [selectedCustomerForCards, setSelectedCustomerForCards] = useState<{ id: string; name: string; terminalId?: string; terminalName?: string } | null>(null);
  const [selectedTerminalForSpreadsheet, setSelectedTerminalForSpreadsheet] = useState<{ customerId: string; customerName: string; terminalId: string; terminalName: string } | null>(null);
  const [taxRate, setTaxRate] = useState<string>('');
  const [cardValues, setCardValues] = useState({
    quantidadeVendas: '',
    valorBruto: '',
    taxa: '',
    valorLiquido: '',
  });

  // Função para carregar clientes
  const loadCustomers = useCallback(async () => {
    if (!user || user.role !== 'admin') {
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Carregar clientes quando o componente montar
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || user.role !== 'admin') {
      setIsLoading(false);
      return;
    }

    loadCustomers();
  }, [user, authLoading, loadCustomers]);

  const filteredCustomers = useMemo(() => {
    let filtered = [...customers];

    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm)
      );
    }

    if (filterStatus) {
      filtered = filtered.filter((c) => c.status === filterStatus);
    }

    if (filtered.length > 0) {
      filtered.sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          default:
            return 0;
        }
      });
    }

    return filtered;
  }, [customers, searchTerm, filterStatus, sortBy]);

  const handleAddTerminal = () => {
    if (!newTerminal.terminalId.trim()) {
      alert('Por favor, informe o ID da conta.');
      return;
    }
    
    setFormData({
      ...formData,
      cieloTerminals: [
        ...formData.cieloTerminals,
        {
          terminalId: newTerminal.terminalId.trim(),
          name: newTerminal.name.trim() || `Conta ${formData.cieloTerminals.length + 1}`,
        },
      ],
    });
    setNewTerminal({ terminalId: '', name: '' });
  };

  const handleRemoveTerminal = (index: number) => {
    setFormData({
      ...formData,
      cieloTerminals: formData.cieloTerminals.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { password, cieloTerminals, ...customerData } = formData;
      
      // Converter array de terminais para formato CieloTerminal[]
      const terminals: CieloTerminal[] = cieloTerminals.map((term, index) => ({
        id: `term_${Date.now()}_${index}`,
        terminalId: term.terminalId,
        name: term.name,
        createdAt: new Date().toISOString(),
      }));
      
      const customerDataWithTerminals = {
        ...customerData,
        region: customerData.region || 'Sudeste',
        cieloTerminals: terminals.length > 0 ? terminals : undefined,
      };
      
      let savedCustomerId: string | null = null;
      
      if (editingCustomer) {
        // Ao editar, só atualiza senha se fornecida
        await updateCustomer(editingCustomer.id, customerDataWithTerminals, password || undefined);
        savedCustomerId = editingCustomer.id;
      } else {
        // Ao criar, senha é obrigatória se username for fornecido
        if (formData.username && !password) {
          alert('Por favor, defina uma senha quando criar um usuário para o cliente.');
          return;
        }
        const newCustomer = await createCustomer(customerDataWithTerminals, password || undefined);
        savedCustomerId = newCustomer?.id || null;
      }
      
      // Recarregar clientes para obter o ID do cliente recém-criado
      await loadCustomers();
      
      // Se foi criado um novo cliente, manter o modal aberto e permitir upload de planilha
      if (!editingCustomer && savedCustomerId) {
        // Buscar o cliente recém-criado
        const customers = await getCustomers();
        const newCustomer = customers.find(c => c.id === savedCustomerId);
        if (newCustomer) {
          setEditingCustomer(newCustomer);
          // Manter os terminais no formData
          setFormData({
            ...formData,
            cieloTerminals: formData.cieloTerminals,
          });
          // Não fechar o modal, apenas mostrar mensagem de sucesso
          alert('Cliente criado com sucesso! Agora você pode adicionar planilhas para cada conta.');
          return; // Não limpar o formulário ainda
        }
      }
      
      // Se foi edição ou não encontrou o cliente, fechar o modal normalmente
      setShowModal(false);
      setEditingCustomer(null);
      setFormData(initialFormData);
      setNewTerminal({ terminalId: '', name: '' });
      setSelectedTerminalForSpreadsheet(null);
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      alert('Erro ao salvar cliente. Tente novamente.');
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setSelectedTerminalForSpreadsheet(null); // Limpar seleção de terminal ao editar
    
    // Converter cieloTerminals para formato do formulário
    const terminals = customer.cieloTerminals?.map(t => ({
      terminalId: t.terminalId,
      name: t.name || '',
    })) || [];
    
    // Se não tiver cieloTerminals mas tiver cieloTerminalId (compatibilidade)
    if (terminals.length === 0 && customer.cieloTerminalId) {
      terminals.push({
        terminalId: customer.cieloTerminalId,
        name: `Conta ${customer.name}`,
      });
    }
    
    setFormData({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      cpfCnpj: customer.cpfCnpj || '',
      status: customer.status,
      region: customer.region || '',
      username: customer.username || '',
      password: '', // Não preencher senha ao editar por segurança
      cieloTerminals: terminals,
    });
    setNewTerminal({ terminalId: '', name: '' });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        await deleteCustomer(id);
        loadCustomers();
      } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        alert('Erro ao excluir cliente. Tente novamente.');
      }
    }
  };

  const openNewCustomerModal = () => {
    setEditingCustomer(null);
    setFormData(initialFormData);
    setNewTerminal({ terminalId: '', name: '' });
    setShowModal(true);
  };

  // Renderizar loading enquanto autenticação carrega
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  // Verificar se o usuário não é admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="bg-white border-2 border-red-200 rounded-lg p-8 text-center">
        <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-black mb-2">Acesso Negado</h2>
        <p className="text-gray-600">Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  // Renderizar loading enquanto carrega dados
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black mb-2">Gestão de Clientes</h1>
          <p className="text-sm md:text-base text-gray-600">Organize e classifique seus clientes</p>
        </div>
        <button
          onClick={openNewCustomerModal}
          className="bg-black text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" />
          Novo Cliente
        </button>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white border-2 border-black rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
              />
            </div>
          </div>
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
            >
              <option value="">Todos os Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
            >
              <option value="name">Ordenar por Nome</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black text-white">
                <th className="text-left py-4 px-6 font-semibold">Nome</th>
                <th className="text-left py-4 px-6 font-semibold">Email</th>
                <th className="text-left py-4 px-6 font-semibold">CNPJ/CPF</th>
                <th className="text-left py-4 px-6 font-semibold">Usuário</th>
                <th className="text-left py-4 px-6 font-semibold">Conta</th>
                <th className="text-left py-4 px-6 font-semibold">Telefone</th>
                <th className="text-left py-4 px-6 font-semibold">Status</th>
                <th className="text-left py-4 px-6 font-semibold">Planilha</th>
                <th className="text-left py-4 px-6 font-semibold">Ações</th>
                <th className="text-left py-4 px-6 font-semibold">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                    <td colSpan={10} className="py-12 text-center">
                    <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg font-medium mb-2">Nenhum cliente cadastrado</p>
                    <p className="text-gray-500 text-sm">O sistema está pronto para uso. Clique em "Novo Cliente" para começar.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-4 px-6 text-gray-700 font-medium">{customer.name}</td>
                    <td className="py-4 px-6 text-gray-700">{customer.email}</td>
                    <td className="py-4 px-6 text-gray-700">
                      {customer.cpfCnpj ? (
                        <span className="font-mono text-sm">{customer.cpfCnpj}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-700">
                      {customer.username ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          {customer.username}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-700">
                      {customer.cieloTerminals && customer.cieloTerminals.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {customer.cieloTerminals.map((term, idx) => (
                            <div key={term.id || idx} className="flex items-center gap-1">
                              <button
                                onClick={() => navigate(`/terminal/${term.terminalId}`)}
                                className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold flex items-center hover:bg-green-200 transition-colors cursor-pointer group"
                                title={`Ver dashboard da conta: ${term.name || term.terminalId}`}
                              >
                                <CreditCard className="w-3 h-3 mr-1" />
                                {term.terminalId}
                                <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                              {/* Botão para editar cards da conta - Apenas Admin */}
                              {isAdmin() && (
                                <button
                                  onClick={() => {
                                    setSelectedCustomerForCards({ 
                                      id: customer.id, 
                                      name: customer.name,
                                      terminalId: term.terminalId,
                                      terminalName: term.name || term.terminalId
                                    });
                                    // Campos zerados ao abrir o modal
                                    setCardValues({
                                      quantidadeVendas: '',
                                      valorBruto: '',
                                      taxa: '',
                                      valorLiquido: '',
                                    });
                                  }}
                                  className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
                                  title="Editar Valores dos Cards desta Conta (Apenas Admin)"
                                >
                                  <Settings className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : customer.cieloTerminalId ? (
                        <button
                          onClick={() => navigate(`/terminal/${customer.cieloTerminalId}`)}
                          className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold flex items-center hover:bg-green-200 transition-colors cursor-pointer group"
                          title="Ver dashboard da conta"
                        >
                          <CreditCard className="w-3 h-3 mr-1" />
                          {customer.cieloTerminalId}
                          <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-700">{customer.phone}</td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          customer.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {customer.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => setSelectedCustomerForSpreadsheet({ id: customer.id, name: customer.name })}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        title="Gerenciar Planilha"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(customer)}
                          className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => navigate(`/customers/${customer.id}/sales`)}
                        className="px-3 py-1 bg-black text-white rounded text-xs font-semibold hover:bg-gray-800 transition-colors flex items-center"
                        title="Gerenciar vendas"
                      >
                        <DollarSign className="w-3 h-3 mr-1" />
                        Vendas
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Total de clientes: <strong className="text-black">{filteredCustomers.length}</strong>
          </p>
        </div>
      </div>

      {/* Modal de Criar/Editar Cliente */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-black mb-4">
              {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Nome</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">CNPJ/CPF</label>
                  <input
                    type="text"
                    value={formData.cpfCnpj}
                    onChange={(e) => {
                      // Formatar automaticamente CNPJ/CPF
                      let value = e.target.value.replace(/\D/g, '');
                      if (value.length <= 11) {
                        // CPF: 000.000.000-00
                        value = value.replace(/(\d{3})(\d)/, '$1.$2');
                        value = value.replace(/(\d{3})(\d)/, '$1.$2');
                        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                      } else {
                        // CNPJ: 00.000.000/0000-00
                        value = value.replace(/^(\d{2})(\d)/, '$1.$2');
                        value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                        value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
                        value = value.replace(/(\d{4})(\d)/, '$1-$2');
                      }
                      setFormData({ ...formData, cpfCnpj: value });
                    }}
                    placeholder="00.000.000/0000-00 ou 000.000.000-00"
                    maxLength={18}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-1">Digite o CNPJ ou CPF do cliente</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Região</label>
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="">Selecione</option>
                    <option value="Sudeste">Sudeste</option>
                    <option value="Sul">Sul</option>
                    <option value="Nordeste">Nordeste</option>
                    <option value="Norte">Norte</option>
                    <option value="Centro-Oeste">Centro-Oeste</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>
              
              {/* Integração Cielo - Múltiplas Contas */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-lg font-semibold text-black mb-4 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Contas Cielo
                </h3>
                
                {/* Lista de contas adicionadas */}
                {formData.cieloTerminals.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {formData.cieloTerminals.map((term, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 border-2 border-gray-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <CreditCard className="w-4 h-4 mr-2 text-gray-600" />
                            <span className="font-semibold text-black">{term.terminalId}</span>
                            {term.name && (
                              <span className="ml-2 text-sm text-gray-600">({term.name})</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Botão para fazer upload de planilha para esta conta */}
                          {/* Aparece sempre, mas só funciona se o cliente tiver ID (já foi salvo) */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!editingCustomer || !editingCustomer.id) {
                                alert('Por favor, salve o cliente primeiro antes de adicionar planilhas.');
                                return;
                              }
                              setSelectedTerminalForSpreadsheet({
                                customerId: editingCustomer.id,
                                customerName: editingCustomer.name,
                                terminalId: term.terminalId,
                                terminalName: term.name || term.terminalId,
                              });
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm font-semibold ${
                              editingCustomer && editingCustomer.id
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                            title={
                              editingCustomer && editingCustomer.id
                                ? 'Enviar planilha para esta conta'
                                : 'Salve o cliente primeiro para adicionar planilha'
                            }
                            disabled={!editingCustomer || !editingCustomer.id}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            Planilha
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveTerminal(index)}
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Remover conta"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Formulário para adicionar nova conta */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-black mb-2">
                        ID da Conta/Terminal Cielo
                      </label>
                      <input
                        type="text"
                        value={newTerminal.terminalId}
                        onChange={(e) => setNewTerminal({ ...newTerminal, terminalId: e.target.value })}
                        placeholder="Ex: TERMINAL001 ou Merchant Order ID"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-black mb-2">
                        Nome (opcional)
                      </label>
                      <input
                        type="text"
                        value={newTerminal.name}
                        onChange={(e) => setNewTerminal({ ...newTerminal, name: e.target.value })}
                        placeholder="Ex: Loja Principal"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTerminal}
                    className="flex items-center px-4 py-2 bg-gray-200 text-black rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Conta
                  </button>
                  <p className="text-xs text-gray-500">
                    Você pode adicionar múltiplas contas para este cliente. As vendas de todas as contas aparecerão automaticamente na dashboard.
                  </p>
                </div>
              </div>

              {/* Campos de Usuário e Senha */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-lg font-semibold text-black mb-4">Credenciais de Acesso</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      Usuário
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Nome de usuário para login"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    />
                    <p className="text-xs text-gray-500 mt-1">Opcional - para acesso ao sistema</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-black mb-2">
                      {editingCustomer ? 'Nova Senha (deixe em branco para manter a atual)' : 'Senha'}
                      {!editingCustomer && formData.username && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingCustomer ? 'Digite apenas se quiser alterar' : 'Digite a senha'}
                      required={!editingCustomer && !!formData.username}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    />
                    {!editingCustomer && formData.username && (
                      <p className="text-xs text-gray-500 mt-1">
                        Obrigatória quando um usuário é definido
                      </p>
                    )}
                    {editingCustomer && (
                      <p className="text-xs text-gray-500 mt-1">
                        Deixe em branco para manter a senha atual
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  {editingCustomer ? 'Salvar' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
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

      {/* Modal de Planilha - Cliente Geral */}
      {selectedCustomerForSpreadsheet && !selectedTerminalForSpreadsheet && (
        <CustomerSpreadsheet
          customerId={selectedCustomerForSpreadsheet.id}
          customerName={selectedCustomerForSpreadsheet.name}
          onClose={() => setSelectedCustomerForSpreadsheet(null)}
        />
      )}

      {/* Modal de Planilha - Conta Específica */}
      {selectedTerminalForSpreadsheet && (
        <CustomerSpreadsheet
          customerId={selectedTerminalForSpreadsheet.customerId}
          customerName={selectedTerminalForSpreadsheet.customerName}
          terminalId={selectedTerminalForSpreadsheet.terminalId}
          terminalName={selectedTerminalForSpreadsheet.terminalName}
          onClose={() => setSelectedTerminalForSpreadsheet(null)}
        />
      )}

      {/* Modal de Taxa */}
      {selectedCustomerForTax && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Percent className="w-6 h-6 text-black" />
                <h2 className="text-xl font-bold text-black">Configurar Taxa</h2>
              </div>
              <button
                onClick={() => setSelectedCustomerForTax(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                Cliente: <strong>{selectedCustomerForTax.name}</strong>
              </p>
              <label className="block text-sm font-medium text-black mb-2">
                Taxa (%) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="Ex: 2.5"
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Digite a taxa em porcentagem (ex: 2.5 para 2.5%)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (taxRate && !isNaN(parseFloat(taxRate))) {
                    saveCustomerTax(selectedCustomerForTax.id, parseFloat(taxRate), user?.id);
                    loadCustomers();
                    setSelectedCustomerForTax(null);
                    setTaxRate('');
                  } else {
                    alert('Por favor, digite uma taxa válida');
                  }
                }}
                className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  setSelectedCustomerForTax(null);
                  setTaxRate('');
                }}
                className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Valores dos Cards - Apenas para Administradores */}
      {selectedCustomerForCards && isAdmin() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Settings className="w-6 h-6 text-black" />
                <h2 className="text-xl font-bold text-black">Editar Valores dos Cards</h2>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomerForCards(null);
                  setCardValues({ quantidadeVendas: '', valorBruto: '', taxa: '', valorLiquido: '' });
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Cliente: <strong>{selectedCustomerForCards.name}</strong>
              </p>
              {selectedCustomerForCards.terminalId && (
                <p className="text-sm text-gray-600 mb-4">
                  Conta: <strong>{selectedCustomerForCards.terminalName || selectedCustomerForCards.terminalId}</strong>
                </p>
              )}
              <p className="text-xs text-gray-500 mb-4">
                Deixe em branco para usar os valores da planilha. Preencha para definir valores customizados.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Quantidade de Vendas
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={cardValues.quantidadeVendas}
                  onChange={(e) => setCardValues({ ...cardValues, quantidadeVendas: e.target.value })}
                  placeholder="Deixe vazio para usar valor da planilha"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

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
                  placeholder="0,00"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ao inserir o valor bruto, a taxa (5,10% em R$) e o valor líquido serão calculados automaticamente.
                </p>
              </div>

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
                    const taxaFormatada = taxaNum > 0 ? formatarValorBrasileiro(taxaNum.toString()) : taxa;
                    
                    setCardValues({ ...cardValues, taxa: taxaFormatada });
                    
                    // Recalcular valor líquido se houver valor bruto
                    if (cardValues.valorBruto && taxaNum > 0) {
                      const valorBrutoNum = parseValorBrasileiro(cardValues.valorBruto);
                      if (valorBrutoNum > 0) {
                        const valorLiquidoCalculado = valorBrutoNum - taxaNum;
                        const valorLiquidoFormatado = formatarValorBrasileiro(valorLiquidoCalculado.toString());
                        setCardValues({ ...cardValues, taxa: taxaFormatada, valorLiquido: valorLiquidoFormatado });
                      }
                    }
                  }}
                  placeholder="0,00"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Taxa calculada automaticamente: 5,10% do valor bruto (em R$).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Valor Líquido (R$)
                </label>
                <input
                  type="text"
                  value={cardValues.valorLiquido}
                  readOnly
                  placeholder="0,00"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Valor líquido calculado automaticamente (Valor Bruto - Taxa).
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  const values: any = {};
                  if (cardValues.quantidadeVendas) values.quantidadeVendas = parseFloat(cardValues.quantidadeVendas.replace(/[^\d,.-]/g, '').replace(',', '.'));
                  if (cardValues.valorBruto) values.valorBruto = parseValorBrasileiro(cardValues.valorBruto);
                  if (cardValues.taxa) values.taxa = parseValorBrasileiro(cardValues.taxa);
                  if (cardValues.valorLiquido) values.valorLiquido = parseValorBrasileiro(cardValues.valorLiquido);
                  
                  if (Object.keys(values).length > 0) {
                    saveCustomerCardValues(selectedCustomerForCards.id, values, user?.id, selectedCustomerForCards.terminalId);
                  } else {
                    deleteCustomerCardValues(selectedCustomerForCards.id, selectedCustomerForCards.terminalId);
                  }
                  
                  loadCustomers();
                  setSelectedCustomerForCards(null);
                  setCardValues({ quantidadeVendas: '', valorBruto: '', taxa: '', valorLiquido: '' });
                }}
                className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={() => {
                  deleteCustomerCardValues(selectedCustomerForCards.id, selectedCustomerForCards.terminalId);
                  loadCustomers();
                  setSelectedCustomerForCards(null);
                  setCardValues({ quantidadeVendas: '', valorBruto: '', taxa: '', valorLiquido: '' });
                }}
                className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Restaurar Valores da Planilha
              </button>
              <button
                onClick={() => {
                  setSelectedCustomerForCards(null);
                  setCardValues({ quantidadeVendas: '', valorBruto: '', taxa: '', valorLiquido: '' });
                }}
                className="flex-1 bg-gray-200 text-black py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;

