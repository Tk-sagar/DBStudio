import { useState, useEffect, useRef } from 'react';
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

function MailIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="5" y="10" width="30" height="22" rx="3" stroke="#a78bfa" strokeWidth="1.5"/>
      <path d="M5 13l15 10 15-10" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const inputCls = [
  'w-full bg-base border border-zinc-800 text-zinc-100 text-sm rounded-xl',
  'px-3.5 py-2.5 placeholder-zinc-500',
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
          <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#6366f1"/>
        </linearGradient>
        <linearGradient id="lg2" x1="7" y1="9" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa"/><stop offset="1" stopColor="#818cf8"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-2.5">
      <svg className="text-red-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M6.5 4v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      <p className="text-red-400 text-xs">{msg}</p>
    </div>
  );
}

function SuccessBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl px-3.5 py-2.5">
      <svg className="text-emerald-400 shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className="text-emerald-400 text-xs">{msg}</p>
    </div>
  );
}

function OtpInput({ value, onChange }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      className={[
        'w-full bg-base border border-zinc-800 text-zinc-100 rounded-xl',
        'px-3.5 py-3 text-center text-2xl font-mono tracking-[0.5em] placeholder-zinc-500',
        'focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15',
        'transition-all duration-150',
      ].join(' ')}
    />
  );
}

