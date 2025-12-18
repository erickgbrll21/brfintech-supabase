import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, User } from 'lucide-react';

const Login = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(emailOrUsername, password);
      if (success) {
        navigate('/');
      } else {
        setError('Email/Usuário ou senha incorretos. Verifique suas credenciais e tente novamente.');
      }
    } catch (err: any) {
      console.error('Erro no login:', err);
      setError(err?.message || 'Erro ao fazer login. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src="/logo.svg" 
              alt="BR FINTECH Logo" 
              className="h-32 w-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-black mb-2">BR FINTECH</h1>
          <p className="text-gray-600">Dashboard de Vendas</p>
        </div>

        <div className="bg-white border-2 border-black rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-semibold text-black mb-6">Login</h2>

          {/* Informações de acesso */}
          <div className="mb-6 space-y-3">
            <div className="flex items-start p-3 bg-black text-white rounded-lg">
              <Shield className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Acesso Administrativo</p>
                <p className="text-xs text-gray-300 mt-1">
                  Use seu email para fazer login como administrador
                </p>
              </div>
            </div>
            <div className="flex items-start p-3 bg-gray-100 rounded-lg">
              <User className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0 text-gray-600" />
              <div>
                <p className="font-semibold text-sm text-gray-700">Acesso Cliente</p>
                <p className="text-xs text-gray-600 mt-1">
                  Use seu nome de usuário para fazer login como cliente
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="emailOrUsername" className="block text-sm font-medium text-black mb-2">
                Email ou Usuário
              </label>
              <input
                id="emailOrUsername"
                type="text"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                required
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                placeholder="seu@email.com ou seu_usuario"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use seu email para acesso administrativo ou seu nome de usuário para acesso como cliente
              </p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-black mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

