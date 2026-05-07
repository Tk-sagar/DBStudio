import { useState, useRef, useEffect } from 'react';
import api from '../api/client.js';
import { useTheme } from '../hooks/useTheme.jsx';

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

const inputCls = 'w-full bg-base border border-zinc-800 text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-500 transition-all pr-10';
const EMPTY_PWD = { current: '', newPwd: '', confirm: '', showCurrent: false, showNew: false, showConfirm: false, saving: false, error: '', success: false };

const ROLE_LABEL = { super_admin: 'Super Admin', org_admin: 'Admin', user: 'Member' };

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1 4 10M10 4l1.1-1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 9a6 6 0 01-7.5-7.5A5.5 5.5 0 1011.5 9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Navbar({ dbInfo, user, onDisconnect, onLogout, onAdmin, openConnections = [], activeConnId, connectingId, onSwitchConnection, onCloseConnection, onAddConnection }) {
  const [showPwdModal,  setShowPwdModal]  = useState(false);
  const [pwdForm,       setPwdForm]       = useState(EMPTY_PWD);
  const [showProfile,   setShowProfile]   = useState(false);
  const profileRef = useRef(null);
  const { resolvedTheme, setTheme } = useTheme();

  const isAdmin = user?.role === 'org_admin';
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  useEffect(() => {
    if (!showProfile) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfile]);

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

  const openChangePwd = () => { setShowProfile(false); setShowPwdModal(true); };
  const handleAdminClick = () => { setShowProfile(false); onAdmin?.(); };

  return (
    <>
    <nav className="h-12 bg-surface border-b border-zinc-800 flex items-center justify-between px-5 shrink-0 z-20">
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
                  ? 'bg-raised text-zinc-200 border border-zinc-700/70'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/20 border border-transparent'
              }`}
            >
              {isBusy ? (
                <span className="w-1.5 h-1.5 border border-zinc-600 border-t-violet-400 rounded-full animate-spin-fast shrink-0" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                  backgroundColor: isActive ? dotColor : '#52525b',
                  boxShadow: isActive ? `0 0 5px ${dotColor}60` : 'none',
                }} />
              )}
              <button
                onClick={() => !isActive && !isBusy && onSwitchConnection?.(conn.id)}
                className="max-w-[110px] truncate leading-none text-left"
                title={conn.name}
                disabled={isActive || isBusy}
              >{conn.name}</button>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseConnection?.(conn.id); }}
                className="text-zinc-500 hover:text-zinc-400 transition-colors leading-none ml-0.5 text-sm opacity-0 group-hover:opacity-100"
                title="Close this connection"
              >×</button>
            </div>
          );
        })}
        <button
          onClick={onAddConnection}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all shrink-0 text-base leading-none"
          title="Open another connection"
        >+</button>
      </div>

      {/* Right: theme toggle + disconnect + profile */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/20 border border-zinc-800 transition-all"
          title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          onClick={handleDisconnectAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/20 border border-zinc-700 transition-all font-medium"
        >Disconnect</button>

        {/* Profile button */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(p => !p)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all select-none ${
              showProfile
                ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                : 'bg-raised text-zinc-400 hover:text-zinc-200 hover:bg-overlay border border-zinc-800'
            }`}
          >{initials}</button>

          {showProfile && (
            <div className="absolute right-0 top-9 w-52 bg-surface border border-zinc-700/60 rounded-xl shadow-modal z-50 overflow-hidden">
              {/* User info header */}
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-zinc-200 text-xs font-semibold truncate">{user?.username}</p>
                {user?.email && <p className="text-zinc-600 text-[11px] truncate mt-0.5">{user.email}</p>}
                <span className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium border ${
                  user?.role === 'org_admin'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                }`}>{ROLE_LABEL[user?.role] || user?.role}</span>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {isAdmin && onAdmin && (
                  <button onClick={handleAdminClick}
                    className="w-full text-left px-4 py-2 text-xs text-zinc-400 hover:text-violet-300 hover:bg-violet-500/[0.07] transition-colors flex items-center gap-2.5">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <rect x="1" y="1" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M4 6.5h5M4 4.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    Admin Panel
                  </button>
                )}
                <button onClick={openChangePwd}
                  className="w-full text-left px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20 transition-colors flex items-center gap-2.5">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="3" y="6" width="7" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M4.5 6V4.5a2 2 0 014 0V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Change Password
                </button>
              </div>

              <div className="border-t border-zinc-800 py-1">
                <button onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors flex items-center gap-2.5">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M8 2H10.5C11.05 2 11.5 2.45 11.5 3V10C11.5 10.55 11.05 11 10.5 11H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M5 9.5L8 6.5L5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1.5 6.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>

    {/* Change password modal */}
    {showPwdModal && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-zinc-700/60 rounded-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-zinc-100 text-sm font-semibold">Change Password</h3>
            <button onClick={closePwdModal} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all text-lg leading-none">×</button>
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
                {[
                  { label: 'Current password', key: 'current', show: 'showCurrent', auto: 'current-password', ph: 'Your current password' },
                  { label: 'New password', key: 'newPwd', show: 'showNew', auto: 'new-password', ph: 'At least 8 characters' },
                  { label: 'Confirm new password', key: 'confirm', show: 'showConfirm', auto: 'new-password', ph: 'Re-enter new password' },
                ].map(({ label, key, show, auto, ph }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
                    <div className="relative">
                      <input
                        type={pwdForm[show] ? 'text' : 'password'}
                        autoComplete={auto}
                        value={pwdForm[key]}
                        onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value, error: '' }))}
                        placeholder={ph}
                        required
                        className={inputCls}
                      />
                      <button type="button" tabIndex={-1}
                        onClick={() => setPwdForm(p => ({ ...p, [show]: !p[show] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                        <EyeIcon open={pwdForm[show]} />
                      </button>
                    </div>
                  </div>
                ))}
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
                  <button type="button" onClick={closePwdModal} className="px-4 py-2.5 bg-raised text-zinc-400 border border-zinc-800 text-sm font-medium rounded-xl hover:bg-overlay hover:text-zinc-300 transition-all">Cancel</button>
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
