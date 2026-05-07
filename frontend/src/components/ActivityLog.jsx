import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ACTION_META = {
  insert: { label: 'INSERT', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  update: { label: 'UPDATE', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  delete: { label: 'DELETE', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
  alter:  { label: 'ALTER',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  drop:   { label: 'DROP',   bg: 'bg-red-900/20',     text: 'text-red-300',     border: 'border-red-700/30' },
};

function ActionBadge({ action }) {
  const m = ACTION_META[action] || { label: action.toUpperCase(), bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-zinc-700' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

function Avatar({ username }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[9px] font-bold uppercase select-none shrink-0">
      {username?.charAt(0) || '?'}
    </span>
  );
}

// ── Row diff ─────────────────────────────────────────────────────────────────

function DataDiff({ oldData, newData, action }) {
  if (!oldData && !newData) return null;

  if (action === 'insert' && newData) {
    const keys = Object.keys(newData);
    if (!keys.length) return null;
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/80 overflow-hidden text-[11px] font-mono">
        {keys.slice(0, 10).map(k => (
          <div key={k} className="flex border-b border-zinc-800 last:border-0">
            <span className="px-2 py-0.5 text-zinc-600 bg-white/[0.09] shrink-0 w-[120px] truncate">{k}</span>
            <span className="px-2 py-0.5 text-emerald-400/90 flex-1 truncate">{String(newData[k] ?? '')}</span>
          </div>
        ))}
        {keys.length > 10 && <div className="px-2 py-0.5 text-zinc-600">…{keys.length - 10} more fields</div>}
      </div>
    );
  }

  if (action === 'delete' && oldData) {
    const keys = Object.keys(oldData);
    if (!keys.length) return null;
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/80 overflow-hidden text-[11px] font-mono">
        {keys.slice(0, 10).map(k => (
          <div key={k} className="flex border-b border-zinc-800 last:border-0">
            <span className="px-2 py-0.5 text-zinc-600 bg-white/[0.09] shrink-0 w-[120px] truncate">{k}</span>
            <span className="px-2 py-0.5 text-red-400/90 line-through flex-1 truncate">{String(oldData[k] ?? '')}</span>
          </div>
        ))}
        {keys.length > 10 && <div className="px-2 py-0.5 text-zinc-600">…{keys.length - 10} more fields</div>}
      </div>
    );
  }

  if (action === 'update' && oldData && newData) {
    const changed = Object.keys(newData).filter(k => String(newData[k]) !== String(oldData[k] ?? ''));
    if (!changed.length) return null;
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/80 overflow-hidden text-[11px] font-mono">
        {changed.slice(0, 10).map(k => (
          <div key={k} className="border-b border-zinc-800 last:border-0">
            <div className="flex">
              <span className="px-2 py-0.5 text-zinc-600 bg-white/[0.09] shrink-0 w-[120px] truncate">{k}</span>
              <span className="px-2 py-0.5 text-red-400/80 line-through flex-1 truncate">{String(oldData[k] ?? '')}</span>
            </div>
            <div className="flex">
              <span className="px-2 py-0.5 text-zinc-800 bg-white/[0.09] shrink-0 w-[120px]" />
              <span className="px-2 py-0.5 text-emerald-400/90 flex-1 truncate">{String(newData[k] ?? '')}</span>
            </div>
          </div>
        ))}
        {changed.length > 10 && <div className="px-2 py-0.5 text-zinc-600">…{changed.length - 10} more changes</div>}
      </div>
    );
  }

  return null;
}

// ── Log entry ─────────────────────────────────────────────────────────────────

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = log.oldData || log.newData;

  return (
    <div className="group px-4 py-3 border-b border-zinc-700/60 hover:bg-zinc-800/20 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar username={log.username} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBadge action={log.action} />
            <span className="text-zinc-300 text-xs font-mono font-medium truncate">{log.tableName}</span>
            {log.rowId != null && (
              <span className="text-zinc-600 text-[11px]">#{String(log.rowId)}</span>
            )}
            {log.detail && (
              <span className="text-zinc-500 text-[11px] truncate max-w-[200px]">{log.detail}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-zinc-500 text-[11px]">{log.username}</span>
            {log.connectionName && (
              <>
                <span className="text-zinc-500 text-[10px]">•</span>
                <span className="text-zinc-600 text-[11px]">{log.connectionName}</span>
              </>
            )}
          </div>
          {expanded && <DataDiff oldData={log.oldData} newData={log.newData} action={log.action} />}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasDiff && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {expanded ? 'hide' : 'diff'}
            </button>
          )}
          <span className="text-zinc-600 text-[11px]" title={formatDate(log.timestamp)}>
            {timeAgo(log.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [filterTable,    setFilterTable]    = useState('');
  const [filterAction,   setFilterAction]   = useState('');
  const [filterUsername, setFilterUsername] = useState('');

  const limit = 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pg, limit };
      if (filterTable.trim())    params.tableName = filterTable.trim();
      if (filterAction)          params.action    = filterAction;
      if (filterUsername.trim()) params.username  = filterUsername.trim();
      const res = await api.get('/audit-logs', { params });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
      setPage(pg);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [filterTable, filterAction, filterUsername]);

  useEffect(() => { load(1); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(1);
  };

  return (
    <div className="h-full flex flex-col bg-base">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200">Activity Log</h2>
          <span className="text-xs text-zinc-600">{total} event{total !== 1 ? 's' : ''}</span>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={filterTable}
            onChange={e => setFilterTable(e.target.value)}
            placeholder="Table name…"
            className="h-7 px-2.5 bg-surface border border-zinc-800 rounded text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-violet-500/40 w-[130px]"
          />
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="h-7 px-2 bg-surface border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-violet-500/40"
          >
            <option value="">All actions</option>
            <option value="insert">INSERT</option>
            <option value="update">UPDATE</option>
            <option value="delete">DELETE</option>
            <option value="alter">ALTER</option>
            <option value="drop">DROP</option>
          </select>
          <input
            type="text"
            value={filterUsername}
            onChange={e => setFilterUsername(e.target.value)}
            placeholder="Username…"
            className="h-7 px-2.5 bg-surface border border-zinc-800 rounded text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-violet-500/40 w-[110px]"
          />
          <button
            type="submit"
            className="h-7 px-3 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded font-medium transition-colors"
          >
            Search
          </button>
          {(filterTable || filterAction || filterUsername) && (
            <button
              type="button"
              onClick={() => { setFilterTable(''); setFilterAction(''); setFilterUsername(''); setTimeout(() => load(1), 0); }}
              className="h-7 px-2.5 text-zinc-500 hover:text-zinc-300 text-xs rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="px-6 py-8 text-center text-red-400 text-sm">{error}</div>
        )}
        {!loading && !error && logs.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-zinc-500 text-sm">No activity found</p>
            <p className="text-zinc-500 text-xs mt-1">Events will appear here as users make changes</p>
          </div>
        )}
        {!loading && logs.map(log => <LogEntry key={log._id} log={log} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/80 shrink-0">
          <button
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-600">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
