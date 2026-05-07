import { useState, useEffect } from 'react';
import api from '../api/client.js';
import LoginForm from './LoginForm.jsx';

const DB_LABEL = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', sqlite: 'SQLite' };
const DB_COLOR = { mysql: '#fb923c', mariadb: '#fb923c', postgres: '#38bdf8', postgresql: '#38bdf8', sqlite: '#4ade80' };
const PERM_STYLE = {
  full:  'bg-violet-500/10 text-violet-300 border-violet-500/25',
  write: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  read:  'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="16" height="16" rx="4.5" stroke="url(#cp-lg)" strokeWidth="1.4"/>
      <path d="M4.5 9h9M4.5 6h9M4.5 12h5.5" stroke="url(#cp-lg2)" strokeWidth="1.4" strokeLinecap="round"/>
      <defs>
        <linearGradient id="cp-lg" x1="1" y1="1" x2="17" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#6366f1"/>
        </linearGradient>
        <linearGradient id="cp-lg2" x1="4" y1="6" x2="14" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#818cf8"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ConnectionPicker({ user, onConnect, onAdmin, onPlatform, onLogout, onClose }) {
  const [connections, setConnections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [connecting,  setConnecting]  = useState(null);
  const [error,       setError]       = useState('');
  const [tab,         setTab]         = useState('shared');

  const isAdmin = user.role === 'org_admin';

  useEffect(() => {
    api.get('/my/connections')
      .then(res => setConnections(res.data.connections || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load connections.'))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async (id) => {
    setConnecting(id); setError('');
    try {
      const res = await api.post(`/my/connections/${id}/connect`);
      onConnect({ connId: id, dbInfo: res.data.dbInfo, dbPermission: res.data.dbPermission, tables: res.data.tables || [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Connection failed.');
      setConnecting(null);
    }
  };

  const handleDirectConnect = (dbInfo, dbPermission, tables, connId) => {
    onConnect({ connId: connId || '__direct__', dbInfo, dbPermission: dbPermission || 'full', tables: tables || [] });
  };

  return (
    <div className="min-h-full bg-base dot-grid flex flex-col">
      {/* Navbar */}
      <nav className="h-12 bg-surface border-b border-zinc-800 flex items-center justify-between px-5 shrink-0">
        <span className="text-zinc-100 font-semibold text-sm flex items-center gap-2.5">
          <LogoMark /> DB Studio
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>
          {isAdmin && onAdmin && (
            <button
              onClick={onAdmin}
              className="text-xs text-zinc-500 hover:text-violet-300 px-2.5 py-1.5 rounded-lg hover:bg-violet-500/10 border border-transparent hover:border-violet-500/20 transition-all font-medium"
            >
              Admin Panel
            </button>
          )}
          {onPlatform && (
            <button
              onClick={onPlatform}
              className="text-xs text-zinc-500 hover:text-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all font-medium"
            >
              Platform
            </button>
          )}
          {onClose ? (
            <button
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/15 border border-transparent hover:border-zinc-800 transition-all font-medium"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onLogout}
              className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium"
            >
              Log out
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 flex items-start justify-center p-8 pt-14">
        <div className="w-full max-w-[520px]">

          {/* Header */}
          <div className="mb-7">
            <h2 className="text-zinc-100 text-2xl font-semibold tracking-tight mb-1.5">Choose a connection</h2>
            <p className="text-zinc-500 text-sm">Select a database to start exploring.</p>
          </div>

          {/* Tabs — admin only */}
          {isAdmin && (
            <div className="flex gap-1 mb-6 border-b border-zinc-800">
              {[['shared', 'Shared'], ['direct', 'Direct Connect']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-all ${
                    tab === key
                      ? 'border-violet-500 text-violet-400'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === 'shared' && (
            <>
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs mb-5">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M6.5 4v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-3 text-zinc-600 text-sm py-6">
                  <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
                  Loading connections…
                </div>
              )}

              {!loading && connections.length === 0 && !error && (
                <div className="text-center py-16 bg-surface border border-zinc-800 rounded-2xl">
                  <div className="w-12 h-12 rounded-2xl bg-raised border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-zinc-600">
                      <path d="M11 3C7 3 4 5.5 4 8.5s3 5.5 7 5.5 7-2.5 7-5.5S15 3 11 3z" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M4 8.5v5C4 16.5 7 19 11 19s7-2.5 7-5.5v-5" stroke="currentColor" strokeWidth="1.4"/>
                    </svg>
                  </div>
                  <p className="text-zinc-400 text-sm font-medium mb-1">No connections available</p>
                  <p className="text-zinc-600 text-xs max-w-xs mx-auto">
                    {isAdmin ? 'Create connections in the Admin Panel, then grant access to users.' : 'Ask your admin to share a connection with you.'}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={onAdmin}
                      className="mt-5 text-xs px-4 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-lg font-medium transition-all"
                    >
                      Open Admin Panel
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2.5">
                {connections.map(conn => {
                  const dotColor = DB_COLOR[conn.type] || '#71717a';
                  return (
                    <div
                      key={conn.id}
                      className="group bg-surface border border-zinc-800 hover:border-zinc-700 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all duration-150"
                    >
                      {/* DB dot */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${dotColor}18`, border: `1px solid ${dotColor}30` }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}80` }} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-zinc-100 text-sm font-medium truncate">{conn.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.09] text-zinc-500 rounded-md border border-zinc-800 uppercase tracking-wide font-medium shrink-0">
                            {DB_LABEL[conn.type] || conn.type}
                          </span>
                        </div>
                        <p className="text-zinc-600 text-xs font-mono truncate">
                          {conn.database_name}
                        </p>
                      </div>

                      {/* Permission */}
                      {conn.permission && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide shrink-0 ${PERM_STYLE[conn.permission] || PERM_STYLE.read}`}>
                          {conn.permission}
                        </span>
                      )}

                      {/* Connect button */}
                      <button
                        onClick={() => handleConnect(conn.id)}
                        disabled={connecting === conn.id}
                        className="text-xs px-4 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5"
                      >
                        {connecting === conn.id ? (
                          <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Connecting…</>
                        ) : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'direct' && isAdmin && (
            <div className="bg-surface border border-zinc-800 rounded-2xl p-5">
              <LoginForm onConnect={handleDirectConnect} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
