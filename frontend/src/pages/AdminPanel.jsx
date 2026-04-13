import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const input   = 'w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-700 transition-all';
const select  = input + ' cursor-pointer';
const label   = 'block text-xs font-medium text-zinc-400 mb-1.5';
const btnPrim = 'flex-1 py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all';
const btnSec  = 'px-4 py-2.5 bg-[#1c1c1f] text-zinc-400 border border-white/[0.08] text-sm font-medium rounded-xl hover:bg-[#232329] hover:text-zinc-300 transition-all';

const DB_TYPES = ['mysql', 'mariadb', 'postgres', 'sqlite'];
const DB_LABEL = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', sqlite: 'SQLite' };
const DB_COLOR = { mysql: '#fb923c', mariadb: '#fb923c', postgres: '#38bdf8', postgresql: '#38bdf8', sqlite: '#4ade80' };
const PERM_STYLE = {
  full:  'bg-violet-500/10 text-violet-300 border-violet-500/25',
  write: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  read:  'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111113] border border-white/[0.09] rounded-2xl w-full max-w-md shadow-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <h3 className="text-zinc-100 text-sm font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all text-lg leading-none"
          >×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg, onDismiss }) {
  if (!msg) return null;
  return (
    <div className="flex items-center justify-between bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-xs mb-4">
      <span>{msg}</span>
      <button onClick={onDismiss} className="ml-3 text-red-600 hover:text-red-300 transition-colors leading-none">×</button>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${
      role === 'admin'
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
        : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
    }`}>{role}</span>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showAdd,  setShowAdd]  = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [tmpPwd,   setTmpPwd]   = useState(null);
  const [form,     setForm]     = useState({ username: '', password: '', role: 'user' });
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/users')
      .then(res => setUsers(res.data.users || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true); setFormErr('');
    try {
      await api.post('/admin/users', form);
      setShowAdd(false);
      setForm({ username: '', password: '', role: 'user' });
      load();
    } catch (err) {
      setFormErr(err.response?.data?.error || 'Failed to create user.');
    } finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true); setFormErr('');
    try {
      const body = {};
      if (editUser.role)     body.role     = editUser.role;
      if (editUser.password) body.password = editUser.password;
      await api.put(`/admin/users/${editUser.id}`, body);
      setEditUser(null);
      load();
    } catch (err) {
      setFormErr(err.response?.data?.error || 'Failed to update user.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  const handleTempPassword = async (id) => {
    if (!window.confirm("This resets the user's password immediately. Continue?")) return;
    try {
      const res = await api.post(`/admin/users/${id}/temp-password`);
      setTmpPwd(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate temp password.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-zinc-100 text-base font-semibold">Users</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{users.length} account{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setFormErr(''); }}
          className="text-xs px-3.5 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-xl font-medium transition-all flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Add user
        </button>
      </div>

      <ErrorBanner msg={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
          Loading…
        </div>
      ) : (
        <div className="bg-[#111113] border border-white/[0.07] rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Username</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Role</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                  <td className="px-5 py-3 text-zinc-200 font-mono font-medium">{u.username}</td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3 text-zinc-600">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => { setEditUser({ id: u.id, role: u.role, password: '' }); setFormErr(''); }}
                        className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] rounded-lg font-medium transition-all"
                      >Edit</button>
                      <button
                        onClick={() => handleTempPassword(u.id)}
                        className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-amber-500/10 text-zinc-500 hover:text-amber-400 border border-white/[0.08] hover:border-amber-500/25 rounded-lg font-medium transition-all"
                        title="Generate a temporary password"
                      >Reset Pwd</button>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-white/[0.08] hover:border-red-500/20 rounded-lg font-medium transition-all"
                        >Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-zinc-600 text-center text-sm">No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Temp password modal */}
      {tmpPwd && (
        <Modal title="Temporary Password" onClose={() => setTmpPwd(null)}>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm leading-relaxed">
              Password reset for <span className="text-zinc-200 font-mono font-semibold">{tmpPwd.username}</span>. Share this securely — it won't be shown again.
            </p>
            <div className="bg-[#0d0d10] border border-white/[0.08] rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
              <span className="text-violet-300 font-mono text-sm tracking-widest select-all">{tmpPwd.tempPassword}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(tmpPwd.tempPassword)}
                className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 text-white rounded-lg font-medium transition-all shrink-0"
              >Copy</button>
            </div>
            <p className="text-zinc-700 text-xs">The user should log in and change this password immediately.</p>
            <button type="button" onClick={() => setTmpPwd(null)} className={btnSec + ' w-full text-center'}>Done</button>
          </div>
        </Modal>
      )}

      {/* Add user modal */}
      {showAdd && (
        <Modal title="Add user" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={label}>Username</label>
              <input autoFocus className={input} value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="username" required />
            </div>
            <div>
              <label className={label}>Password</label>
              <input type="password" className={input} value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="At least 8 characters" required />
            </div>
            <div>
              <label className={label}>Role</label>
              <select className={select} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
            <div className="flex gap-2.5 pt-1">
              <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Creating…' : 'Create user'}</button>
              <button type="button" onClick={() => setShowAdd(false)} className={btnSec}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit user modal */}
      {editUser && (
        <Modal title="Edit user" onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className={label}>Role</label>
              <select className={select} value={editUser.role} onChange={e => setEditUser(p => ({ ...p, role: e.target.value }))}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className={label}>New password <span className="text-zinc-700 font-normal">(leave blank to keep current)</span></label>
              <input type="password" className={input} value={editUser.password}
                onChange={e => setEditUser(p => ({ ...p, password: e.target.value }))} placeholder="New password (optional)" />
            </div>
            <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
            <div className="flex gap-2.5 pt-1">
              <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditUser(null)} className={btnSec}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Grants sub-panel ──────────────────────────────────────────────────────────
function GrantsPanel({ conn, onClose }) {
  const [grants,  setGrants]  = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState({ userId: '', permission: 'read' });
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  const loadGrants = useCallback(() => {
    setLoading(true);
    Promise.all([api.get(`/admin/connections/${conn.id}/grants`), api.get('/admin/users')])
      .then(([gRes, uRes]) => { setGrants(gRes.data.grants || []); setUsers(uRes.data.users || []); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [conn.id]);

  useEffect(() => { loadGrants(); }, [loadGrants]);

  const grantedIds   = new Set(grants.map(g => g.user_id));
  const eligibleUsers = users.filter(u => !grantedIds.has(u.id));

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try {
      await api.post(`/admin/connections/${conn.id}/grants`, { userId: form.userId, permission: form.permission });
      setShowAdd(false); setForm({ userId: '', permission: 'read' }); loadGrants();
    } catch (err) { setFormErr(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handlePermChange = async (userId, permission) => {
    try { await api.put(`/admin/connections/${conn.id}/grants/${userId}`, { permission }); loadGrants(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  const handleRevoke = async (userId) => {
    if (!window.confirm('Revoke access for this user?')) return;
    try { await api.delete(`/admin/connections/${conn.id}/grants/${userId}`); loadGrants(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  return (
    <div className="mt-3 bg-[#0d0d10] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <span className="text-zinc-300 text-xs font-semibold">Access grants</span>
          <p className="text-zinc-700 text-[10px] mt-0.5">{grants.length} user{grants.length !== 1 ? 's' : ''} with access</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAdd(true); setFormErr(''); }}
            disabled={eligibleUsers.length === 0}
            className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-40 text-white rounded-lg font-medium transition-all"
          >+ Grant</button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all text-lg leading-none">×</button>
        </div>
      </div>

      <div className="p-3">
        <ErrorBanner msg={error} onDismiss={() => setError('')} />
        {loading ? (
          <p className="text-zinc-600 text-xs py-2">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-zinc-700 text-xs py-2">No grants yet — click + Grant to share this connection.</p>
        ) : (
          <div className="space-y-1.5">
            {grants.map(g => (
              <div key={g.id} className="flex items-center gap-3 bg-[#111113] border border-white/[0.07] rounded-xl px-3.5 py-2.5">
                <span className="text-zinc-200 text-xs font-mono font-medium flex-1 truncate">{g.username}</span>
                <RoleBadge role={g.role} />
                <select
                  value={g.permission}
                  onChange={e => handlePermChange(g.user_id, e.target.value)}
                  className="bg-[#0d0d10] border border-white/[0.08] text-zinc-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500/40 cursor-pointer"
                >
                  <option value="read">read</option>
                  <option value="write">write</option>
                  <option value="full">full</option>
                </select>
                <button onClick={() => handleRevoke(g.user_id)} className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0 font-medium">Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Grant access" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={label}>User</label>
              <select className={select} value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))} required>
                <option value="">— select user —</option>
                {eligibleUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Permission level</label>
              <select className={select} value={form.permission} onChange={e => setForm(p => ({ ...p, permission: e.target.value }))}>
                <option value="read">read — view data only</option>
                <option value="write">write — insert / update / delete rows</option>
                <option value="full">full — includes SQL editor</option>
              </select>
            </div>
            <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
            <div className="flex gap-2.5 pt-1">
              <button type="submit" disabled={saving || !form.userId} className={btnPrim}>{saving ? 'Granting…' : 'Grant access'}</button>
              <button type="button" onClick={() => setShowAdd(false)} className={btnSec}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Connections Tab ───────────────────────────────────────────────────────────
function ConnectionsTab() {
  const [connections, setConnections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showAdd,     setShowAdd]     = useState(false);
  const [editConn,    setEditConn]    = useState(null);
  const [grantsConn,  setGrantsConn]  = useState(null);
  const [testing,     setTesting]     = useState(null);
  const [testResult,  setTestResult]  = useState({});
  const [saving,      setSaving]      = useState(false);
  const [formErr,     setFormErr]     = useState('');

  const emptyForm = { name: '', type: 'mysql', host: 'localhost', port: '3306', username: '', password: '', database: '' };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/connections')
      .then(res => setConnections(res.data.connections || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const isSQLite = t => t === 'sqlite';

  const handleTypeChange = (type) => {
    const defaults = { mysql: '3306', mariadb: '3306', postgres: '5432', sqlite: '' };
    setForm(p => ({ ...p, type, port: defaults[type] || '' }));
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try { await api.post('/admin/connections', form); setShowAdd(false); setForm(emptyForm); load(); }
    catch (err) { setFormErr(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try {
      const body = { ...editConn };
      if (!body.password) delete body.password;
      await api.put(`/admin/connections/${editConn.id}`, body);
      setEditConn(null); load();
    } catch (err) { setFormErr(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this connection? All grants will be removed.')) return;
    try { await api.delete(`/admin/connections/${id}`); if (grantsConn?.id === id) setGrantsConn(null); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  const handleTest = async (id) => {
    setTesting(id); setTestResult(p => ({ ...p, [id]: null }));
    try { await api.post(`/admin/connections/${id}/test`); setTestResult(p => ({ ...p, [id]: { ok: true, msg: 'Connected' } })); }
    catch (err) { setTestResult(p => ({ ...p, [id]: { ok: false, msg: err.response?.data?.error || 'Failed' } })); }
    finally { setTesting(null); }
  };

  const ConnForm = ({ values, onChange, onSubmit, submitLabel }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={label}>Connection name</label>
        <input className={input} value={values.name} onChange={e => onChange('name', e.target.value)} placeholder="My Database" required />
      </div>
      <div>
        <label className={label}>Type</label>
        <select className={select} value={values.type}
          onChange={e => { onChange('type', e.target.value); if (submitLabel === 'Create') handleTypeChange(e.target.value); }}>
          {DB_TYPES.map(t => <option key={t} value={t}>{DB_LABEL[t]}</option>)}
        </select>
      </div>
      {!isSQLite(values.type) && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={label}>Host</label>
              <input className={input} value={values.host} onChange={e => onChange('host', e.target.value)} placeholder="localhost" />
            </div>
            <div>
              <label className={label}>Port</label>
              <input className={input} value={values.port} onChange={e => onChange('port', e.target.value)} placeholder="3306" />
            </div>
          </div>
          <div>
            <label className={label}>Username</label>
            <input className={input} value={values.username} onChange={e => onChange('username', e.target.value)} placeholder="root" />
          </div>
          <div>
            <label className={label}>
              Password{submitLabel !== 'Create' && <span className="text-zinc-700 font-normal ml-1">(blank = unchanged)</span>}
            </label>
            <input type="password" className={input} value={values.password} onChange={e => onChange('password', e.target.value)}
              placeholder={submitLabel !== 'Create' ? 'Unchanged' : 'password'} />
          </div>
        </>
      )}
      <div>
        <label className={label}>{isSQLite(values.type) ? 'File path' : 'Database name'}</label>
        <input className={input} value={values.database} onChange={e => onChange('database', e.target.value)}
          placeholder={isSQLite(values.type) ? '/data/mydb.sqlite' : 'mydb'} required />
      </div>
      <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
      <div className="flex gap-2.5 pt-1">
        <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={() => { setShowAdd(false); setEditConn(null); }} className={btnSec}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-zinc-100 text-base font-semibold">Connections</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{connections.length} saved connection{connections.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setForm(emptyForm); setFormErr(''); }}
          className="text-xs px-3.5 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-xl font-medium transition-all flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Add connection
        </button>
      </div>

      <ErrorBanner msg={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
          Loading…
        </div>
      ) : connections.length === 0 && !showAdd ? (
        <div className="text-center py-16 bg-[#111113] border border-white/[0.07] rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-[#1c1c1f] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-zinc-700">
              <path d="M11 3C7 3 4 5.5 4 8.5s3 5.5 7 5.5 7-2.5 7-5.5S15 3 11 3z" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4 8.5v5C4 16.5 7 19 11 19s7-2.5 7-5.5v-5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </div>
          <p className="text-zinc-400 text-sm font-medium mb-1">No connections yet</p>
          <p className="text-zinc-600 text-xs">Add a connection and grant users access to it.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {connections.map(conn => {
            const dotColor = DB_COLOR[conn.type] || '#71717a';
            return (
              <div key={conn.id} className="bg-[#111113] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* DB icon */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${dotColor}18`, border: `1px solid ${dotColor}30` }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}80` }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-zinc-100 text-sm font-medium truncate">{conn.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.05] text-zinc-500 rounded-md border border-white/[0.07] uppercase tracking-wide font-medium shrink-0">
                        {DB_LABEL[conn.type] || conn.type}
                      </span>
                      {conn.grant_count > 0 && (
                        <span className="text-[10px] text-violet-400 font-medium shrink-0">{conn.grant_count} grant{conn.grant_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <p className="text-zinc-600 text-xs font-mono truncate">
                      {conn.host ? `${conn.host} / ${conn.database_name}` : conn.database_name}
                    </p>
                  </div>

                  {/* Test result */}
                  {testResult[conn.id] && (
                    <span className={`text-xs shrink-0 font-medium ${testResult[conn.id].ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult[conn.id].ok ? '✓' : '✗'} {testResult[conn.id].msg}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setGrantsConn(grantsConn?.id === conn.id ? null : conn)}
                      className={`text-xs px-2.5 py-1 border rounded-lg font-medium transition-all ${
                        grantsConn?.id === conn.id
                          ? 'bg-violet-500/12 text-violet-300 border-violet-500/25'
                          : 'bg-[#1c1c1f] text-zinc-400 hover:text-zinc-200 border-white/[0.08] hover:bg-[#232329]'
                      }`}
                    >Grants</button>
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testing === conn.id}
                      className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] rounded-lg font-medium transition-all disabled:opacity-50"
                    >{testing === conn.id ? 'Testing…' : 'Test'}</button>
                    <button
                      onClick={() => { setEditConn({ id: conn.id, name: conn.name, type: conn.type, host: conn.host || '', port: conn.port ? String(conn.port) : '', username: conn.db_username || '', password: '', database: conn.database_name }); setFormErr(''); }}
                      className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] rounded-lg font-medium transition-all"
                    >Edit</button>
                    <button
                      onClick={() => handleDelete(conn.id)}
                      className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-white/[0.08] hover:border-red-500/20 rounded-lg font-medium transition-all"
                    >Delete</button>
                  </div>
                </div>

                {grantsConn?.id === conn.id && (
                  <div className="border-t border-white/[0.06] px-5 pb-4">
                    <GrantsPanel conn={conn} onClose={() => setGrantsConn(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="New connection" onClose={() => setShowAdd(false)}>
          <ConnForm values={form} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))} onSubmit={handleAdd} submitLabel="Create" />
        </Modal>
      )}
      {editConn && (
        <Modal title="Edit connection" onClose={() => setEditConn(null)}>
          <ConnForm values={editConn} onChange={(k, v) => setEditConn(p => ({ ...p, [k]: v }))} onSubmit={handleEdit} submitLabel="Save changes" />
        </Modal>
      )}
    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel({ user, onClose, onLogout }) {
  const [tab, setTab] = useState('users');

  return (
    <div className="min-h-full bg-[#09090b] flex flex-col">
      {/* Navbar */}
      <nav className="h-12 bg-[#111113] border-b border-white/[0.07] flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1.5 transition-all hover:bg-white/[0.05] px-2 py-1.5 rounded-lg"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
          <span className="w-px h-4 bg-white/[0.07]" />
          <span className="text-zinc-200 text-sm font-semibold">Admin Panel</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>
          <button
            onClick={onLogout}
            className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium"
          >Log out</button>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl mx-auto w-full px-8 py-8">
        {/* Page title */}
        <div className="mb-7">
          <h1 className="text-zinc-100 text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-zinc-600 text-sm mt-1">Manage users, connections, and access grants.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-7 border-b border-white/[0.07]">
          {[['users', 'Users'], ['connections', 'Connections']].map(([key, label_]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-all ${
                tab === key
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >{label_}</button>
          ))}
        </div>

        {tab === 'users'       && <UsersTab currentUserId={user.id} />}
        {tab === 'connections' && <ConnectionsTab />}
      </div>
    </div>
  );
}
