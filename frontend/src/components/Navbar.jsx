import api from '../api/client.js';

const DB_LABEL = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', sqlite: 'SQLite' };
const DB_COLOR = { mysql: '#fb923c', mariadb: '#fb923c', postgres: '#38bdf8', postgresql: '#38bdf8', sqlite: '#4ade80' };

export default function Navbar({ dbInfo, user, onDisconnect, onLogout, onAdmin }) {
  const handleDisconnect = async () => {
    try { await api.delete('/disconnect'); } catch (_) {}
    onDisconnect();
  };

  const dotColor = DB_COLOR[dbInfo?.type] || '#71717a';
  const isAdmin  = user?.role === 'admin';

  return (
    <nav className="h-12 bg-[#111113] border-b border-white/[0.07] flex items-center justify-between px-5 shrink-0 z-20">
      {/* Left: brand + connection */}
      <div className="flex items-center gap-4">
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

        <span className="w-px h-4 bg-white/[0.08]" />

        <div className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}60` }}
          />
          <span className="text-zinc-200 font-medium font-mono">{dbInfo?.name || dbInfo?.database}</span>
          {dbInfo?.host && dbInfo.host !== 'local' && (
            <span className="text-zinc-600">·&nbsp;{dbInfo.host}</span>
          )}
          <span className="px-1.5 py-0.5 bg-white/[0.06] text-zinc-500 rounded-md text-[10px] font-medium uppercase tracking-wide border border-white/[0.07]">
            {DB_LABEL[dbInfo?.type] || dbInfo?.type}
          </span>
        </div>
      </div>

      {/* Right: user + actions */}
      <div className="flex items-center gap-1">
        {user && (
          <span className="text-xs text-zinc-600 font-mono mr-2 select-none">{user.username}</span>
        )}
        {isAdmin && onAdmin && (
          <button
            onClick={onAdmin}
            className="text-xs text-zinc-500 hover:text-violet-300 px-2.5 py-1.5 rounded-lg hover:bg-violet-500/10 border border-transparent hover:border-violet-500/20 transition-all font-medium"
          >
            Admin
          </button>
        )}
        <button
          onClick={handleDisconnect}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-all font-medium"
        >
          Disconnect
        </button>
        <button
          onClick={onLogout}
          className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
