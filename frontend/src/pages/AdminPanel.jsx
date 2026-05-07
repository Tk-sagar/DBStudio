import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

function EyeIcon({ open }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 7.5s2.5-4.5 6-4.5 6 4.5 6 4.5-2.5 4.5-6 4.5-6-4.5-6-4.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 7.5s2.5-4.5 6-4.5 6 4.5 6 4.5-2.5 4.5-6 4.5-6-4.5-6-4.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M2 2l11 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  );
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

const input   = 'w-full bg-base border border-zinc-800 text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-500 transition-all';
const select  = input + ' cursor-pointer';
const label   = 'block text-xs font-medium text-zinc-400 mb-1.5';
const btnPrim = 'flex-1 py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all';
const btnSec  = 'px-4 py-2.5 bg-raised text-zinc-400 border border-zinc-800 text-sm font-medium rounded-xl hover:bg-overlay hover:text-zinc-300 transition-all';

const DB_TYPES = ['mysql', 'mariadb', 'postgres', 'sqlite'];
const DB_LABEL = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', sqlite: 'SQLite' };
const DB_COLOR = { mysql: '#fb923c', mariadb: '#fb923c', postgres: '#38bdf8', postgresql: '#38bdf8', sqlite: '#4ade80' };
const PERM_STYLE = {
  full:  'bg-violet-500/10 text-violet-300 border-violet-500/25',
  write: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  read:  'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-zinc-700/60 rounded-2xl w-full max-w-md shadow-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="text-zinc-100 text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all text-lg leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg, onDismiss }) {
  if (!msg) return null;
  return (
    <div className="flex items-center justify-between bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-xs mb-4">
      <span>{msg}</span>
      <button onClick={onDismiss} className="ml-3 text-red-600 hover:text-red-300 transition-colors leading-none">×</button>
    </div>
  );
}

