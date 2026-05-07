import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import ShareQueryModal from '../components/ShareQueryModal.jsx';

function relTime(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function SqlIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-violet-400">
      <path d="M2 4L5 7L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M5 1C5 1 3.5 3 3.5 5s1.5 4 1.5 4M5 1c0 0 1.5 2 1.5 4S5 9 5 9M1 5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <circle cx="10" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="10" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="2" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3.4 5.2L8.6 3M3.4 6.8l5.2 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 3.5h8M5 3.5V2.5h2v1M9 3.5l-.6 6.5H3.6L3 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M5 2H2.5A1.5 1.5 0 001 3.5v6A1.5 1.5 0 002.5 11h6A1.5 1.5 0 0010 9.5V7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M7.5 1H11v3.5M11 1L6 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function EmptyState({ tab }) {
  const messages = {
    all:    { title: 'No saved queries yet', sub: 'Head to the SQL Editor to write and save your first query.' },
    mine:   { title: 'You haven\'t saved any queries', sub: 'Open the SQL Editor, write a query, and hit Save.' },
    shared: { title: 'Nothing shared with you', sub: 'When someone shares a query with you, it will appear here.' },
    public: { title: 'No public queries', sub: 'Queries marked as public will show up here.' },
  };
  const { title, sub } = messages[tab] || messages.all;
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-surface border border-zinc-800 flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-zinc-500">
          <rect x="1.5" y="1.5" width="19" height="19" rx="4.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M6 8.5h10M6 11h8M6 13.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-xs">{sub}</p>
      </div>
    </div>
  );
}

function QueryCard({ q, onOpen, onShare, onDelete }) {
  const [delConfirm, setDelConfirm] = useState(false);

  const handleDelete = (e) => {
    e.stopPropagation();
    if (delConfirm) { onDelete(q.id); setDelConfirm(false); }
    else setDelConfirm(true);
  };

  useEffect(() => {
    if (!delConfirm) return;
    const t = setTimeout(() => setDelConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [delConfirm]);

  return (
    <div
      onClick={() => onOpen(q)}
      className="group relative bg-surface border border-zinc-800 rounded-2xl p-5 hover:border-violet-500/25 hover:bg-surface transition-all cursor-pointer flex flex-col gap-3.5 min-h-[148px]"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <SqlIcon />
          </div>
          <span className="text-sm font-semibold text-zinc-100 truncate leading-snug">{q.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          {q.is_public && (
            <span className="flex items-center gap-1 text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-md font-medium">
              <GlobeIcon />public
            </span>
          )}
          {!q.is_public && !q.is_owner && (
            <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md font-medium">shared</span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-[12px] text-zinc-500 leading-relaxed line-clamp-2 flex-1 min-h-[2.5rem]">
        {q.description || <span className="italic text-zinc-500">No description</span>}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          {q.is_owner
            ? <span className="text-zinc-600">yours</span>
            : q.created_by && <span>by <span className="text-zinc-500">{q.created_by}</span></span>
          }
          {q.updated_at && <><span>·</span><span>{relTime(q.updated_at)}</span></>}
        </div>

        {/* Hover actions */}
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={e => { e.stopPropagation(); onOpen(q); }}
            title="Open in Editor"
            className="p-1.5 text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
          >
            <OpenIcon />
          </button>
          {q.is_owner && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onShare(q); }}
                title="Share"
                className="p-1.5 text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
              >
                <ShareIcon />
              </button>
              <button
                onClick={handleDelete}
                title={delConfirm ? 'Click again to confirm' : 'Delete'}
                className={`p-1.5 rounded-lg transition-all ${
                  delConfirm
                    ? 'text-red-400 bg-red-500/10 ring-1 ring-red-500/30'
                    : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
                }`}
              >
                {delConfirm
                  ? <span className="text-[10px] font-semibold px-0.5">confirm?</span>
                  : <TrashIcon />
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'all',    label: 'All'    },
  { key: 'mine',   label: 'Mine'   },
  { key: 'shared', label: 'Shared' },
  { key: 'public', label: 'Public' },
];

export default function QueriesPage({ onOpenInEditor }) {
  const [queries,    setQueries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [tab,        setTab]        = useState('all');
  const [shareQuery, setShareQuery] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/queries');
      setQueries(res.data.queries || []);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/queries/${id}`);
      setQueries(prev => prev.filter(q => q.id !== id));
    } catch (_) {}
  };

  const filtered = queries.filter(q => {
    if (tab === 'mine'   && !q.is_owner)   return false;
    if (tab === 'shared' && q.is_owner)    return false;
    if (tab === 'public' && !q.is_public)  return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return q.name.toLowerCase().includes(s) || (q.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const mine   = queries.filter(q => q.is_owner);
  const shared = queries.filter(q => !q.is_owner);
  const pub    = queries.filter(q => q.is_public);

  return (
    <div className="flex flex-col h-full bg-base font-sans overflow-hidden">

      {/* ── Page header ── */}
      <div className="shrink-0 border-b border-zinc-800 bg-base">
        <div className="px-8 pt-7 pb-0">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Queries</h1>
              {!loading && (
                <div className="flex items-center gap-3 mt-1.5">
                  <Stat n={queries.length} label="total" />
                  <span className="text-zinc-800">·</span>
                  <Stat n={mine.length}    label="mine"   color="violet" />
                  <span className="text-zinc-800">·</span>
                  <Stat n={shared.length}  label="shared" color="emerald" />
                  {pub.length > 0 && <>
                    <span className="text-zinc-800">·</span>
                    <Stat n={pub.length} label="public" color="sky" />
                  </>}
                </div>
              )}
            </div>
            <button
              onClick={() => onOpenInEditor()}
              className="flex items-center gap-1.5 text-xs px-3.5 py-2 bg-gradient-violet hover:opacity-90 text-white rounded-xl font-medium transition-all shadow-sm"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              New query
            </button>
          </div>

          {/* Search + tabs row */}
          <div className="flex items-center gap-4">
            <div className="relative w-64 shrink-0">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12" height="12" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M11 11L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search queries…"
                className="w-full bg-surface border border-zinc-800 text-zinc-300 text-xs rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-500 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors text-base leading-none">×</button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    tab === t.key
                      ? 'bg-violet-500/12 text-violet-300 border border-violet-500/25'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/20'
                  }`}
                >
                  {t.label}
                  {t.key !== 'all' && (
                    <span className={`ml-1.5 text-[10px] tabular-nums ${tab === t.key ? 'text-violet-400/70' : 'text-zinc-500'}`}>
                      {t.key === 'mine'   ? mine.length
                      : t.key === 'shared' ? shared.length
                      : pub.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab underline spacer */}
          <div className="h-4" />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin-fast" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <>
            {search && (
              <p className="text-xs text-zinc-600 mb-4">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for <span className="text-zinc-400">"{search}"</span>
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(q => (
                <QueryCard
                  key={q.id}
                  q={q}
                  onOpen={onOpenInEditor}
                  onShare={setShareQuery}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {shareQuery && (
        <ShareQueryModal
          query={shareQuery}
          onClose={() => setShareQuery(null)}
          onSaved={() => { load(); setShareQuery(null); }}
        />
      )}
    </div>
  );
}

function Stat({ n, label, color }) {
  const colors = {
    violet:  'text-violet-400',
    emerald: 'text-emerald-400',
    sky:     'text-sky-400',
  };
  return (
    <span className="text-xs text-zinc-600">
      <span className={colors[color] || 'text-zinc-300'}>{n}</span> {label}
    </span>
  );
}
