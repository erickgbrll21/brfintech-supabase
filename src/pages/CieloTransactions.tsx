import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getCieloTransactions, getCieloPaymentStatus } from '../services/cieloService';
import { getCieloConfig, saveCieloConfig, deleteCieloConfig, hasCieloConfig, CieloConfig } from '../services/cieloConfigService';
import { CieloTransaction } from '../types';
import { CreditCard, RefreshCw, Calendar, Settings, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';

const CieloTransactions = () => {
  const { isAdmin } = useAuth();
  const [transactions, setTransactions] = useState<CieloTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<CieloConfig>({
    merchantId: '',
    merchantKey: '',
    apiUrl: 'https://api.cieloecommerce.cielo.com.br',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState('');
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    loadTransactions();
    loadConfig();
  }, [startDate, endDate]);

  const loadConfig = async () => {
    const savedConfig = await getCieloConfig();
    if (savedConfig) {
      setConfigForm(savedConfig);
    }
    const hasConfigValue = await hasCieloConfig();
    setHasConfig(hasConfigValue);
  };

  const handleSaveConfig = async () => {
    try {
      if (!configForm.merchantId.trim() || !configForm.merchantKey.trim()) {
        setConfigError('Merchant ID e Merchant Key são obrigatórios');
        return;
      }

      await saveCieloConfig(configForm);
      setConfigSaved(true);
      setConfigError('');
      await loadConfig(); // Atualizar estado de configuração
      
      // Recarregar transações após salvar configuração
      setTimeout(() => {
        loadTransactions();
        setConfigSaved(false);
      }, 2000);
    } catch (error) {
      setConfigError('Erro ao salvar configuração. Tente novamente.');
      console.error('Erro ao salvar configuração Cielo:', error);
    }
  };

  const handleDeleteConfig = async () => {
    if (window.confirm('Tem certeza que deseja remover as credenciais da API Cielo?')) {
      deleteCieloConfig();
      setConfigForm({
        merchantId: '',
        merchantKey: '',
        apiUrl: 'https://api.cieloecommerce.cielo.com.br',
      });
      setHasConfig(false);
      setShowConfigModal(false);
      loadTransactions();
    }
  };

  const openConfigModal = async () => {
    await loadConfig();
    setShowConfigModal(true);
    setConfigError('');
    setConfigSaved(false);
  };

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await getCieloTransactions(startDate || undefined, endDate || undefined);
      setTransactions(data);
    } catch (error) {
      console.error('Erro ao carregar transações Cielo:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    // Cielo retorna valores em centavos
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value / 100);
  };

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
          <h1 className="text-3xl font-bold text-black mb-2">Transações Cielo</h1>
          <p className="text-gray-600">Visualize transações e status de pagamentos em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin() && (
            <button
              onClick={openConfigModal}
              className="bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors flex items-center"
            >
              <Settings className="w-5 h-5 mr-2" />
              Configurar API
            </button>
          )}
          <button
            onClick={loadTransactions}
            className="bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtros de Data */}
      <div className="bg-white border-2 border-black rounded-lg p-4">
        <div className="flex items-center mb-4">
          <Calendar className="w-5 h-5 mr-2 text-black" />
          <h3 className="text-lg font-semibold text-black">Filtros de Data</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-black mb-2">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-2">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="w-full bg-gray-200 text-black px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Total de Transações</p>
          <p className="text-2xl font-bold text-black">{transactions.length}</p>
        </div>
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Valor Total</p>
          <p className="text-2xl font-bold text-black">
            {formatCurrency(
              transactions.reduce((sum, t) => sum + t.Payment.Amount, 0)
            )}
          </p>
        </div>
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Transações Aprovadas</p>
          <p className="text-2xl font-bold text-green-600">
            {transactions.filter((t) => t.Payment.Status === 2).length}
          </p>
        </div>
        <div className="bg-white border-2 border-black rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Transações Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">
            {transactions.filter((t) => t.Payment.Status === 12).length}
          </p>
        </div>
      </div>

      {/* Tabela de Transações */}
      <div className="bg-white border-2 border-black rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black text-white">
                <th className="text-left py-4 px-6 font-semibold">ID da Transação</th>
                <th className="text-left py-4 px-6 font-semibold">Cliente</th>
                <th className="text-left py-4 px-6 font-semibold">Tipo</th>
                <th className="text-left py-4 px-6 font-semibold">Valor</th>
                <th className="text-left py-4 px-6 font-semibold">Status</th>
                <th className="text-left py-4 px-6 font-semibold">Método</th>
                <th className="text-left py-4 px-6 font-semibold">Data</th>
                <th className="text-left py-4 px-6 font-semibold">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    Nenhuma transação encontrada
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.PaymentId} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-4 px-6 text-gray-700 font-mono text-sm">
                      {transaction.PaymentId}
                    </td>
                    <td className="py-4 px-6 text-gray-700">{transaction.Customer.Name}</td>
                    <td className="py-4 px-6 text-gray-700">{transaction.Payment.Type}</td>
                    <td className="py-4 px-6 font-semibold text-black">
                      {formatCurrency(transaction.Payment.Amount)}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          transaction.Payment.Status === 2
                            ? 'bg-green-100 text-green-800'
                            : transaction.Payment.Status === 12
                            ? 'bg-yellow-100 text-yellow-800'
                            : transaction.Payment.Status === 3
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {getCieloPaymentStatus(transaction.Payment.Status)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-700">
                      {transaction.Payment.CreditCard ? (
                        <div>
                          <div className="font-semibold">{transaction.Payment.CreditCard.Brand}</div>
                          <div className="text-xs text-gray-500">
                            {transaction.Payment.CreditCard.Number}
                          </div>
                        </div>
                      ) : (
                        transaction.Payment.Type
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-700">
                      {format(new Date(transaction.CreatedDate), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="py-4 px-6 text-gray-700 text-sm">
                      {transaction.Payment.ReturnMessage}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Informações sobre Integração */}
      <div className={`border-2 rounded-lg p-4 ${hasConfig ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start">
          {hasConfig ? (
            <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
          ) : (
            <CreditCard className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="font-semibold mb-1" style={{ color: hasConfig ? '#065f46' : '#1e3a8a' }}>
              {hasConfig ? 'API Cielo Configurada' : 'Integração com API Cielo'}
            </h3>
            <p className="text-sm" style={{ color: hasConfig ? '#047857' : '#1e40af' }}>
              {hasConfig ? (
                <>
                  As credenciais da API Cielo estão configuradas. O sistema está conectado à API real.
                  {isAdmin() && (
                    <span className="ml-2">
                      Clique em "Configurar API" para alterar as credenciais.
                    </span>
                  )}
                </>
              ) : (
                <>
                  {isAdmin() ? (
                    <>
                      Configure as credenciais da API Cielo clicando no botão "Configurar API" acima.
                      Você também pode configurar via variáveis de ambiente{' '}
                      <code className="bg-blue-100 px-1 rounded">VITE_CIELO_MERCHANT_ID</code> e{' '}
                      <code className="bg-blue-100 px-1 rounded">VITE_CIELO_MERCHANT_KEY</code> no arquivo{' '}
                      <code className="bg-blue-100 px-1 rounded">.env</code>.
                    </>
                  ) : (
                    'Entre em contato com o administrador para configurar a integração com a API Cielo.'
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Configuração da API */}
      {showConfigModal && isAdmin() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-black flex items-center">
                <Settings className="w-6 h-6 mr-2" />
                Configuração da API Cielo
              </h2>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setConfigError('');
                  setConfigSaved(false);
                }}
                className="text-gray-500 hover:text-black transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {configSaved && (
              <div className="mb-4 p-3 bg-green-100 border-2 border-green-500 rounded-lg flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <p className="text-green-800 font-semibold">Configuração salva com sucesso!</p>
              </div>
            )}

            {configError && (
              <div className="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded-lg flex items-center">
                <XCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-red-800 font-semibold">{configError}</p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveConfig();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  URL da API Cielo
                </label>
                <input
                  type="text"
                  value={configForm.apiUrl || 'https://api.cieloecommerce.cielo.com.br'}
                  onChange={(e) => setConfigForm({ ...configForm, apiUrl: e.target.value })}
                  placeholder="https://api.cieloecommerce.cielo.com.br"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL padrão da API Cielo. Altere apenas se necessário.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Merchant ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={configForm.merchantId}
                  onChange={(e) => setConfigForm({ ...configForm, merchantId: e.target.value })}
                  placeholder="Seu Merchant ID da Cielo"
                  required
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Identificador único do estabelecimento na Cielo
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Merchant Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={configForm.merchantKey}
                    onChange={(e) => setConfigForm({ ...configForm, merchantKey: e.target.value })}
                    placeholder="Sua Merchant Key da Cielo"
                    required
                    className="w-full px-4 py-2 pr-12 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-black transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Chave de autenticação da API Cielo (mantida em segurança no navegador)
                </p>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Importante:</strong> As credenciais são armazenadas localmente no navegador.
                  Certifique-se de que apenas pessoas autorizadas tenham acesso a este computador.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  Salvar Configuração
                </button>
                {hasConfig && (
                  <button
                    type="button"
                    onClick={handleDeleteConfig}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowConfigModal(false);
                    setConfigError('');
                    setConfigSaved(false);
                  }}
                  className="px-6 py-3 bg-gray-200 text-black rounded-lg font-semibold hover:bg-gray-300 transition-colors"
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

export default CieloTransactions;

