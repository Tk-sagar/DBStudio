import { useState } from 'react';
import api from '../api/client.js';
import SavedConnections from './SavedConnections.jsx';

const STORAGE_KEY = 'dbadmin_connections';
function loadConnections() {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function persistConnections(conns) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

const DB_DEFAULTS = {
  mysql:    { port: '3306', host: 'localhost', username: 'root' },
  mariadb:  { port: '3306', host: 'localhost', username: 'root' },
  postgres: { port: '5432', host: 'localhost', username: 'postgres' },
  sqlite:   { port: '',     host: '',          username: '' },
};

function autoName(form) {
  if (form.type === 'sqlite') {
    const parts = form.database.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || form.database;
  }
  return `${form.username}@${form.host}/${form.database}`;
}

const inputCls = 'w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all';
const labelCls = 'block text-xs font-medium text-zinc-400 mb-1.5';

export default function LoginForm({ onConnect }) {
  const [form, setForm] = useState({
    type: 'mysql', host: 'localhost', port: '3306',
    username: 'root', password: '', database: '',
  });
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [wantSave,     setWantSave]     = useState(false);
  const [wantSavePass, setWantSavePass] = useState(false);
  const [connName,     setConnName]     = useState('');
  const [savedConns,   setSavedConns]   = useState(loadConnections);

  const isSQLite = form.type === 'sqlite';

  const handleTypeChange = (e) => {
    const type = e.target.value;
    const d = DB_DEFAULTS[type] || {};
    setForm(prev => ({ ...prev, type, host: d.host ?? prev.host, port: d.port ?? prev.port, username: d.username ?? prev.username }));
    setError('');
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const saveConnectionEntry = (formData, name) => {
    const entry = {
      id: Date.now().toString(), name,
      type: formData.type, host: formData.host, port: formData.port,
      username: formData.username, savedPassword: wantSavePass ? formData.password : '',
      database: formData.database, savedAt: new Date().toISOString(),
    };
    const updated = [entry, ...savedConns.filter(c => c.name !== name)];
    setSavedConns(updated);
    persistConnections(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/connect', form);
      if (wantSave) saveConnectionEntry(form, connName.trim() || autoName(form));
      onConnect(res.data.dbInfo, res.data.dbPermission, res.data.tables);
    } catch (err) {
      setError(err.response?.data?.error || 'Connection failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSaved = (conn) => {
    setForm({ type: conn.type, host: conn.host || '', port: conn.port || '',
      username: conn.username || '', password: conn.savedPassword || '', database: conn.database });
    setConnName(conn.name);
    setWantSave(false);
    setError('');
  };

  const handleQuickConnect = async (conn) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/connect', { type: conn.type, host: conn.host, port: conn.port,
        username: conn.username, password: conn.savedPassword, database: conn.database });
      onConnect(res.data.dbInfo, res.data.dbPermission, res.data.tables);
    } catch (err) {
      handleSelectSaved(conn);
      setError(err.response?.data?.error || 'Quick connect failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSaved = (id) => {
    const updated = savedConns.filter(c => c.id !== id);
    setSavedConns(updated);
    persistConnections(updated);
  };

  return (
    <div className="space-y-4">
      <SavedConnections
        connections={savedConns}
        onSelect={handleSelectSaved}
        onQuickConnect={handleQuickConnect}
        onDelete={handleDeleteSaved}
      />

      {/* Form card */}
      <div className="bg-[#111113] border border-white/[0.07] rounded-2xl p-6 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* DB Type */}
          <div>
            <label className={labelCls}>Database type</label>
            <select name="type" value={form.type} onChange={handleTypeChange}
              className={inputCls + ' cursor-pointer'}>
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
              <option value="postgres">PostgreSQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>

          {isSQLite ? (
            <div>
              <label className={labelCls}>Database file path</label>
              <input type="text" name="database" value={form.database} onChange={handleChange}
                placeholder="/path/to/database.db" required className={inputCls} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <div>
                  <label className={labelCls}>Host</label>
                  <input type="text" name="host" value={form.host} onChange={handleChange}
                    placeholder="localhost" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" name="port" value={form.port} onChange={handleChange}
                    className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Username</label>
                <input type="text" name="username" value={form.username} onChange={handleChange}
                  placeholder="root" required className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Password</label>
                <input type="password" name="password" value={form.password} onChange={handleChange}
                  placeholder="••••••••" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Database</label>
                <input type="text" name="database" value={form.database} onChange={handleChange}
                  placeholder="my_database" required className={inputCls} />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-xl px-3.5 py-2.5 text-xs">
              {error}
            </div>
          )}

          {/* Save options */}
          <div className="border-t border-white/[0.07] pt-4 space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={wantSave} onChange={e => setWantSave(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-700 bg-[#0d0d10] accent-violet-500" />
              <span className="text-xs text-zinc-400 font-medium">Save this connection</span>
            </label>

            {wantSave && (
              <div className="ml-6 space-y-2.5">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Connection name</label>
                  <input type="text" value={connName} onChange={e => setConnName(e.target.value)}
                    placeholder={autoName(form) || 'My Production DB'}
                    className={inputCls + ' text-xs py-1.5'} />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={wantSavePass} onChange={e => setWantSavePass(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-700 bg-[#0d0d10] accent-violet-500" />
                  <span className="text-xs text-zinc-400">Save password locally</span>
                </label>
                {wantSavePass && (
                  <p className="text-[11px] text-amber-500/70 ml-6">
                    Password stored unencrypted in browser localStorage.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-all flex items-center justify-center gap-2">
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" />
                Connecting…
              </>
            ) : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
