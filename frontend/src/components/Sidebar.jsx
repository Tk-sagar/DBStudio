import { useState, useEffect } from 'react';
import api from '../api/client.js';

function TableIcon({ active }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <rect x="0.5" y="0.5" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M0.5 4.5h12M4.5 4.5v8" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

function SqlIcon({ active }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <path d="M2 4.5l3.5 3-3.5 3M8 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Sidebar({ selectedTable, onTableSelect, onSqlOpen, activeView, initialTables, dbPermission }) {
  const [tables,  setTables]  = useState(initialTables || []);
  const [loading, setLoading] = useState(!initialTables?.length);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  const canUseSql = dbPermission === 'full' || dbPermission == null;

  useEffect(() => {
    if (initialTables?.length) return;
    api.get('/tables')
      .then(res => setTables(res.data.tables || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load tables'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = tables.filter(t => t.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="w-[220px] bg-[#111113] border-r border-white/[0.07] flex flex-col shrink-0 overflow-hidden">

      {/* Search */}
      <div className="px-3 pt-3.5 pb-2.5">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="3.8" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 10L7.8 7.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search tables…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0d0d10] border border-white/[0.07] text-zinc-300 text-xs rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-700 transition-all"
          />
        </div>
      </div>

      {/* SQL Editor button */}
      {canUseSql && (
        <div className="px-2.5 pb-2">
          <button
            onClick={onSqlOpen}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-all font-medium ${
              activeView === 'sql'
                ? 'bg-violet-500/12 text-violet-300 border border-violet-500/25'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <SqlIcon active={activeView === 'sql'} />
            SQL Editor
          </button>
        </div>
      )}

      {/* Divider + label */}
      <div className="mx-3 mb-1.5 border-t border-white/[0.06]" />
      <div className="px-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-700 select-none">Tables</span>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-0.5">
        {loading && <p className="text-zinc-700 text-xs px-2 py-2">Loading…</p>}
        {error   && <p className="text-red-500/80 text-xs px-2 py-2">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-zinc-700 text-xs px-2 py-2">No tables found</p>
        )}
        {filtered.map(table => {
          const isActive = selectedTable === table && activeView !== 'sql';
          return (
            <button
              key={table}
              onClick={() => onTableSelect(table)}
              title={table}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono truncate transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-violet-500/12 text-violet-300 border border-violet-500/22'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <TableIcon active={isActive} />
              <span className="truncate">{table}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/[0.06]">
        <span className="text-[10px] text-zinc-700 font-medium select-none">
          {tables.length} table{tables.length !== 1 ? 's' : ''}
        </span>
      </div>
    </aside>
  );
}