function ResendButton({ userId, type, onSuccess, onError }) {
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);

  const startCooldown = (secs = 60) => {
    setCooldown(secs);
    timerRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleResend = async () => {
    setBusy(true);
    try {
      await api.post('/auth/resend-otp', { userId, type });
      startCooldown(60);
      onSuccess?.('Code resent — check your inbox.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to resend.';
      const match = msg.match(/wait (\d+)s/);
      if (match) startCooldown(parseInt(match[1]));
      onError?.(msg);
    } finally { setBusy(false); }
  };

  return (
    <button type="button" onClick={handleResend} disabled={busy || cooldown > 0}
      className="text-xs text-zinc-500 hover:text-violet-400 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors">
      {busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
    </button>
  );
}

export default function AppLogin({ mode, onLogin, inviteToken }) {
  const isSetup = mode === 'setup';

  const [screen, setScreen] = useState('form');
  const [tab, setTab] = useState('login');

  // Form fields
  const [orgName, setOrgName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // OTP / reset
  const [otpValue, setOtpValue] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConf, setNewPwdConf] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showNewConf, setShowNewConf] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  // Invite join
  const [inviteInfo, setInviteInfo] = useState(null); // { email, role, org_name }
  const [joinPwd, setJoinPwd] = useState('');
  const [joinConf, setJoinConf] = useState('');
  const [showJoinPwd, setShowJoinPwd] = useState(false);
  const [showJoinConf, setShowJoinConf] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  // Auto-detect invite token on load
  useEffect(() => {
    if (!inviteToken) return;
    setLoading(true);
    api.get(`/auth/invite/${inviteToken}`)
      .then(res => {
        setInviteInfo(res.data);
        setScreen('join');
      })
      .catch(() => {
        setError('This invite link is invalid or has expired.');
      })
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const switchTab = (t) => {
    setTab(t); setOrgName(''); setUsername(''); setEmail('');
    setPassword(''); setConfirm(''); setShowPwd(false); setShowConfirm(false);
    clearMessages();
  };

  const goBack = () => {
    setScreen('form'); setOtpValue(''); setNewPwd(''); setNewPwdConf('');
    setShowNewPwd(false); setShowNewConf(false); clearMessages();
  };

  // ── Submit: login / register / setup ───────────────────────────────────────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    clearMessages();
    const isRegister = !isSetup && tab === 'register';
    if ((isRegister || isSetup) && password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      if (isSetup) {
        const res = await api.post('/auth/setup', { orgName: orgName.trim(), username: username.trim(), password, email: email.trim() || undefined });
        onLogin(res.data.user);
      } else if (isRegister) {
        const res = await api.post('/auth/register', {
          orgName: orgName.trim(), username: username.trim(),
          email: email.trim(), password,
        });
        if (res.data.pendingVerification) {
          setPendingId(res.data.userId);
          setPendingEmail(email.trim());
          setScreen('verify-email');
        }
      } else {
        const res = await api.post('/auth/login', { identifier: username.trim(), password });
        if (res.data.pendingVerification) {
          setPendingId(res.data.userId);
          setPendingEmail(username.trim());
          setScreen('verify-email');
        } else {
          onLogin(res.data.user);
        }
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.pendingVerification) {
        setPendingId(data.userId);
        setPendingEmail(username.trim());
        setScreen('verify-email');
      } else {
        setError(data?.error || 'Something went wrong.');
      }
    } finally { setLoading(false); }
  };

  // ── Submit: verify email OTP ────────────────────────────────────────────────
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) return setError('Enter the 6-digit code from your email.');
    clearMessages(); setLoading(true);
    try {
      const res = await api.post('/auth/verify-email', { userId: pendingId, otp: otpValue });
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  // ── Submit: forgot password — send OTP ─────────────────────────────────────
  const handleForgotEmail = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Email is required.');
    clearMessages(); setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      if (res.data.userId) {
        setPendingId(res.data.userId);
        setPendingEmail(email.trim());
        setScreen('forgot-reset');
      } else {
        setSuccess('If an account with that email exists, a reset code was sent.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  // ── Submit: reset password with OTP ────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) return setError('Enter the 6-digit reset code.');
    if (!newPwd || newPwd.length < 8) return setError('Password must be at least 8 characters.');
    if (newPwd !== newPwdConf) return setError('Passwords do not match.');
    clearMessages(); setLoading(true);
    try {
      await api.post('/auth/reset-password', { userId: pendingId, otp: otpValue, newPassword: newPwd });
      setScreen('form'); setTab('login');
      setOtpValue(''); setNewPwd(''); setNewPwdConf('');
      setSuccess('Password reset successfully. Sign in with your new password.');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  // ── Submit: accept invite ───────────────────────────────────────────────────
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return setError('Username is required.');
    if (!joinPwd || joinPwd.length < 8) return setError('Password must be at least 8 characters.');
    if (joinPwd !== joinConf) return setError('Passwords do not match.');
    clearMessages(); setLoading(true);
    try {
      const res = await api.post('/auth/join', {
        token: inviteToken, username: username.trim(), password: joinPwd,
      });
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname);
      }
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  const isRegister = !isSetup && tab === 'register';

  const subtitle = isSetup ? 'Create your admin account'
    : screen === 'verify-email' ? 'Verify your email'
    : screen === 'forgot-email' ? 'Reset your password'
    : screen === 'forgot-reset' ? 'Set a new password'
    : screen === 'join'         ? `Join ${inviteInfo?.org_name || 'organization'}`
    : isRegister                ? 'Create your organization'
    : 'Sign in';

  return (
    <div className="min-h-full bg-base dot-grid flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-[380px] relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-zinc-800 flex items-center justify-center mx-auto mb-5 shadow-card">
            <LogoMark />
          </div>
          <h1 className="text-zinc-100 text-xl font-semibold tracking-tight mb-1">DB Studio</h1>
          <p className="text-zinc-500 text-sm">{subtitle}</p>
        </div>

        {/* ── Join invite screen ────────────────────────────────────────────── */}
        {screen === 'join' && inviteInfo && (
          <div className="bg-surface border border-zinc-800 rounded-2xl p-6 shadow-card space-y-5">
            {/* Invite banner */}
            <div className="bg-violet-500/[0.08] border border-violet-500/20 rounded-xl px-4 py-3 space-y-0.5">
              <p className="text-violet-300 text-xs font-medium">Invited to join</p>
              <p className="text-zinc-200 text-sm font-semibold">{inviteInfo.org_name}</p>
              <p className="text-zinc-500 text-xs">{inviteInfo.email} · {inviteInfo.role === 'org_admin' ? 'Admin' : 'Member'} · {inviteInfo.org_name}</p>
            </div>

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Choose a username</label>
                <input type="text" autoComplete="username" value={username}
                  onChange={e => { setUsername(e.target.value); clearMessages(); }}
                  placeholder="username" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showJoinPwd ? 'text' : 'password'} autoComplete="new-password"
                    value={joinPwd} onChange={e => { setJoinPwd(e.target.value); clearMessages(); }}
                    placeholder="At least 8 characters" required className={inputCls + ' pr-10'} />
                  <button type="button" tabIndex={-1} onClick={() => setShowJoinPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    <EyeIcon open={showJoinPwd} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm password</label>
                <div className="relative">
                  <input type={showJoinConf ? 'text' : 'password'} autoComplete="new-password"
                    value={joinConf} onChange={e => { setJoinConf(e.target.value); clearMessages(); }}
                    placeholder="Re-enter password" required className={inputCls + ' pr-10'} />
                  <button type="button" tabIndex={-1} onClick={() => setShowJoinConf(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    <EyeIcon open={showJoinConf} />
                  </button>
                </div>
              </div>
              <ErrorBox msg={error} />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Joining…</> : 'Join organization'}
              </button>
            </form>
          </div>
        )}

        {/* ── Email verification screen ─────────────────────────────────────── */}
        {screen === 'verify-email' && (
          <div className="bg-surface border border-zinc-800 rounded-2xl p-6 shadow-card space-y-5">
            <div className="flex justify-center"><MailIcon /></div>
            <div className="text-center space-y-1">
              <p className="text-zinc-200 text-sm font-medium">Check your inbox</p>
              <p className="text-zinc-500 text-xs leading-relaxed">
                We sent a 6-digit code to<br/>
                <span className="text-zinc-300 font-medium">{pendingEmail}</span>
              </p>
            </div>
            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Verification code</label>
                <OtpInput value={otpValue} onChange={v => { setOtpValue(v); clearMessages(); }} />
              </div>
              <ErrorBox msg={error} />
              <SuccessBox msg={success} />
              <button type="submit" disabled={loading || otpValue.length !== 6}
                className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Verifying…</> : 'Verify email'}
              </button>
            </form>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <BackIcon /> Back
              </button>
              <ResendButton userId={pendingId} type="verify_email"
                onSuccess={msg => setSuccess(msg)} onError={msg => setError(msg)} />
            </div>
          </div>
        )}

        {/* ── Forgot password — enter email ─────────────────────────────────── */}
        {screen === 'forgot-email' && (
          <div className="bg-surface border border-zinc-800 rounded-2xl p-6 shadow-card">
            <form onSubmit={handleForgotEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account email</label>
                <input type="email" autoComplete="email" value={email}
                  onChange={e => { setEmail(e.target.value); clearMessages(); }}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
              <ErrorBox msg={error} />
              <SuccessBox msg={success} />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Sending…</> : 'Send reset code'}
              </button>
            </form>
            <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-4">
              <BackIcon /> Back to sign in
            </button>
          </div>
        )}

        {/* ── Forgot password — OTP + new password ─────────────────────────── */}
        {screen === 'forgot-reset' && (
          <div className="bg-surface border border-zinc-800 rounded-2xl p-6 shadow-card space-y-5">
            <div className="flex justify-center"><MailIcon /></div>
            <div className="text-center space-y-1">
              <p className="text-zinc-200 text-sm font-medium">Reset code sent</p>
              <p className="text-zinc-500 text-xs">Code sent to <span className="text-zinc-300 font-medium">{pendingEmail}</span></p>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">6-digit reset code</label>
                <OtpInput value={otpValue} onChange={v => { setOtpValue(v); clearMessages(); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">New password</label>
                <div className="relative">
                  <input type={showNewPwd ? 'text' : 'password'} autoComplete="new-password"
                    value={newPwd} onChange={e => { setNewPwd(e.target.value); clearMessages(); }}
                    placeholder="At least 8 characters" required className={inputCls + ' pr-10'} />
                  <button type="button" tabIndex={-1} onClick={() => setShowNewPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    <EyeIcon open={showNewPwd} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm new password</label>
                <div className="relative">
                  <input type={showNewConf ? 'text' : 'password'} autoComplete="new-password"
                    value={newPwdConf} onChange={e => { setNewPwdConf(e.target.value); clearMessages(); }}
                    placeholder="Re-enter new password" required className={inputCls + ' pr-10'} />
                  <button type="button" tabIndex={-1} onClick={() => setShowNewConf(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                    <EyeIcon open={showNewConf} />
                  </button>
                </div>
              </div>
              <ErrorBox msg={error} />
              <button type="submit" disabled={loading || otpValue.length !== 6}
                className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Resetting…</> : 'Reset password'}
              </button>
            </form>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <BackIcon /> Back
              </button>
              <ResendButton userId={pendingId} type="reset_password"
                onSuccess={msg => setSuccess(msg)} onError={msg => setError(msg)} />
            </div>
          </div>
        )}

        {/* ── Main form (login / register / setup) ─────────────────────────── */}
        {screen === 'form' && (
          <>
            {isSetup && (
              <div className="flex items-start gap-3 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl px-4 py-3 mb-5">
                <svg className="text-amber-400 shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L13 12H1L7 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <p className="text-amber-400/90 text-xs leading-relaxed">
                  First-time setup — creates your organization and a super admin account with full platform access.
                </p>
              </div>
            )}

            {!isSetup && (
              <div className="flex bg-surface border border-zinc-800 rounded-xl p-1 mb-4">
                {[['login', 'Sign in'], ['register', 'New organization']].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => switchTab(key)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                      tab === key ? 'bg-gradient-violet text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                    }`}>{label}</button>
                ))}
              </div>
            )}

            <div className="bg-surface border border-zinc-800 rounded-2xl p-6 shadow-card">
              <form onSubmit={handleFormSubmit} className="space-y-4">

                {(isRegister || isSetup) && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Organization name</label>
                    <input type="text" autoComplete="organization" value={orgName}
                      onChange={e => { setOrgName(e.target.value); clearMessages(); }}
                      placeholder="Acme Corp" required className={inputCls} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    {tab === 'login' && !isSetup ? 'Username or email' : 'Username'}
                  </label>
                  <input type="text" autoComplete="username" value={username}
                    onChange={e => { setUsername(e.target.value); clearMessages(); }}
                    placeholder={tab === 'login' && !isSetup ? 'Username or email' : 'Enter username'}
                    required className={inputCls} />
                </div>

                {(isRegister || isSetup) && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Work email{isSetup && <span className="text-zinc-600 ml-1">(optional)</span>}
                    </label>
                    <input type="email" autoComplete="email" value={email}
                      onChange={e => { setEmail(e.target.value); clearMessages(); }}
                      placeholder="you@company.com" required={isRegister} className={inputCls} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'}
                      autoComplete={isRegister || isSetup ? 'new-password' : 'current-password'}
                      value={password} onChange={e => { setPassword(e.target.value); clearMessages(); }}
                      placeholder={isRegister || isSetup ? 'At least 8 characters' : 'Enter password'}
                      required className={inputCls + ' pr-10'} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                      <EyeIcon open={showPwd} />
                    </button>
                  </div>
                </div>

                {(isRegister || isSetup) && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm password</label>
                    <div className="relative">
                      <input type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                        value={confirm} onChange={e => { setConfirm(e.target.value); clearMessages(); }}
                        placeholder="Re-enter password" required className={inputCls + ' pr-10'} />
                      <button type="button" tabIndex={-1} onClick={() => setShowConfirm(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                        <EyeIcon open={showConfirm} />
                      </button>
                    </div>
                  </div>
                )}

                <ErrorBox msg={error} />
                <SuccessBox msg={success} />

                {isRegister && (
                  <p className="text-zinc-600 text-xs leading-relaxed">
                    You'll be the <span className="text-zinc-500 font-medium">admin</span> of your organization. Invite teammates after signing in.
                  </p>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm mt-1">
                  {loading ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Please wait…</>
                  ) : (
                    isSetup ? 'Create admin account' : isRegister ? 'Create organization' : 'Sign in'
                  )}
                </button>
              </form>

              {!isSetup && tab === 'login' && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => { setEmail(''); clearMessages(); setScreen('forgot-email'); }}
                    className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
