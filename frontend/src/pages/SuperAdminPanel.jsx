import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

function ErrorBanner({ msg, onDismiss }) {
  if (!msg) return null;
  return (
    <div className="flex items-center justify-between bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-xs mb-4">
      <span>{msg}</span>
      <button onClick={onDismiss} className="ml-3 text-red-600 hover:text-red-300 transition-colors leading-none">×</button>
    </div>
  );
}

function Modal({ title, onClose, wide, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto">
      <div className={`bg-surface border border-zinc-700/60 rounded-2xl w-full shadow-modal ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="text-zinc-100 text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all text-lg leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const input  = 'w-full bg-base border border-zinc-800 text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-500 transition-all';
const select = input + ' cursor-pointer';
const lbl    = 'block text-xs font-medium text-zinc-400 mb-1.5';
const btnPrim = 'flex-1 py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all';
const btnSec  = 'px-4 py-2.5 bg-raised text-zinc-400 border border-zinc-800 text-sm font-medium rounded-xl hover:bg-overlay hover:text-zinc-300 transition-all';

const ROLE_LABEL = { super_admin: 'Super Admin', org_admin: 'Admin', user: 'Member' };
const DB_TYPE_COLOR = { mysql: 'text-orange-400', mariadb: 'text-orange-400', postgres: 'text-sky-400', postgresql: 'text-sky-400', sqlite: 'text-emerald-400' };

function OrgDetailModal({ orgId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('users');

  useEffect(() => {
    api.get(`/super/tenants/${orgId}`)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load organization details.'))
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <Modal title={data ? `${data.org.name}` : 'Organization'} onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
          <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />Loading…
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="space-y-5">
          {/* Org meta */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Domain', value: data.org.email_domain ? `@${data.org.email_domain}` : '—' },
              { label: 'Plan', value: data.org.plan.toUpperCase() },
              { label: 'Users', value: `${data.users.length} / ${data.org.max_users}` },
              { label: 'Connections', value: `${data.connections.length} / ${data.org.max_connections}` },
            ].map(s => (
              <div key={s.label} className="bg-raised border border-zinc-700/80 rounded-xl px-4 py-3">
                <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-zinc-200 text-sm font-semibold font-mono">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex bg-raised border border-zinc-700/80 rounded-xl p-1 gap-1">
            {[['users', `Users (${data.users.length})`], ['connections', `Connections (${data.connections.length})`]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${tab === key ? 'bg-overlay text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Users tab */}
          {tab === 'users' && (
            data.users.length === 0 ? (
              <p className="text-zinc-600 text-xs text-center py-6">No users in this organization.</p>
            ) : (
              <div className="bg-raised border border-zinc-700/80 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700/80">
                      {['Username', 'Email', 'Role', 'Verified', 'Joined'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map(u => (
                      <tr key={u.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/15">
                        <td className="px-4 py-2.5 text-zinc-200 font-medium font-mono">{u.username}</td>
                        <td className="px-4 py-2.5 text-zinc-400">{u.email || <span className="text-zinc-500">—</span>}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            u.role === 'org_admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                          }`}>{ROLE_LABEL[u.role] || u.role}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {u.email_verified
                            ? <span className="text-emerald-500 text-[10px]">✓ Yes</span>
                            : <span className="text-zinc-500 text-[10px]">No</span>}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Connections tab */}
          {tab === 'connections' && (
            data.connections.length === 0 ? (
              <p className="text-zinc-600 text-xs text-center py-6">No connections in this organization.</p>
            ) : (
              <div className="bg-raised border border-zinc-700/80 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700/80">
                      {['Name', 'Type', 'Database', 'Host', 'Added'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.connections.map(c => (
                      <tr key={c.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/15">
                        <td className="px-4 py-2.5 text-zinc-200 font-medium">{c.name}</td>
                        <td className={`px-4 py-2.5 font-mono uppercase font-semibold text-[10px] ${DB_TYPE_COLOR[c.type] || 'text-zinc-400'}`}>{c.type}</td>
                        <td className="px-4 py-2.5 text-zinc-400 font-mono">{c.database_name}</td>
                        <td className="px-4 py-2.5 text-zinc-600 font-mono">{c.host || '—'}</td>
                        <td className="px-4 py-2.5 text-zinc-600">{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

export default function SuperAdminPanel({ user, onLogout }) {
  const [tenants,    setTenants]    = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [editTenant, setEditTenant] = useState(null);
  const [viewOrgId,  setViewOrgId]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get('/super/tenants'), api.get('/super/stats')])
      .then(([tRes, sRes]) => { setTenants(tRes.data.tenants || []); setStats(sRes.data); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete organization "${name}" and ALL its data? This cannot be undone.`)) return;
    try { await api.delete(`/super/tenants/${id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSaving(true); setFormErr('');
    try {
      await api.put(`/super/tenants/${editTenant.id}`, {
        name:            editTenant.name,
        plan:            editTenant.plan,
        max_users:       parseInt(editTenant.max_users),
        max_connections: parseInt(editTenant.max_connections),
      });
      setEditTenant(null); load();
    } catch (err) { setFormErr(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-full bg-base flex flex-col">
      {/* Navbar */}
      <nav className="h-12 bg-surface border-b border-zinc-800 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-zinc-200 text-sm font-semibold">Platform Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>
          <button onClick={onLogout} className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium">Log out</button>
        </div>
      </nav>

      <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-8">
        <div className="mb-7">
          <h1 className="text-zinc-100 text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-zinc-600 text-sm mt-1">All companies and organizations on this platform.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-7">
            {[
              { label: 'Total organizations', value: stats.tenantCount },
              { label: 'Total users', value: stats.userCount },
              { label: 'Total connections', value: stats.connCount },
            ].map(s => (
              <div key={s.label} className="bg-surface border border-zinc-800 rounded-2xl px-5 py-4">
                <p className="text-zinc-100 text-2xl font-bold">{s.value}</p>
                <p className="text-zinc-600 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <ErrorBanner msg={error} onDismiss={() => setError('')} />

        {loading ? (
          <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-8">
            <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />Loading…
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20 bg-surface border border-zinc-800 rounded-2xl">
            <p className="text-zinc-400 text-sm font-medium mb-1">No organizations yet</p>
            <p className="text-zinc-600 text-xs">Organizations are created when companies sign up.</p>
          </div>
        ) : (
          <div className="bg-surface border border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700/80">
                  {['Organization', 'Domain', 'Plan', 'Users', 'Connections', 'Created', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => {
                  const planStyle = t.plan === 'pro'
                    ? 'bg-violet-500/10 text-violet-400 border-violet-500/25'
                    : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
                  return (
                    <tr key={t.id} className={`border-b border-zinc-700/60 last:border-0 hover:bg-zinc-800/15 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                      <td className="px-5 py-3">
                        <p className="text-zinc-200 font-medium">{t.name}</p>
                        <p className="text-zinc-500 font-mono text-[10px] mt-0.5">{t.slug}</p>
                      </td>
                      <td className="px-5 py-3 text-zinc-500 font-mono">
                        {t.email_domain ? `@${t.email_domain}` : <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${planStyle}`}>{t.plan}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        {t.user_count}<span className="text-zinc-500">/{t.max_users}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        {t.conn_count}<span className="text-zinc-500">/{t.max_connections}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => setViewOrgId(t.id)}
                            className="text-xs px-2.5 py-1 bg-raised hover:bg-violet-500/10 text-zinc-400 hover:text-violet-300 border border-zinc-800 hover:border-violet-500/20 rounded-lg font-medium transition-all">View</button>
                          <button onClick={() => setEditTenant({ id: t.id, name: t.name, plan: t.plan, max_users: t.max_users, max_connections: t.max_connections })}
                            className="text-xs px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg font-medium transition-all">Edit</button>
                          <button onClick={() => handleDelete(t.id, t.name)}
                            className="text-xs px-2.5 py-1 bg-raised hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 rounded-lg font-medium transition-all">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewOrgId && (
        <OrgDetailModal orgId={viewOrgId} onClose={() => setViewOrgId(null)} />
      )}

      {editTenant && (
        <Modal title={`Edit — ${editTenant.name}`} onClose={() => setEditTenant(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className={lbl}>Organization name</label>
              <input className={input} value={editTenant.name} onChange={e => setEditTenant(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div>
              <label className={lbl}>Plan</label>
              <select className={select} value={editTenant.plan} onChange={e => setEditTenant(p => ({ ...p, plan: e.target.value }))}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Max users</label>
                <input type="number" min="1" max="500" className={input} value={editTenant.max_users}
                  onChange={e => setEditTenant(p => ({ ...p, max_users: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Max connections</label>
                <input type="number" min="1" max="100" className={input} value={editTenant.max_connections}
                  onChange={e => setEditTenant(p => ({ ...p, max_connections: e.target.value }))} />
              </div>
            </div>
            <ErrorBanner msg={formErr} onDismiss={() => setFormErr('')} />
            <div className="flex gap-2.5 pt-1">
              <button type="submit" disabled={saving} className={btnPrim}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditTenant(null)} className={btnSec}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
