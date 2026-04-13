import { useState } from 'react';
import api from '../api/client.js';

const inputCls = [
  'w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl',
  'px-3.5 py-2.5 placeholder-zinc-600',
  'focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15',
  'transition-all duration-150',
].join(' ');

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="1" y="1" width="26" height="26" rx="7" stroke="url(#lg)" strokeWidth="1.5"/>
      <path d="M7 14h14M7 9.5h14M7 18.5h9" stroke="url(#lg2)" strokeWidth="1.5" strokeLinecap="round"/>
      <defs>
        <linearGradient id="lg" x1="1" y1="1" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa"/>
          <stop offset="1" stopColor="#6366f1"/>
        </linearGradient>
        <linearGradient id="lg2" x1="7" y1="9" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa"/>
          <stop offset="1" stopColor="#818cf8"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function AppLogin({ mode, onLogin }) {
  const isSetup = mode === 'setup';
  const [tab,      setTab]      = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const switchTab = (t) => { setTab(t); setUsername(''); setPassword(''); setConfirm(''); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isRegister && password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const endpoint = isSetup ? '/auth/setup' : tab === 'register' ? '/auth/register' : '/auth/login';
      const res = await api.post(endpoint, { username: username.trim(), password });
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  const isRegister = !isSetup && tab === 'register';

  return (
    <div className="min-h-full bg-[#09090b] dot-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-[360px] relative z-10">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#111113] border border-white/[0.08] flex items-center justify-center mx-auto mb-5 shadow-card">
            <LogoMark />
          </div>
          <h1 className="text-zinc-100 text-xl font-semibold tracking-tight mb-1">DB Studio</h1>
          <p className="text-zinc-500 text-sm">
            {isSetup ? 'Create your admin account' : isRegister ? 'Create a new account' : 'Sign in to your workspace'}
          </p>
        </div>

        {/* Setup notice */}
        {isSetup && (
          <div className="flex items-start gap-3 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl px-4 py-3 mb-5">
            <svg className="text-amber-400 shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 12H1L7 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <p className="text-amber-400/90 text-xs leading-relaxed">
              First-time setup — this admin account manages all users and database connections.
            </p>
          </div>
        )}

        {/* Tab switcher */}
        {!isSetup && (
          <div className="flex bg-[#111113] border border-white/[0.07] rounded-xl p-1 mb-4">
            {[['login', 'Sign in'], ['register', 'Register']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => switchTab(key)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                  tab === key
                    ? 'bg-gradient-violet text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Card */}
        <div className="bg-[#111113] border border-white/[0.07] rounded-2xl p-6 shadow-card space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="Enter username"
                required
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                autoComplete={isRegister || isSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder={isRegister || isSetup ? 'At least 8 characters' : 'Enter password'}
                required
                className={inputCls}
              />
            </div>

            {(isRegister || isSetup) && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(''); }}
                  placeholder="Re-enter password"
                  required
                  className={inputCls}
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-2.5">
                <svg className="text-red-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M6.5 4v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {isRegister && (
              <p className="text-zinc-600 text-xs leading-relaxed">
                New accounts have <span className="text-zinc-500 font-medium">user</span> role. An admin must grant access to database connections.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-sm mt-1"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" />
                  Please wait…
                </>
              ) : (
                isSetup ? 'Create admin account' : isRegister ? 'Create account' : 'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
