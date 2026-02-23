import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Bi from '@/components/Bi';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">HACCP eQMS</h1>
          <p className="text-gray-500 mt-2">FDCS 品質管理系統</p>
          <p className="text-gray-500 mt-2">又是用AI手搓的，不要在意細節</p>
        </div>

        {/* Login card */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-800 mb-6"><Bi k="page.login.title" /></h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="label">
                <Bi k="page.login.username" />
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="請輸入帳號"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                <Bi k="page.login.password" />
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="請輸入密碼"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  登入中...
                </>
              ) : (
                <Bi k="btn.login" />
              )}
            </button>
          </form>

          {/* Seed user hints for development */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2"><Bi k="page.login.testAccounts" />：</p>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => { setUsername('operator1'); setPassword('password123'); }}
                className="p-1.5 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
              >
                操作員
              </button>
              <button
                type="button"
                onClick={() => { setUsername('qa1'); setPassword('password123'); }}
                className="p-1.5 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
              >
                品管
              </button>
              <button
                type="button"
                onClick={() => { setUsername('manager1'); setPassword('password123'); }}
                className="p-1.5 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
              >
                經理
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
