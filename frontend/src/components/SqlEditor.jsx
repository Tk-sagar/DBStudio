import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import api from '../api/client.js';
import ShareQueryModal from './ShareQueryModal.jsx';

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0d0d10',
    color: '#e4e4e7',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  '.cm-scroller': { overflow: 'auto', minHeight: '160px' },
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
              autoFocus
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Monthly active users"
              maxLength={100}
              className="w-full bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description <span className="text-zinc-600">(optional)</span></label>
            <input
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
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

// ── Saved queries side panel ──────────────────────────────────────────────────
function QueryItem({ q, isActive, onLoad, onShare, onDelete, currentUserId }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className={`group rounded-xl border px-3 py-2.5 transition-all cursor-pointer ${
      isActive
        ? 'bg-violet-500/[0.08] border-violet-500/25'
        : 'bg-[#0d0d10] border-white/[0.05] hover:border-white/[0.10]'
    }`}>
      <div className="flex items-start gap-2" onClick={onLoad}>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${isActive ? 'text-violet-300' : 'text-zinc-300'}`}>{q.name}</p>
          {q.description && (
            <p className="text-[10px] text-zinc-600 truncate mt-0.5">{q.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {!q.is_owner && (
              <span className="text-[10px] text-zinc-600">by <span className="text-zinc-500">{q.created_by}</span></span>
            )}
            {q.is_public && (
              <span className="text-[10px] text-violet-500/80 flex items-center gap-0.5">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1"/><path d="M4 1C4 1 3 2.5 3 4s1 3 1 3M4 1c0 0 1 1.5 1 3s-1 3-1 3M1 4h6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                public
              </span>
            )}
            {!q.is_public && q.shared_with?.length > 0 && (
              <span className="text-[10px] text-emerald-500/70">shared</span>
            )}
          </div>
        </div>

        {/* Actions (owner only) */}
        {q.is_owner && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={onShare}
              title="Share"
              className="p-1 text-zinc-600 hover:text-violet-400 transition-colors rounded"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="9" cy="2" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
                <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
                <circle cx="2" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M3.4 4.7L7.6 2.8M3.4 6.3l4.2 1.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            </button>
            {confirm ? (
              <button
                onClick={() => { onDelete(); setConfirm(false); }}
                title="Confirm delete"
                className="p-1 text-red-400 hover:text-red-300 transition-colors rounded text-[10px] font-medium"
              >
                Del?
              </button>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                title="Delete"
                className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 3h7M4.5 3V2h2v1M8.5 3l-.5 6H3L2.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedQueriesPanel({ onLoad, currentSql, currentUserId }) {
  const [queries,    setQueries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeId,   setActiveId]   = useState(null);
  const [shareQuery, setShareQuery] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/queries');
      setQueries(res.data.queries || []);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLoad = (q) => {
    setActiveId(q.id);
    onLoad(q.sql);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/queries/${id}`);
      setQueries(prev => prev.filter(q => q.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (_) {}
  };

  const mine   = queries.filter(q => q.is_owner);
  const shared = queries.filter(q => !q.is_owner);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Saved Queries</span>
        {loading && <span className="w-3 h-3 border border-zinc-700 border-t-violet-500 rounded-full animate-spin-fast" />}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {!loading && queries.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-6 px-3">No saved queries yet. Run a query and click Save.</p>
        )}

        {mine.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1">My queries</p>
            {mine.map(q => (
              <QueryItem
                key={q.id} q={q} isActive={activeId === q.id}
                onLoad={() => handleLoad(q)}
                onShare={() => setShareQuery(q)}
                onDelete={() => handleDelete(q.id)}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}

        {shared.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1">Shared with me</p>
            {shared.map(q => (
              <QueryItem
                key={q.id} q={q} isActive={activeId === q.id}
                onLoad={() => handleLoad(q)}
                onShare={() => {}}
                onDelete={() => {}}
                currentUserId={currentUserId}
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

// ── Main editor ───────────────────────────────────────────────────────────────
export default function SqlEditor({ user }) {
  const editorRef   = useRef(null);
  const viewRef     = useRef(null);
  const sqlRef      = useRef('SELECT * FROM ');
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');
  const [running,   setRunning]   = useState(false);
  const [saveModal, setSaveModal] = useState(null); // null | 'new'
  const [panelOpen, setPanelOpen] = useState(true);

  // reload trigger for the queries panel
  const [reloadKey, setReloadKey] = useState(0);

  const setEditorContent = (newSql) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newSql },
    });
    sqlRef.current = newSql;
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: sqlRef.current,
        extensions: [
          lineNumbers(), history(), indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle),
          closeBrackets(), sql(), highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          editorTheme, EditorView.lineWrapping,
          EditorView.updateListener.of(u => { if (u.docChanged) sqlRef.current = u.state.doc.toString(); }),
        ],
      }),
      parent: editorRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, []);

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

  const handleSaveNew = async (name, description) => {
    await api.post('/queries', { name, description, sql: sqlRef.current.trim() });
    setReloadKey(k => k + 1);
  };

  return (
    <div className="flex h-full bg-[#09090b]">
      {/* ── Saved queries panel ── */}
      {panelOpen && (
        <div className="w-56 shrink-0 border-r border-white/[0.06] bg-[#0d0d10] flex flex-col">
          <SavedQueriesPanel
            key={reloadKey}
            onLoad={setEditorContent}
            currentUserId={user?.id}
          />
        </div>
      )}

      {/* ── Editor + results ── */}
      <div
        className="flex-1 min-w-0 p-6 space-y-4 flex flex-col font-sans"
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPanelOpen(p => !p)}
              title={panelOpen ? 'Hide saved queries' : 'Show saved queries'}
              className="text-zinc-600 hover:text-zinc-400 transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5 1v12" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-zinc-300">SQL Editor</span>
            <span className="text-[10px] text-zinc-600 bg-[#1c1c1f] border border-zinc-800 px-2 py-0.5 rounded-md font-mono">
              ⌘↵ to run
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSaveModal('new')}
              className="text-xs px-3 py-1.5 bg-[#1c1c1f] hover:bg-[#27272a] border border-white/[0.07] hover:border-white/[0.12] text-zinc-300 rounded-xl font-medium flex items-center gap-1.5 transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Save
            </button>
            <button
              onClick={runQuery}
              disabled={running}
              className="text-xs px-4 py-2 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-medium flex items-center gap-2 transition-all"
            >
              {running ? (
                <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin-fast" /> Running…</>
              ) : (
                <><svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor"><path d="M1 1.5l8 4-8 4V1.5z"/></svg> Run</>
              )}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div
          ref={editorRef}
          className="rounded-xl border border-zinc-800 overflow-hidden"
          style={{ minHeight: '160px' }}
        />

        {/* Results */}
        <div className="flex-1 overflow-auto space-y-3">
          {error && (
            <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}

          {result && !error && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                {result.rows.length > 0 ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-500/[0.08] border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {result.rows.length} row{result.rows.length !== 1 ? 's' : ''} returned
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-violet-400 font-medium bg-violet-500/[0.08] border border-violet-500/20 px-3 py-1.5 rounded-lg">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {result.rowsAffected} row{result.rowsAffected !== 1 ? 's' : ''} affected
                  </span>
                )}
              </div>

              {result.rows.length > 0 && (
                <div className="overflow-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-[#18181b] border-b-2 border-zinc-800">
                        {(result.fields.length > 0 ? result.fields.map(f => f.name) : Object.keys(result.rows[0])).map(k => (
                          <th key={k} className="px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-800/60 last:border-r-0">
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className={`border-b border-zinc-800/70 last:border-0 hover:bg-[#1c1c1f] transition-colors ${i % 2 === 0 ? 'bg-[#111113]' : 'bg-[#0f0f12]'}`}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-4 py-2.5 whitespace-nowrap font-mono text-xs border-r border-zinc-800/40 last:border-r-0">
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
          )}
        </div>
      </div>

      {/* Save modal */}
      {saveModal && (
        <SaveModal
          onSave={handleSaveNew}
          onClose={() => setSaveModal(null)}
        />
      )}
    </div>
  );
}
