import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import api from '../api/client.js';

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

export default function SqlEditor() {
  const editorRef = useRef(null);
  const viewRef   = useRef(null);
  const sqlRef    = useRef('SELECT * FROM ');
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const [running, setRunning] = useState(false);

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

  return (
    <div
      className="p-6 space-y-4 h-full flex flex-col font-sans"
      onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-300">SQL Editor</span>
          <span className="text-[10px] text-zinc-600 bg-[#1c1c1f] border border-zinc-800 px-2 py-0.5 rounded-md font-mono">
            ⌘↵ to run
          </span>
        </div>
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
            {/* Result meta */}
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

            {/* Result table */}
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
  );
}
