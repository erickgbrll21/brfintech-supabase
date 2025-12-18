import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCustomerById } from '../services/customerService';
import { getSalesByCustomerId, createSale, updateSale, deleteSale } from '../services/salesService';
import { Customer, Sale } from '../types';
import { ArrowLeft, Plus, Edit, Trash2, Shield, DollarSign } from 'lucide-react';

const CustomerSales = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    product: '',
    region: '',
    status: 'completed' as 'completed' | 'pending' | 'cancelled',
    paymentMethod: '',
    cieloTerminalId: '',
  });

  const regions = ['Sudeste', 'Sul', 'Nordeste', 'Norte', 'Centro-Oeste'];
  const paymentMethods = ['Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'PIX', 'Boleto'];

  const loadData = useCallback(async () => {
    if (!customerId) return;
    
    setIsLoading(true);
    try {
      const [customerData, salesData] = await Promise.all([
        getCustomerById(customerId),
        getSalesByCustomerId(customerId),
      ]);
      
      setCustomer(customerData);
      setSales(salesData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    try {
      const saleData: Omit<Sale, 'id'> = {
        date: formData.date,
        amount: parseFloat(formData.amount),
        product: formData.product,
        region: formData.region,
        seller: 'Sistema', // Valor padrão já que não há mais campo de vendedor
        customerId: customer.id,
        customerName: customer.name,
        status: formData.status,
        paymentMethod: formData.paymentMethod,
        cieloTerminalId: formData.cieloTerminalId || undefined,
      };

      if (editingSale) {
        await updateSale(editingSale.id, saleData);
      } else {
        await createSale(saleData);
      }

      setShowModal(false);
      setEditingSale(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        product: '',
        region: '',
        status: 'completed',
        paymentMethod: '',
        cieloTerminalId: '',
      });
      loadData();
    } catch (error) {
      console.error('Erro ao salvar venda:', error);
      alert('Erro ao salvar venda. Tente novamente.');
    }
  };

  const handleEdit = (sale: Sale) => {
    // Não permitir editar vendas da Cielo
    if (sale.id.startsWith('cielo_')) {
      alert('Não é possível editar vendas sincronizadas da Cielo.');
      return;
    }
    
    setEditingSale(sale);
    setFormData({
      date: sale.date,
      amount: sale.amount.toString(),
      product: sale.product,
      region: sale.region,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      cieloTerminalId: sale.cieloTerminalId || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    // Não permitir deletar vendas da Cielo
    if (id.startsWith('cielo_')) {
      alert('Não é possível deletar vendas sincronizadas da Cielo.');
      return;
    }

    if (window.confirm('Tem certeza que deseja excluir esta venda?')) {
      try {
        await deleteSale(id);
        loadData();
      } catch (error) {
        console.error('Erro ao excluir venda:', error);
        alert('Erro ao excluir venda. Tente novamente.');
      }
    }
  };

  const openNewSaleModal = () => {
    if (!customer) return;
    
    setEditingSale(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      product: '',
      region: customer.region,
      status: 'completed',
      paymentMethod: '',
      cieloTerminalId: customer.cieloTerminals?.[0]?.terminalId || customer.cieloTerminalId || '',
    });
    setShowModal(true);
  };

  if (!isAdmin()) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-lg p-8 text-center">
        <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-black mb-2">Acesso Negado</h2>
        <p className="text-gray-600">Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-lg p-8 text-center">
        <p className="text-gray-600">Cliente não encontrado.</p>
        <button
          onClick={() => navigate('/customers')}
          className="mt-4 bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
        >
          Voltar para Clientes
        </button>
      </div>
    );
  }

  const totalRevenue = sales
    .filter(s => s.status === 'completed')
    .reduce((sum, sale) => sum + sale.amount, 0);

  const manualSales = sales.filter(s => !s.id.startsWith('cielo_'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/customers')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-black mb-1">
              Vendas - {customer.name}
            </h1>
            <p className="text-sm md:text-base text-gray-600">
              Gerencie as vendas deste cliente manualmente
            </p>
          </div>
        </div>
        <button
          onClick={openNewSaleModal}
          className="bg-black text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" />
          Nova Venda
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Vendas</p>
              <p className="text-2xl font-bold text-black">{sales.length}</p>
            </div>
            <DollarSign className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Receita Total</p>
              <p className="text-2xl font-bold text-black">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Vendas Manuais</p>
              <p className="text-2xl font-bold text-black">{manualSales.length}</p>
            </div>
            <DollarSign className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Tabela de Vendas */}
      <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
        <div className="p-4 md:p-6 border-b-2 border-black">
          <h2 className="text-lg md:text-xl font-bold text-black">Vendas do Cliente</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black text-white">
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Data</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Produto</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Valor</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Região</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Pagamento</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Status</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Origem</th>
                <th className="text-left py-3 px-4 md:px-6 font-semibold text-sm md:text-base">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg font-medium mb-2">Nenhuma venda registrada</p>
                    <p className="text-gray-500 text-sm">Clique em "Nova Venda" para adicionar uma venda manual.</p>
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">
                      {new Date(sale.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">{sale.product}</td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base font-semibold text-black">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.amount)}
                    </td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">{sale.region}</td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base text-gray-700">{sale.paymentMethod}</td>
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
                        {sale.status === 'completed' ? 'Concluída' : sale.status === 'pending' ? 'Pendente' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="py-3 px-4 md:px-6 text-sm md:text-base">
                      {sale.id.startsWith('cielo_') ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                          Cielo
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 md:px-6">
                      <div className="flex items-center space-x-2">
                        {!sale.id.startsWith('cielo_') && (
                          <>
                            <button
                              onClick={() => handleEdit(sale)}
                              className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(sale.id)}
                              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criar/Editar Venda */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-black mb-4">
              {editingSale ? 'Editar Venda' : 'Nova Venda'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Data</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                    placeholder="0.00"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Produto</label>
                  <input
                    type="text"
                    value={formData.product}
                    onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                    required
                    placeholder="Digite o nome do produto"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Região</label>
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="">Selecione</option>
                    {regions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Método de Pagamento</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    required
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="">Selecione</option>
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'completed' | 'pending' | 'cancelled' })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  >
                    <option value="completed">Concluída</option>
                    <option value="pending">Pendente</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
                {customer.cieloTerminals && customer.cieloTerminals.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-black mb-2">Conta (opcional)</label>
                    <select
                      value={formData.cieloTerminalId}
                      onChange={(e) => setFormData({ ...formData, cieloTerminalId: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                    >
                      <option value="">Nenhuma</option>
                      {customer.cieloTerminals.map((term) => (
                        <option key={term.id} value={term.terminalId}>
                          {term.name || term.terminalId}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  {editingSale ? 'Salvar' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingSale(null);
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

export default CustomerSales;

