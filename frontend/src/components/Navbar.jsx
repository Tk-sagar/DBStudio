import { useState } from 'react';
import api from '../api/client.js';

const DB_COLOR = { mysql: '#fb923c', mariadb: '#fb923c', postgres: '#38bdf8', postgresql: '#38bdf8', sqlite: '#4ade80' };

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

const inputCls = 'w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all pr-10';

const EMPTY_PWD = { current: '', newPwd: '', confirm: '', showCurrent: false, showNew: false, showConfirm: false, saving: false, error: '', success: false };

export default function Navbar({ dbInfo, user, onDisconnect, onLogout, onAdmin, openConnections = [], activeConnId, connectingId, onSwitchConnection, onCloseConnection, onAddConnection }) {
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm,      setPwdForm]      = useState(EMPTY_PWD);

  const handleDisconnectAll = async () => {
    try { await api.delete('/disconnect'); } catch (_) {}
    onDisconnect();
  };

  const closePwdModal = () => { setShowPwdModal(false); setPwdForm(EMPTY_PWD); };

  const handleChangePwd = async (e) => {
    e.preventDefault();
    if (pwdForm.newPwd !== pwdForm.confirm) {
      return setPwdForm(p => ({ ...p, error: 'New passwords do not match.' }));
    }
    setPwdForm(p => ({ ...p, saving: true, error: '' }));
    try {
      await api.post('/auth/change-password', { currentPassword: pwdForm.current, newPassword: pwdForm.newPwd });
      setPwdForm(p => ({ ...p, saving: false, success: true }));
    } catch (err) {
      setPwdForm(p => ({ ...p, saving: false, error: err.response?.data?.error || 'Something went wrong.' }));
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <>
    <nav className="h-12 bg-[#111113] border-b border-white/[0.07] flex items-center justify-between px-5 shrink-0 z-20">
      {/* Brand */}
      <div className="flex items-center shrink-0">
        <span className="text-zinc-100 font-semibold text-sm tracking-tight flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="16" height="16" rx="4.5" stroke="url(#nav-lg)" strokeWidth="1.4"/>
            <path d="M4.5 9h9M4.5 6h9M4.5 12h5.5" stroke="url(#nav-lg2)" strokeWidth="1.4" strokeLinecap="round"/>
            <defs>
              <linearGradient id="nav-lg" x1="1" y1="1" x2="17" y2="17" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#6366f1"/>
              </linearGradient>
              <linearGradient id="nav-lg2" x1="4" y1="6" x2="14" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#818cf8"/>
              </linearGradient>
            </defs>
          </svg>
          DB Studio
        </span>
      </div>

      {/* Connection tabs */}
      <div className="flex items-center gap-1 flex-1 px-5 min-w-0 overflow-x-auto">
        {openConnections.map(conn => {
          const isActive = conn.id === activeConnId;
          const isBusy   = connectingId === conn.id;
          const dotColor = DB_COLOR[conn.type] || '#71717a';
          return (
            <div
              key={conn.id}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 group ${
                isActive
                  ? 'bg-[#1c1c1f] text-zinc-200 border border-white/[0.10]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              {isBusy ? (
                <span className="w-1.5 h-1.5 border border-zinc-600 border-t-violet-400 rounded-full animate-spin-fast shrink-0" />
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: isActive ? dotColor : '#52525b',
                    boxShadow: isActive ? `0 0 5px ${dotColor}60` : 'none',
                  }}
                />
              )}
              <button
                onClick={() => !isActive && !isBusy && onSwitchConnection?.(conn.id)}
                className="max-w-[110px] truncate leading-none text-left"
                title={conn.name}
                disabled={isActive || isBusy}
              >
                {conn.name}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseConnection?.(conn.id); }}
                className="text-zinc-700 hover:text-zinc-400 transition-colors leading-none ml-0.5 text-sm opacity-0 group-hover:opacity-100"
                title="Close this connection"
              >×</button>
            </div>
          );
        })}

        {/* Add connection */}
        <button
          onClick={onAddConnection}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all shrink-0 text-base leading-none"
          title="Open another connection"
        >+</button>
      </div>

      {/* Right: user + actions */}
      <div className="flex items-center gap-1 shrink-0">
        {user && <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>}
        {isAdmin && onAdmin && (
          <button
            onClick={onAdmin}
            className="text-xs text-zinc-500 hover:text-violet-300 px-2.5 py-1.5 rounded-lg hover:bg-violet-500/10 border border-transparent hover:border-violet-500/20 transition-all font-medium"
          >Admin</button>
        )}
        <button
          onClick={() => setShowPwdModal(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-all font-medium"
        >Change Pwd</button>
        <button
          onClick={handleDisconnectAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-all font-medium"
        >Disconnect</button>
        <button
          onClick={onLogout}
          className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium"
        >Log out</button>
      </div>
    </nav>

    {/* Change password modal */}
    {showPwdModal && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#111113] border border-white/[0.09] rounded-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
            <h3 className="text-zinc-100 text-sm font-semibold">Change Password</h3>
            <button onClick={closePwdModal} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all text-lg leading-none">×</button>
          </div>
          <div className="p-5">
            {pwdForm.success ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <p className="text-zinc-300 text-sm font-medium">Password changed successfully</p>
                <button onClick={closePwdModal} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Close</button>
              </div>
            ) : (
              <form onSubmit={handleChangePwd} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Current password</label>
                  <div className="relative">
                    <input
                      type={pwdForm.showCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={pwdForm.current}
                      onChange={e => setPwdForm(p => ({ ...p, current: e.target.value, error: '' }))}
                      placeholder="Your current password"
                      required
                      className={inputCls}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setPwdForm(p => ({ ...p, showCurrent: !p.showCurrent }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                      <EyeIcon open={pwdForm.showCurrent} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={pwdForm.showNew ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={pwdForm.newPwd}
                      onChange={e => setPwdForm(p => ({ ...p, newPwd: e.target.value, error: '' }))}
                      placeholder="At least 8 characters"
                      required
                      className={inputCls}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setPwdForm(p => ({ ...p, showNew: !p.showNew }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                      <EyeIcon open={pwdForm.showNew} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm new password</label>
                  <div className="relative">
                    <input
                      type={pwdForm.showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={pwdForm.confirm}
                      onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value, error: '' }))}
                      placeholder="Re-enter new password"
                      required
                      className={inputCls}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setPwdForm(p => ({ ...p, showConfirm: !p.showConfirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                      <EyeIcon open={pwdForm.showConfirm} />
                    </button>
                  </div>
                </div>
                {pwdForm.error && (
                  <div className="flex items-center gap-2 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-2.5">
                    <svg className="text-red-400 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M6 4v2.5M6 8h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <p className="text-red-400 text-xs">{pwdForm.error}</p>
                  </div>
                )}
                <div className="flex gap-2.5 pt-1">
                  <button type="submit" disabled={pwdForm.saving} className="flex-1 py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all">
                    {pwdForm.saving ? 'Saving…' : 'Change Password'}
                  </button>
                  <button type="button" onClick={closePwdModal} className="px-4 py-2.5 bg-[#1c1c1f] text-zinc-400 border border-white/[0.08] text-sm font-medium rounded-xl hover:bg-[#232329] hover:text-zinc-300 transition-all">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  );
}
