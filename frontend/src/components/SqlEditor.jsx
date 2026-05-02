import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import api from '../api/client.js';
import ShareQueryModal from './ShareQueryModal.jsx';
import { exportCsv, exportExcel } from '../utils/export.js';

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0d0d10',
    color: '#e4e4e7',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  '.cm-scroller': { overflow: 'auto', minHeight: '160px', maxHeight: 'clamp(160px, 40vh, 480px)' },
  '.cm-content': { caretColor: '#a78bfa', padding: '12px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#a78bfa' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: '#4c1d9540 !important' },
  '.cm-gutters': {
    backgroundColor: '#111113',
    color: '#3f3f46',
    borderRight: '1px solid #27272a',
    paddingRight: '8px',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': { color: '#3f3f46', fontSize: '11px' },
  '.cm-activeLine':       { backgroundColor: '#18181b' },
  '.cm-activeLineGutter': { backgroundColor: '#18181b', color: '#52525b' },
  '.cm-line': { padding: '0 16px' },
}, { dark: true });

// ── Save modal ────────────────────────────────────────────────────────────────
function SaveModal({ initialName = '', initialDesc = '', onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Query name is required.'); return; }
    setSaving(true); setError('');
    try { await onSave(name.trim(), desc.trim()); onClose(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to save.'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#111113] border border-white/[0.08] rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-zinc-100 font-semibold text-sm">Save query</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Name</label>
            <input
              autoFocus type="text" value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Monthly active users"
              maxLength={100}
              className="w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Description <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="What does this query do?"
              maxLength={500}
              className="w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-xs py-2 rounded-xl border border-white/[0.07] text-zinc-400 hover:text-zinc-200 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 text-xs py-2 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-medium transition-all">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Query list item ───────────────────────────────────────────────────────────
function QueryItem({ q, isActive, onLoad, onShare, onDelete }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      onClick={onLoad}
      className={`group relative rounded-lg px-2.5 py-1.5 cursor-pointer transition-all ${
        isActive
          ? 'bg-violet-500/[0.10] border border-violet-500/20'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      {/* Name row */}
      <div className="flex items-center gap-1 min-w-0 pr-10">
        <p className={`text-[11px] font-medium truncate flex-1 leading-snug ${isActive ? 'text-violet-300' : 'text-zinc-300'}`}>
          {q.name}
        </p>
        {q.is_public && (
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" className="text-violet-500/60 shrink-0" title="Public">
            <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M4 1C4 1 3 2.5 3 4s1 3 1 3M4 1c0 0 1 1.5 1 3s-1 3-1 3M1 4h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        )}
        {!q.is_public && !q.is_owner && (
          <span className="text-[9px] text-emerald-600/80 shrink-0 leading-none">shared</span>
        )}
      </div>

      {/* Sub-line: description or author */}
      {(q.description || (!q.is_owner && q.created_by)) && (
        <p className="text-[10px] text-zinc-600 truncate mt-0.5 pr-10 leading-snug">
          {q.description || `by ${q.created_by}`}
        </p>
      )}

      {/* Owner actions on hover */}
      {q.is_owner && (
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onShare} title="Share"
            className="p-1 text-zinc-600 hover:text-violet-400 transition-colors rounded"
          >
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
              <circle cx="9" cy="2" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <circle cx="2" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3.4 4.7L7.6 2.8M3.4 6.3l4.2 1.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          </button>
          {confirm ? (
            <button onClick={() => { onDelete(); setConfirm(false); }}
              className="px-1 py-0.5 text-red-400 hover:text-red-300 transition-colors rounded text-[9px] font-semibold"
            >del?</button>
          ) : (
            <button onClick={() => setConfirm(true)} title="Delete"
              className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
            >
              <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
                <path d="M2 3h7M4.5 3V2h2v1M8.5 3l-.5 6H3L2.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Saved queries panel ───────────────────────────────────────────────────────
function SavedQueriesPanel({ onLoad, activeId, currentUserId, readOnly = false }) {
  const [queries,    setQueries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
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

  const mine   = queries.filter(q => q.is_owner);
  const shared = queries.filter(q => !q.is_owner);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Queries</span>
        {loading
          ? <span className="w-3 h-3 border border-zinc-700 border-t-violet-500 rounded-full animate-spin-fast" />
          : <span className="text-[10px] text-zinc-700 tabular-nums">{queries.length}</span>
        }
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-3 min-h-0">
        {!loading && queries.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-8 px-3 leading-relaxed">
            {readOnly
              ? 'No queries have been shared with you yet.'
              : 'No saved queries yet.\nSave one from the editor.'}
          </p>
        )}

        {mine.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest px-2 pb-0.5">
              Mine <span className="normal-case font-normal tracking-normal text-zinc-700/60">({mine.length})</span>
            </p>
            {mine.map(q => (
              <QueryItem
                key={q.id} q={q} isActive={activeId === q.id}
                onLoad={() => onLoad(q)}
                onShare={() => setShareQuery(q)}
                onDelete={() => handleDelete(q.id)}
              />
            ))}
          </div>
        )}

        {shared.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest px-2 pb-0.5">
              Shared <span className="normal-case font-normal tracking-normal text-zinc-700/60">({shared.length})</span>
            </p>
            {shared.map(q => (
              <QueryItem
                key={q.id} q={q} isActive={activeId === q.id}
                onLoad={() => onLoad(q)}
                onShare={() => {}}
                onDelete={() => {}}
              />
            ))}
          </div>
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

// ── Export menu ───────────────────────────────────────────────────────────────
function ExportMenu({ rows, fields, filename }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-[#1a1a1e] hover:bg-[#222228] border border-white/[0.07] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200 rounded-lg transition-all"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M5.5 1v6M2.5 5l3 3 3-3M1 9h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Export
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1.5 2.5l2.5 3 2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-[#111113] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden z-20">
          <button
            onClick={() => { exportCsv(rows, fields, filename); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] flex items-center gap-2 transition-colors"
          >
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="0.5" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M3 5h5M3 7.5h5M3 10h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Export CSV
          </button>
          <div className="border-t border-white/[0.05]" />
          <button
            onClick={() => { exportExcel(rows, fields, filename); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] flex items-center gap-2 transition-colors"
          >

            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="0.5" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M3 4.5l2 3-2 3M8 4.5l-2 3 2 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export Excel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────
function ResultsTable({ result, error, filename = 'query-results' }) {
  if (error) {
    return (
      <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs font-mono whitespace-pre-wrap">
        {error}
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs">
          {result.rows?.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-500/[0.08] border border-emerald-500/20 px-3 py-1.5 rounded-lg">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {result.rows.length} row{result.rows.length !== 1 ? 's' : ''} returned
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-violet-400 font-medium bg-violet-500/[0.08] border border-violet-500/20 px-3 py-1.5 rounded-lg">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {result.rowsAffected ?? 0} row{(result.rowsAffected ?? 0) !== 1 ? 's' : ''} affected
            </span>
          )}
        </div>
        {result.rows?.length > 0 && (
          <ExportMenu rows={result.rows} fields={result.fields} filename={filename} />
        )}
      </div>

      {result.rows?.length > 0 && (
        <div className="overflow-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-[#18181b] border-b-2 border-zinc-800">
                {(result.fields?.length > 0 ? result.fields.map(f => f.name) : Object.keys(result.rows[0])).map(k => (
                  <th key={k} className="px-4 py-2.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-800/60 last:border-r-0">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className={`border-b border-zinc-800/70 last:border-0 hover:bg-[#1c1c1f] transition-colors ${i % 2 === 0 ? 'bg-[#111113]' : 'bg-[#0f0f12]'}`}>
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-4 py-2 whitespace-nowrap font-mono text-xs border-r border-zinc-800/40 last:border-r-0">
                      {val === null
                        ? <span className="text-zinc-700 italic">NULL</span>
                        : <span className="text-zinc-300">{String(val)}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Run button ────────────────────────────────────────────────────────────────
function RunButton({ running, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={running || disabled}
      className="text-xs px-3.5 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-40 text-white rounded-xl font-medium flex items-center gap-1.5 transition-all"
    >
      {running
        ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" />Running…</>
        : <><svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor"><path d="M0.5 1l8 4-8 4V1z"/></svg>Run</>
      }
    </button>
  );
}

// ── Panel toggle ──────────────────────────────────────────────────────────────
function PanelToggle({ open, onClick }) {
  return (
    <button onClick={onClick} title={open ? 'Hide panel' : 'Show queries'}
      className="text-zinc-600 hover:text-zinc-400 transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5 1v12" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SqlEditor({ user, dbPermission }) {
  const canEdit = dbPermission === 'full' || !dbPermission;

  const editorRef  = useRef(null);
  const viewRef    = useRef(null);
  const sqlRef     = useRef('SELECT * FROM ');

  const [result,        setResult]        = useState(null);
  const [error,         setError]         = useState('');
  const [running,       setRunning]       = useState(false);
  const [saveModal,     setSaveModal]     = useState(false);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [reloadKey,     setReloadKey]     = useState(0);
  const [activeId,      setActiveId]      = useState(null);
  const [loadingSql,    setLoadingSql]    = useState(false);
  const [loadedQuery,   setLoadedQuery]   = useState(null);  // { id, name, description, is_owner }
  const [updateStatus,  setUpdateStatus]  = useState(null);  // null | 'saving' | 'saved' | 'error'
  const [updateError,   setUpdateError]   = useState('');

  // Read-only mode
  const [selectedQuery, setSelectedQuery] = useState(null);

  const setEditorContent = (newSql) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newSql } });
    sqlRef.current = newSql;
  };

  const handleLoadFull = useCallback(async (q, { autoRun = false } = {}) => {
    setActiveId(q.id);
    setLoadedQuery(q);
    setLoadingSql(true);
    setError('');
    setResult(null);
    setUpdateStatus(null);
    setUpdateError('');
    try {
      const res = await api.get(`/queries/${q.id}`);
      const fetchedQuery = res.data.query;
      setLoadedQuery(prev => ({ ...prev, ...fetchedQuery }));
      setEditorContent(fetchedQuery.sql);
      if (autoRun) {
        setRunning(true);
        try {
          const runRes = await api.post('/query', { sql: fetchedQuery.sql });
          setResult(runRes.data);
        } catch (runErr) {
          setError(runErr.response?.data?.error || 'Query failed');
        } finally { setRunning(false); }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load query.');
      setLoadedQuery(null);
      setActiveId(null);
    } finally {
      setLoadingSql(false);
    }
  }, []);

  const handleLoadReadOnly = useCallback((q) => {
    setSelectedQuery(q);
    setActiveId(q.id);
    setResult(null);
    setError('');
  }, []);

  const clearLoadedQuery = () => {
    setLoadedQuery(null);
    setActiveId(null);
    setUpdateStatus(null);
    setUpdateError('');
  };

  // Load a pending query coming from the Queries dashboard (stored in sessionStorage)
  useEffect(() => {
    const raw = sessionStorage.getItem('db_pendingQuery');
    if (!raw) return;
    sessionStorage.removeItem('db_pendingQuery');
    let q;
    try { q = JSON.parse(raw); } catch { return; }

    if (canEdit) {
      handleLoadFull(q, { autoRun: true });
    } else {
      // Read-only: select the query in the panel and run it via the saved-query endpoint
      handleLoadReadOnly(q);
      setRunning(true); setError(''); setResult(null);
      api.post(`/queries/${q.id}/run`)
        .then(res => setResult(res.data))
        .catch(err => setError(err.response?.data?.error || 'Query failed'))
        .finally(() => setRunning(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canEdit || !editorRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: sqlRef.current,
        extensions: [
          lineNumbers(), history(), indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle),
          closeBrackets(), sql(), highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          editorTheme, EditorView.lineWrapping,
          EditorView.updateListener.of(u => {
            if (u.docChanged) {
              sqlRef.current = u.state.doc.toString();
              // Clear "saved" status once user starts editing again
              setUpdateStatus(s => s === 'saved' ? null : s);
            }
          }),
        ],
      }),
      parent: editorRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [canEdit]);

  const runQuery = async () => {
    const query = sqlRef.current.trim();
    if (!query) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const res = await api.post('/query', { sql: query });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Query failed');
    } finally { setRunning(false); }
  };

  const updateQuery = async () => {
    if (!loadedQuery) return;
    const sql = sqlRef.current.trim();
    if (!sql) return;
    setUpdateStatus('saving');
    setUpdateError('');
    try {
      await api.put(`/queries/${loadedQuery.id}`, { sql });
      setUpdateStatus('saved');
      setReloadKey(k => k + 1);
      setTimeout(() => setUpdateStatus(s => s === 'saved' ? null : s), 2500);
    } catch (err) {
      setUpdateStatus('error');
      setUpdateError(err.response?.data?.error || 'Failed to update.');
    }
  };

  const runSavedQuery = async () => {
    if (!selectedQuery) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const res = await api.post(`/queries/${selectedQuery.id}/run`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Query failed');
    } finally { setRunning(false); }
  };

  const handleSaveNew = async (name, description) => {
    await api.post('/queries', { name, description, sql: sqlRef.current.trim() });
    setReloadKey(k => k + 1);
  };

  // ── Read-only view ──────────────────────────────────────────────────────────
  if (!canEdit) {
    return (
      <div className="flex h-full bg-[#09090b]">
        {panelOpen && (
          <div className="w-52 shrink-0 border-r border-white/[0.06] bg-[#0d0d10] flex flex-col">
            <SavedQueriesPanel
              key={reloadKey}
              onLoad={handleLoadReadOnly}
              activeId={activeId}
              currentUserId={user?.id}
              readOnly
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col font-sans overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2">
              <PanelToggle open={panelOpen} onClick={() => setPanelOpen(p => !p)} />
              <span className="text-xs font-semibold text-zinc-300">Queries..</span>
              <span className="text-[10px] text-zinc-600 bg-[#1a1a1e] border border-zinc-800/80 px-1.5 py-0.5 rounded-md">view only</span>
            </div>
            {selectedQuery && <RunButton running={running} onClick={runSavedQuery} />}
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
            {!selectedQuery ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#111113] border border-white/[0.06] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-zinc-700">
                    <rect x="1.5" y="1.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M5 6.5h8M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-400 text-sm font-medium">Select a query to run</p>
                  <p className="text-zinc-700 text-xs mt-0.5">
                    {panelOpen ? 'Choose a shared query from the left' : 'Open the panel to see shared queries'}
                  </p>
                </div>
                {!panelOpen && (
                  <button onClick={() => setPanelOpen(true)} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    Show queries panel
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#111113] border border-white/[0.07] rounded-xl px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">{selectedQuery.name}</span>
                    {selectedQuery.is_public && (
                      <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1"/><path d="M4 1C4 1 3 2.5 3 4s1 3 1 3M4 1c0 0 1 1.5 1 3s-1 3-1 3M1 4h6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                        public
                      </span>
                    )}
                  </div>
                  {selectedQuery.description && <p className="text-xs text-zinc-500">{selectedQuery.description}</p>}
                  {selectedQuery.created_by && !selectedQuery.is_owner && (
                    <p className="text-[11px] text-zinc-600">by <span className="text-zinc-500">{selectedQuery.created_by}</span></p>
                  )}
                </div>
                <ResultsTable result={result} error={error} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Full editor view ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-[#09090b]">
      {panelOpen && (
        <div className="w-52 shrink-0 border-r border-white/[0.06] bg-[#0d0d10] flex flex-col">
          <SavedQueriesPanel
            key={reloadKey}
            onLoad={handleLoadFull}
            activeId={activeId}
            currentUserId={user?.id}
          />
        </div>
      )}

      <div
        className="flex-1 min-w-0 flex flex-col font-sans overflow-hidden"
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
      >
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0 gap-3">
          {/* Left: toggle + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <PanelToggle open={panelOpen} onClick={() => setPanelOpen(p => !p)} />
            <span className="text-xs font-semibold text-zinc-400 shrink-0">SQL Editor</span>
            {loadedQuery && (
              <>
                <span className="text-zinc-700 shrink-0">/</span>
                <span className="text-xs text-zinc-300 font-medium truncate max-w-[140px]">{loadedQuery.name}</span>
                <button
                  onClick={clearLoadedQuery}
                  title="Unlink query"
                  className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              </>
            )}
            {!loadedQuery && (
              <span className="text-[10px] text-zinc-700 bg-[#1a1a1e] border border-zinc-800/80 px-1.5 py-0.5 rounded font-mono shrink-0">⌘↵</span>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {loadedQuery ? (
              <>
                {/* Update existing query */}
                {loadedQuery.is_owner && (
                  <button
                    onClick={updateQuery}
                    disabled={updateStatus === 'saving'}
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all border ${
                      updateStatus === 'saved'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : updateStatus === 'error'
                        ? 'bg-red-500/10 border-red-500/25 text-red-400'
                        : 'bg-[#1a1a1e] border-white/[0.07] hover:border-white/[0.14] text-zinc-300 hover:text-zinc-100'
                    } disabled:opacity-50`}
                  >
                    {updateStatus === 'saving' ? (
                      <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin-fast" />Saving…</>
                    ) : updateStatus === 'saved' ? (
                      <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Saved</>
                    ) : updateStatus === 'error' ? (
                      'Failed'
                    ) : (
                      <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M2 5.5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>Update</>
                    )}
                  </button>
                )}
                {/* Save as new copy */}
                <button
                  onClick={() => setSaveModal(true)}
                  className="text-xs px-2.5 py-1.5 bg-[#1a1a1e] hover:bg-[#222228] border border-white/[0.07] hover:border-white/[0.12] text-zinc-500 hover:text-zinc-300 rounded-xl transition-all"
                  title="Save as new query"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              </>
            ) : (
              /* Save new */
              <button
                onClick={() => setSaveModal(true)}
                className="text-xs px-2.5 py-1.5 bg-[#1a1a1e] hover:bg-[#222228] border border-white/[0.07] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200 rounded-xl flex items-center gap-1.5 transition-all"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Save
              </button>
            )}
            <RunButton running={running} onClick={runQuery} />
          </div>
        </div>

        {/* Update error */}
        {updateError && (
          <div className="px-4 pt-2 shrink-0">
            <p className="text-[11px] text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-1.5">{updateError}</p>
          </div>
        )}

        {/* Editor */}
        <div className="px-4 pt-3 shrink-0">
          <div
            ref={editorRef}
            className={`rounded-xl border overflow-hidden transition-all ${
              loadingSql ? 'opacity-50 pointer-events-none border-zinc-800' : 'border-zinc-800'
            }`}
            style={{ minHeight: '160px', maxHeight: 'clamp(160px, 40vh, 480px)' }}
          />
          {loadingSql && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-600">
              <span className="w-3 h-3 border border-zinc-700 border-t-violet-500 rounded-full animate-spin-fast" />
              Loading…
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4 space-y-3 min-h-0">
          <ResultsTable
            result={result}
            error={error}
            filename={loadedQuery ? loadedQuery.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() : 'query-results'}
          />
        </div>
      </div>

      {saveModal && (
        <SaveModal
          initialName={loadedQuery ? `${loadedQuery.name} (copy)` : ''}
          initialDesc={loadedQuery?.description || ''}
          onSave={handleSaveNew}
          onClose={() => setSaveModal(false)}
        />
      )}
    </div>
  );
}
