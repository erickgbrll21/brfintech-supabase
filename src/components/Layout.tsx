import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  CreditCard, 
  LogOut,
  Menu,
  X,
  History
} from 'lucide-react';
import { useState } from 'react';

const Layout = () => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const { isCustomer } = useAuth();
  
  const navItems = [
    // Dashboard apenas para clientes
    ...(isCustomer() ? [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ] : []),
    ...(isAdmin() ? [
      { path: '/users', label: 'Usuários', icon: Users },
      { path: '/customers', label: 'Clientes', icon: Building2 },
    ] : []),
    { path: '/transfers', label: 'Histórico de Repasses', icon: History },
    ...(isAdmin() || !isCustomer() ? [
      { path: '/cielo', label: 'API', icon: CreditCard },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-56 lg:w-64 md:flex-col md:fixed md:inset-y-0 bg-black text-white">
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4 mb-8">
            <div className="bg-white p-2 rounded-lg mr-3 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img 
                src="/logo.svg" 
                alt="BR FINTECH Logo" 
                className="h-16 w-auto object-contain max-w-full"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold">BR FINTECH</h1>
              <p className="text-xs text-gray-400">Dashboard</p>
            </div>
          </div>

          <nav className="mt-5 flex-1 px-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white text-black'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
            <div className="flex-shrink-0 w-full group block">
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {user?.email}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {user?.role === 'admin' ? 'Administrador' : user?.role === 'customer' ? 'Cliente' : 'Usuário'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile menu button */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <img 
            src="/logo.svg" 
            alt="BR FINTECH Logo" 
            className="h-12 w-auto mr-2 object-contain"
          />
          <h1 className="text-lg font-bold">BR FINTECH</h1>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black text-white">
          <div className="flex flex-col h-full pt-16">
            <nav className="flex-1 px-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white text-black'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-gray-700 p-4">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                {user?.role === 'admin' ? 'Administrador' : user?.role === 'customer' ? 'Cliente' : 'Usuário'}
              </p>
              <button
                onClick={handleLogout}
                className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="md:pl-56 lg:pl-64 flex flex-col flex-1 w-full">
        <main className="flex-1 p-3 md:p-4 lg:p-6 xl:p-8 pt-20 md:pt-4 lg:pt-6 xl:pt-8 w-full max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

