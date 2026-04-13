const DB_LABEL  = { mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', sqlite: 'SQLite' };
const DB_DOT    = { mysql: '#f97316', mariadb: '#f97316', postgres: '#38bdf8', sqlite: '#4ade80' };

export default function SavedConnections({ connections, onSelect, onQuickConnect, onDelete }) {
  if (!connections.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-0.5">
        Recent connections
      </p>
      <div className="space-y-1.5">
        {connections.map(conn => (
          <ConnectionCard
            key={conn.id}
            conn={conn}
            onSelect={onSelect}
            onQuickConnect={onQuickConnect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectionCard({ conn, onSelect, onQuickConnect, onDelete }) {
  const subtitle =
    conn.type === 'sqlite'
      ? conn.database
      : `${conn.username}@${conn.host} / ${conn.database}`;
  const dotColor = DB_DOT[conn.type] || '#94a3b8';

  return (
    <div
      onClick={() => onSelect(conn)}
      className="group flex items-center justify-between bg-[#111113] hover:bg-[#18181b] border border-white/[0.07] hover:border-white/[0.12] rounded-xl px-3.5 py-2.5 cursor-pointer transition-all"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate leading-tight">{conn.name}</div>
          <div className="text-xs text-zinc-600 truncate mt-0.5 font-mono">{subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 ml-3 shrink-0">
        <span className="hidden sm:block text-[10px] font-medium px-1.5 py-0.5 bg-white/[0.04] text-zinc-500 rounded-md border border-white/[0.07]">
          {DB_LABEL[conn.type] || conn.type}
        </span>

        {conn.savedPassword && (
          <button
            onClick={e => { e.stopPropagation(); onQuickConnect(conn); }}
            className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1 bg-gradient-violet hover:opacity-90 text-white rounded-md font-medium transition-all"
          >
            Connect
          </button>
        )}

        <button
          onClick={e => { e.stopPropagation(); onDelete(conn.id); }}
          className="opacity-0 group-hover:opacity-100 text-xs w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
        >
          ×
        </button>
      </div>
    </div>
  );
}
