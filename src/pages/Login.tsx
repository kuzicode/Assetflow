import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const { setAuthState } = useStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setAuthState({ mode: 'admin', token: result.token });
      navigate('/');
    } catch (error: any) {
      setError(error.message || '连接失败，请检查服务器');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    setAuthState({ mode: 'guest', token: null });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-surface overflow-hidden flex items-center justify-center relative">

      {/* Background orbs */}
      <div
        className="absolute rounded-full animate-pulse pointer-events-none"
        style={{ width: 500, height: 500, top: -80, left: -80, background: 'var(--color-primary-fixed)', filter: 'blur(80px)', opacity: 0.4, zIndex: 0 }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 400, height: 400, bottom: 0, right: -80, background: 'var(--color-secondary-fixed)', filter: 'blur(80px)', opacity: 0.4, zIndex: 0, animationDelay: '2s' }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 300, height: 300, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-primary-fixed-dim)', filter: 'blur(80px)', opacity: 0.08, zIndex: 0 }}
      />

      <main className="relative w-full max-w-md px-8 py-16 flex flex-col items-center z-10">

        {/* Brand */}
        <header className="text-center mb-20 space-y-4">
          <h1 className="font-headline text-5xl font-bold tracking-tight text-primary">Assetflow</h1>
          <p className="text-on-surface-variant tracking-widest font-light text-sm uppercase">加密货币数据看板</p>
        </header>

        {/* Login section */}
        <section className="w-full space-y-12">

          {/* Admin form */}
          <form onSubmit={handleAdminLogin} className="space-y-8">
            <div className="relative group">
              {/* Lock icon */}
              <div className="absolute inset-y-0 left-0 flex items-center pl-1 pointer-events-none text-outline">
                <span className="material-symbols-outlined">lock</span>
              </div>

              {/* Password input — underline style */}
              <input
                className="block w-full bg-transparent border-0 border-b-2 border-outline-variant py-4 pl-10 pr-12 text-on-surface focus:ring-0 focus:border-primary transition-all duration-500 placeholder:text-outline-variant placeholder:font-light text-lg tracking-widest outline-none"
                placeholder="输入管理密码"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />

              {/* Eye toggle */}
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-1 text-outline hover:text-primary transition-colors duration-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                <span className="material-symbols-outlined text-sm">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {error && (
              <p className="text-error text-sm font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-medium rounded-full shadow-[0px_8px_24px_rgba(0,105,72,0.15)] hover:shadow-[0px_12px_32px_rgba(133,248,196,0.3)] transition-all duration-500 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{loading ? '验证中...' : '管理员登录'}</span>
              {!loading && (
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              )}
            </button>
          </form>

          {/* Observer / guest access */}
          <div className="flex flex-col items-center space-y-4 pt-6">
            <div className="h-px w-12 bg-outline-variant/30" />
            <button
              onClick={handleGuest}
              className="text-on-surface-variant hover:text-primary font-light tracking-wide transition-colors duration-300 flex items-center gap-2 px-6 py-2 rounded-full hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">visibility</span>
              <span className="text-sm">以观察者身份进入</span>
            </button>
          </div>
        </section>

        {/* Decorative footer */}
        <footer className="mt-32 opacity-30 flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-headline uppercase tracking-tighter">Security Grade</span>
            <span className="text-[10px] font-headline uppercase tracking-tighter">Local Only</span>
          </div>
          <div className="w-px h-8 bg-on-surface" />
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-headline uppercase tracking-tighter text-primary">Assetflow</span>
            <span className="text-[10px] font-headline uppercase tracking-tighter text-primary">Pristine Architecture</span>
          </div>
        </footer>

      </main>
    </div>
  );
}