function RoleBadge({ role }) {
  const styles = {
    org_admin: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    user:         'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  };
  const labels = { org_admin: 'Admin', user: 'Member' };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${styles[role] || styles.user}`}>
      {labels[role] || role}
    </span>
  );
}

// ── Tenant info bar ───────────────────────────────────────────────────────────
function TenantInfoBar() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api.get('/admin/tenant').then(r => setInfo(r.data.tenant)).catch(() => {});
  }, []);

  if (!info) return null;

  const planStyle = info.plan === 'pro'
    ? 'bg-violet-500/10 text-violet-400 border-violet-500/25'
    : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';

  return (
    <div className="flex items-center gap-4 bg-surface border border-zinc-800 rounded-2xl px-5 py-4 mb-7">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-zinc-100 text-sm font-semibold truncate">{info.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${planStyle}`}>{info.plan}</span>
        </div>
        <p className="text-zinc-600 text-xs font-mono">{info.slug}</p>
        {info.email_domain && (
          <p className="text-zinc-600 text-xs mt-0.5">Allowed domain: <span className="text-zinc-400 font-mono">@{info.email_domain}</span></p>
        )}
      </div>
      <div className="flex items-center gap-5 text-xs text-right shrink-0">
        <div>
          <p className="text-zinc-100 font-semibold">{info.user_count}<span className="text-zinc-600">/{info.max_users}</span></p>
          <p className="text-zinc-600">users</p>
        </div>
        <div>
          <p className="text-zinc-100 font-semibold">{info.conn_count}<span className="text-zinc-600">/{info.max_connections}</span></p>
          <p className="text-zinc-600">connections</p>
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [editUser,   setEditUser]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState('');
  const [resetModal, setResetModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/users')
      .then(res => setUsers(res.data.users || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEdit = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try {
      const body = {};
      if (editUser.role)     body.role     = editUser.role;
      if (editUser.password) body.password = editUser.password;
      await api.put(`/admin/users/${editUser.id}`, body);
      setEditUser(null); load();
    } catch (err) { setFormErr(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try { await api.delete(`/admin/users/${id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const { id, password, isGenerated } = resetModal;
    setResetModal(p => ({ ...p, saving: true, error: '' }));
    try {
      await api.put(`/admin/users/${id}`, { password });
      setResetModal(p => ({ ...p, saving: false, done: true, generatedPwd: isGenerated ? password : null }));
    } catch (err) {
      setResetModal(p => ({ ...p, saving: false, error: err.response?.data?.error || 'Failed.' }));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-zinc-100 text-base font-semibold">Members</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <ErrorBanner msg={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />Loading…
        </div>
      ) : (
        <div className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700/80">
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Username</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Email</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Role</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-zinc-700/60 last:border-0 hover:bg-zinc-800/15 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                  <td className="px-5 py-3 text-zinc-200 font-mono font-medium">{u.username}</td>
                  <td className="px-5 py-3 text-zinc-500 text-[11px]">
                    {u.email ? (
                      <span className="flex items-center gap-1.5">
                        {u.email}
                        {u.email_verified
                          ? <span className="text-emerald-500 text-[9px] font-semibold">✓</span>
                          : <span className="text-zinc-500 text-[9px]">unverified</span>}
                      </span>
                    ) : <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3 text-zinc-600">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => { setEditUser({ id: u.id, role: u.role, password: '' }); setFormErr(''); }}
                        className="text-xs px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg font-medium transition-all">Edit</button>
                      <button onClick={() => setResetModal({ id: u.id, username: u.username, password: '', showPwd: false, isGenerated: false, saving: false, error: '', done: false, generatedPwd: null })}
                        className="text-xs px-2.5 py-1 bg-raised hover:bg-amber-500/10 text-zinc-500 hover:text-amber-400 border border-zinc-800 hover:border-amber-500/25 rounded-lg font-medium transition-all">Reset Pwd</button>
                      {u.id !== currentUserId && (
                        <button onClick={() => handleDelete(u.id)}
                          className="text-xs px-2.5 py-1 bg-raised hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 rounded-lg font-medium transition-all">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-zinc-600 text-center text-sm">No members yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <Modal title={`Reset password — ${resetModal.username}`} onClose={() => setResetModal(null)}>
          {resetModal.done ? (
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">Password reset for <span className="text-zinc-200 font-mono font-semibold">{resetModal.username}</span>.</p>
              {resetModal.generatedPwd && (
                <>
                  <p className="text-zinc-600 text-xs">Generated password — share securely:</p>
                  <div className="bg-base border border-zinc-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
                    <span className="text-violet-300 font-mono text-sm tracking-widest select-all">{resetModal.generatedPwd}</span>
                    <button type="button" onClick={() => navigator.clipboard.writeText(resetModal.generatedPwd)}
                      className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 text-white rounded-lg font-medium transition-all shrink-0">Copy</button>
                  </div>
                </>
              )}
              <button type="button" onClick={() => setResetModal(null)} className={btnSec + ' w-full text-center'}>Done</button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className={label}>New password</label>
                <div className="relative">
                  <input autoFocus type={resetModal.showPwd ? 'text' : 'password'} className={input + ' pr-10'}
                    value={resetModal.password}
                    onChange={e => setResetModal(p => ({ ...p, password: e.target.value, isGenerated: false, error: '' }))}
                    placeholder="At least 8 characters" required />
                  <button type="button" tabIndex={-1} onClick={() => setResetModal(p => ({ ...p, showPwd: !p.showPwd }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    <EyeIcon open={resetModal.showPwd} />
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => { const pwd = generatePassword(); setResetModal(p => ({ ...p, password: pwd, showPwd: true, isGenerated: true })); }}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium -mt-2">Generate random password</button>
              <ErrorBanner msg={resetModal.error} onDismiss={() => setResetModal(p => ({ ...p, error: '' }))} />
              <div className="flex gap-2.5 pt-1">
                <button type="submit" disabled={resetModal.saving} className={btnPrim}>{resetModal.saving ? 'Resetting…' : 'Reset password'}</button>
                <button type="button" onClick={() => setResetModal(null)} className={btnSec}>Cancel</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {editUser && (
        <Modal title="Edit member" onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className={label}>Role</label>
              <select className={select} value={editUser.role} onChange={e => setEditUser(p => ({ ...p, role: e.target.value }))}>
                <option value="user">Member</option>
                <option value="org_admin">Admin</option>
              </select>
            </div>
            <div>
              <label className={label}>New password <span className="text-zinc-500 font-normal">(leave blank to keep current)</span></label>
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

// ── Invites Tab ───────────────────────────────────────────────────────────────
function InvitesTab() {
  const [invites,      setInvites]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [form,         setForm]         = useState({ email: '', role: 'user' });
  const [saving,       setSaving]       = useState(false);
  const [formErr,      setFormErr]      = useState('');
  const [emailDomain,  setEmailDomain]  = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/invites'),
      api.get('/admin/tenant'),
    ])
      .then(([iRes, tRes]) => {
        setInvites(iRes.data.invites || []);
        setEmailDomain(tRes.data.tenant?.email_domain || null);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try {
      await api.post('/admin/invites', form);
      setShowAdd(false); setForm({ email: '', role: 'user' }); load();
    } catch (err) { setFormErr(err.response?.data?.error || 'Failed to send invite.'); }
    finally { setSaving(false); }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this invite?')) return;
    try { await api.delete(`/admin/invites/${id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  const daysLeft = (exp) => {
    const d = Math.ceil((new Date(exp) - Date.now()) / 86400000);
    return d <= 0 ? 'Expires today' : `${d}d left`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-zinc-100 text-base font-semibold">Pending invites</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{invites.length} open invite{invites.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowAdd(true); setFormErr(''); }}
          className="text-xs px-3.5 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-xl font-medium transition-all flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Invite member
        </button>
      </div>

      <ErrorBanner msg={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />Loading…
        </div>
      ) : invites.length === 0 ? (
        <div className="text-center py-14 bg-surface border border-zinc-800 rounded-2xl">
          <p className="text-zinc-400 text-sm font-medium mb-1">No pending invites</p>
          <p className="text-zinc-600 text-xs">Invite teammates by email — they'll get a link to join your organization.</p>
        </div>
      ) : (
        <div className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700/80">
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Email</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Role</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Invited by</th>
                <th className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">Expires</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {invites.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-zinc-700/60 last:border-0 hover:bg-zinc-800/15 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                  <td className="px-5 py-3 text-zinc-200 font-mono">{inv.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={inv.role} /></td>
                  <td className="px-5 py-3 text-zinc-500 font-mono">{inv.invited_by || '—'}</td>
                  <td className="px-5 py-3 text-zinc-600">{daysLeft(inv.expires_at)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleRevoke(inv.id)}
                      className="text-xs px-2.5 py-1 bg-raised hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 rounded-lg font-medium transition-all">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Invite member" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className={label}>
                Email address
                {emailDomain && <span className="ml-1.5 text-zinc-600 font-mono font-normal">@{emailDomain} only</span>}
              </label>
              <input autoFocus type="email" className={input} value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder={emailDomain ? `colleague@${emailDomain}` : 'colleague@company.com'} required />
            </div>
            <div>
              <label className={label}>Role</label>
              <select className={select} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="user">Member — regular user</option>
                <option value="org_admin">Admin — can manage users and connections</option>
              </select>
            </div>
            <p className="text-zinc-600 text-xs leading-relaxed -mt-1">
              An invite email will be sent. The link expires in 7 days.
            </p>
            <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
            <div className="flex gap-2.5 pt-1">
              <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Sending…' : 'Send invite'}</button>
              <button type="button" onClick={() => setShowAdd(false)} className={btnSec}>Cancel</button>
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
      .catch(err => setError(err.response?.data?.error || 'Failed.'))
      .finally(() => setLoading(false));
  }, [conn.id]);

  useEffect(() => { loadGrants(); }, [loadGrants]);

  const grantedIds    = new Set(grants.map(g => g.user_id));
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
    <div className="mt-3 bg-base border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/80">
        <div>
          <span className="text-zinc-300 text-xs font-semibold">Access grants</span>
          <p className="text-zinc-500 text-[10px] mt-0.5">{grants.length} member{grants.length !== 1 ? 's' : ''} with access</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowAdd(true); setFormErr(''); }} disabled={eligibleUsers.length === 0}
            className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-40 text-white rounded-lg font-medium transition-all">+ Grant</button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all text-lg leading-none">×</button>
        </div>
      </div>
      <div className="p-3">
        <ErrorBanner msg={error} onDismiss={() => setError('')} />
        {loading ? <p className="text-zinc-600 text-xs py-2">Loading…</p>
        : grants.length === 0 ? <p className="text-zinc-500 text-xs py-2">No grants yet — click + Grant to share this connection.</p>
        : (
          <div className="space-y-1.5">
            {grants.map(g => (
              <div key={g.id} className="flex items-center gap-3 bg-surface border border-zinc-800 rounded-xl px-3.5 py-2.5">
                <span className="text-zinc-200 text-xs font-mono font-medium flex-1 truncate">{g.username}</span>
                <RoleBadge role={g.role} />
                <select value={g.permission} onChange={e => handlePermChange(g.user_id, e.target.value)}
                  className="bg-base border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500/40 cursor-pointer">
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
              <label className={label}>Member</label>
              <select className={select} value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))} required>
                <option value="">— select member —</option>
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

// ── Connection form (module-level so identity is stable across re-renders) ─────
function ConnForm({ values, onChange, onSubmit, submitLabel, formErr, onDismissErr, saving, onCancel }) {
  const isSQLite = values.type === 'sqlite';
  const handleTypeChange = (type) => {
    const defaults = { mysql: '3306', mariadb: '3306', postgres: '5432', sqlite: '' };
    onChange('type', type);
    onChange('port', defaults[type] || '');
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={label}>Connection name</label>
        <input className={input} value={values.name} onChange={e => onChange('name', e.target.value)} placeholder="My Database" required />
      </div>
      <div>
        <label className={label}>Type</label>
        <select className={select} value={values.type} onChange={e => handleTypeChange(e.target.value)}>
          {DB_TYPES.map(t => <option key={t} value={t}>{DB_LABEL[t]}</option>)}
        </select>
      </div>
      {!isSQLite && (
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
            <label className={label}>Password{submitLabel !== 'Create' && <span className="text-zinc-500 font-normal ml-1">(blank = unchanged)</span>}</label>
            <input type="password" className={input} value={values.password} onChange={e => onChange('password', e.target.value)}
              placeholder={submitLabel !== 'Create' ? 'Unchanged' : 'password'} />
          </div>
        </>
      )}
      <div>
        <label className={label}>{isSQLite ? 'File path' : 'Database name'}</label>
        <input className={input} value={values.database} onChange={e => onChange('database', e.target.value)}
          placeholder={isSQLite ? '/data/mydb.sqlite' : 'mydb'} required />
      </div>
      {!isSQLite && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={values.use_ssl || false} onChange={e => onChange('use_ssl', e.target.checked)}
            className="w-4 h-4 rounded border border-zinc-700 bg-base accent-violet-500 cursor-pointer" />
          <span className="text-sm text-zinc-400">Use SSL / TLS</span>
        </label>
      )}
      <ErrorBanner msg={formErr} onDismiss={onDismissErr} />
      <div className="flex gap-2.5 pt-1">
        <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={onCancel} className={btnSec}>Cancel</button>
      </div>
    </form>
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

  const emptyForm = { name: '', type: 'mysql', host: 'localhost', port: '3306', username: '', password: '', database: '', use_ssl: false };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/connections')
      .then(res => setConnections(res.data.connections || []))
      .catch(err => setError(err.response?.data?.error || 'Failed.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-zinc-100 text-base font-semibold">Connections</h2>
          <p className="text-zinc-600 text-xs mt-0.5">{connections.length} saved connection{connections.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm(emptyForm); setFormErr(''); }}
          className="text-xs px-3.5 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-xl font-medium transition-all flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Add connection
        </button>
      </div>

      <ErrorBanner msg={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />Loading…
        </div>
      ) : connections.length === 0 && !showAdd ? (
        <div className="text-center py-16 bg-surface border border-zinc-800 rounded-2xl">
          <p className="text-zinc-400 text-sm font-medium mb-1">No connections yet</p>
          <p className="text-zinc-600 text-xs">Add a connection and grant members access to it.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {connections.map(conn => {
            const dotColor = DB_COLOR[conn.type] || '#71717a';
            return (
              <div key={conn.id} className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${dotColor}18`, border: `1px solid ${dotColor}30` }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}80` }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-zinc-100 text-sm font-medium truncate">{conn.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.09] text-zinc-500 rounded-md border border-zinc-800 uppercase tracking-wide font-medium shrink-0">
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
                  {testResult[conn.id] && (
                    <span className={`text-xs shrink-0 font-medium ${testResult[conn.id].ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult[conn.id].ok ? '✓' : '✗'} {testResult[conn.id].msg}
                    </span>
                  )}
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setGrantsConn(grantsConn?.id === conn.id ? null : conn)}
                      className={`text-xs px-2.5 py-1 border rounded-lg font-medium transition-all ${grantsConn?.id === conn.id ? 'bg-violet-500/12 text-violet-300 border-violet-500/25' : 'bg-raised text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:bg-overlay'}`}>Grants</button>
                    <button onClick={() => handleTest(conn.id)} disabled={testing === conn.id}
                      className="text-xs px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg font-medium transition-all disabled:opacity-50">
                      {testing === conn.id ? 'Testing…' : 'Test'}
                    </button>
                    <button onClick={() => { setEditConn({ id: conn.id, name: conn.name, type: conn.type, host: conn.host || '', port: conn.port ? String(conn.port) : '', username: conn.db_username || '', password: '', database: conn.database_name, use_ssl: conn.use_ssl ?? false }); setFormErr(''); }}
                      className="text-xs px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg font-medium transition-all">Edit</button>
                    <button onClick={() => handleDelete(conn.id)}
                      className="text-xs px-2.5 py-1 bg-raised hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 rounded-lg font-medium transition-all">Delete</button>
                  </div>
                </div>
                {grantsConn?.id === conn.id && (
                  <div className="border-t border-zinc-700/80 px-5 pb-4">
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
          <ConnForm
            values={form}
            onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
            onSubmit={handleAdd}
            submitLabel="Create"
            formErr={formErr}
            onDismissErr={() => setFormErr('')}
            saving={saving}
            onCancel={() => { setShowAdd(false); setFormErr(''); }}
          />
        </Modal>
      )}
      {editConn && (
        <Modal title="Edit connection" onClose={() => setEditConn(null)}>
          <ConnForm
            values={editConn}
            onChange={(k, v) => setEditConn(p => ({ ...p, [k]: v }))}
            onSubmit={handleEdit}
            submitLabel="Save changes"
            formErr={formErr}
            onDismissErr={() => setFormErr('')}
            saving={saving}
            onCancel={() => { setEditConn(null); setFormErr(''); }}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel({ user, onClose, onLogout }) {
  const [tab, setTab] = useState('users');

  return (
    <div className="min-h-full bg-base flex flex-col">
      <nav className="h-12 bg-surface border-b border-zinc-800 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1.5 transition-all hover:bg-zinc-800/15 px-2 py-1.5 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
          <span className="w-px h-4 bg-white/[0.12]" />
          <span className="text-zinc-200 text-sm font-semibold">{user.org_name || 'Organization'} — Admin</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>
          <button onClick={onLogout} className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium">Log out</button>
        </div>
      </nav>

      <div className="flex-1 max-w-4xl mx-auto w-full px-8 py-8">
        <div className="mb-7">
          <h1 className="text-zinc-100 text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-zinc-600 text-sm mt-1">Manage members, invites, connections, and access grants.</p>
        </div>

        <TenantInfoBar />

        <div className="flex gap-1 mb-7 border-b border-zinc-800">
          {[['users', 'Members'], ['invites', 'Invites'], ['connections', 'Connections']].map(([key, lbl]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-all ${tab === key ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {tab === 'users'       && <UsersTab currentUserId={user.id} />}
        {tab === 'invites'     && <InvitesTab />}
        {tab === 'connections' && <ConnectionsTab />}
      </div>
    </div>
  );
}
