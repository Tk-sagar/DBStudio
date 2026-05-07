import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

const ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE', 'BLACKHOLE'];

const COL_TYPES = [
  { group: 'Numeric',    types: ['tinyint','smallint','mediumint','int','bigint','float','double','decimal'] },
  { group: 'String',     types: ['char','varchar','tinytext','text','mediumtext','longtext'] },
  { group: 'Date / Time',types: ['date','datetime','timestamp','time','year'] },
  { group: 'Other',      types: ['json','enum','set','boolean','tinyblob','blob','mediumblob','longblob'] },
];

const NEEDS_LENGTH = new Set(['char','varchar','binary','varbinary','decimal','numeric','float','double','bit']);
const HAS_OPTIONS  = new Set(['enum','set']);

let _uid = 0;
const uid = () => ++_uid;
const newCol = (fieldName = '') => ({
  _id: uid(), originalName: null, name: fieldName,
  type: 'varchar', length: '255', nullable: true,
  autoIncrement: false, default: null, comment: '',
});

function showLength(type) { return NEEDS_LENGTH.has(type) || HAS_OPTIONS.has(type); }

// ── Single column row ─────────────────────────────────────────────────────────
function ColRow({ col, isOnly, onUpdate, onInsertAfter, onMoveUp, onMoveDown, onRemove, autoIncrementId, onSetAI }) {
  const inp = 'bg-base border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 transition-colors';
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/15 group">
      {/* Name */}
      <td className="px-2 py-1.5">
        <input
          type="text" value={col.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className={inp + ' w-full min-w-[110px]'}
          placeholder="column_name"
        />
      </td>

      {/* Type */}
      <td className="px-2 py-1.5">
        <select value={col.type} onChange={e => onUpdate({ type: e.target.value, length: NEEDS_LENGTH.has(e.target.value) ? col.length || '255' : HAS_OPTIONS.has(e.target.value) ? col.length || "'a','b'" : '' })}
          className={inp + ' cursor-pointer min-w-[100px]'}
        >
          {COL_TYPES.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.types.map(t => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          ))}
        </select>
      </td>

      {/* Length / Values */}
      <td className="px-2 py-1.5">
        {showLength(col.type)
          ? <input type="text" value={col.length} onChange={e => onUpdate({ length: e.target.value })}
              placeholder={HAS_OPTIONS.has(col.type) ? "'a','b'" : '255'}
              className={inp + ' w-20'} />
          : <span className="text-zinc-500 text-xs px-2">—</span>
        }
      </td>

      {/* Default */}
      <td className="px-2 py-1.5">
        <input
          type="text" value={col.default ?? ''}
          onChange={e => onUpdate({ default: e.target.value === '' ? null : e.target.value })}
          placeholder="NULL"
          className={inp + ' w-28'}
        />
      </td>

      {/* NULL */}
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={col.nullable}
          onChange={e => onUpdate({ nullable: e.target.checked })}
          className="w-3.5 h-3.5 accent-violet-500 cursor-pointer"
        />
      </td>

      {/* AI */}
      <td className="px-2 py-1.5 text-center">
        {['tinyint','smallint','mediumint','int','bigint'].includes(col.type)
          ? <input type="radio" name="autoIncrement" checked={col._id === autoIncrementId}
              onChange={() => onSetAI(col._id)}
              className="w-3.5 h-3.5 accent-violet-500 cursor-pointer"
            />
          : <span className="text-zinc-800 text-xs">—</span>
        }
      </td>

      {/* Comment */}
      <td className="px-2 py-1.5">
        <input type="text" value={col.comment}
          onChange={e => onUpdate({ comment: e.target.value })}
          placeholder="optional"
          className={inp + ' w-28'}
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
          <button onClick={onInsertAfter} title="Insert column after"
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-sm font-bold">+</button>
          <button onClick={onMoveUp} disabled={isOnly} title="Move up"
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 disabled:opacity-20 transition-all">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 6l3-4 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={onMoveDown} disabled={isOnly} title="Move down"
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 disabled:opacity-20 transition-all">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 2l3 4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={onRemove} disabled={isOnly} title="Remove column"
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 transition-all text-base leading-none">×</button>
        </div>
      </td>
    </tr>
  );
}

// ── Main AlterTable component ─────────────────────────────────────────────────
export default function AlterTable({ tableName, onDone }) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [tblName,    setTblName]    = useState(tableName);
  const [engine,     setEngine]     = useState('InnoDB');
  const [columns,    setColumns]    = useState([]);
  const [autoIncId,  setAutoIncId]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState('');
  const [saveOk,     setSaveOk]     = useState(false);
  const [dropping,   setDropping]   = useState(false);
  const [confirmDrop,setConfirmDrop]= useState(false);

  useEffect(() => {
    setLoading(true); setError('');
    api.get(`/table/${tableName}/alter-info`)
      .then(res => {
        setTblName(res.data.tableName);
        setEngine(res.data.engine || 'InnoDB');
        const cols = res.data.columns.map(c => ({ ...c, _id: uid() }));
        setColumns(cols);
        const aiCol = cols.find(c => c.autoIncrement);
        setAutoIncId(aiCol?._id ?? null);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load table info.'))
      .finally(() => setLoading(false));
  }, [tableName]);

  const updateCol = useCallback((id, patch) => {
    setColumns(prev => prev.map(c => c._id === id ? { ...c, ...patch } : c));
  }, []);

  const insertAfter = useCallback((idx) => {
    const col = newCol();
    setColumns(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, col);
      return next;
    });
  }, []);

  const moveUp = useCallback((idx) => {
    if (idx === 0) return;
    setColumns(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx) => {
    setColumns(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const removeCol = useCallback((id) => {
    setColumns(prev => prev.filter(c => c._id !== id));
    setAutoIncId(prev => prev === id ? null : prev);
  }, []);

  const handleSetAI = useCallback((id) => {
    setAutoIncId(id);
    setColumns(prev => prev.map(c => ({ ...c, autoIncrement: c._id === id })));
  }, []);

  const handleSave = async () => {
    if (!tblName.trim()) { setSaveError('Table name is required.'); return; }
    setSaving(true); setSaveError(''); setSaveOk(false);
    try {
      const payload = {
        newTableName: tblName.trim(),
        engine,
        columns: columns.map(c => ({
          originalName:  c.originalName,
          name:          c.name.trim(),
          type:          c.type,
          length:        c.length || '',
          nullable:      c.nullable,
          autoIncrement: c.autoIncrement,
          default:       c.default,
          comment:       c.comment,
        })),
      };
      await api.post(`/table/${tableName}/alter`, payload);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Save failed.');
    } finally { setSaving(false); }
  };

  const handleDrop = async () => {
    if (!confirmDrop) { setConfirmDrop(true); return; }
    setDropping(true);
    try {
      await api.delete(`/table/${tableName}`);
      onDone?.({ dropped: true });
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Drop failed.');
      setDropping(false); setConfirmDrop(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin-fast" />
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs">{error}</div>
    </div>
  );

  const thCls = 'px-2 py-2 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-surface shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Table</span>
          <input
            type="text" value={tblName}
            onChange={e => setTblName(e.target.value)}
            className="bg-base border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 w-44 font-mono transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Engine</span>
          <select value={engine} onChange={e => setEngine(e.target.value)}
            className="bg-base border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 cursor-pointer transition-colors"
          >
            {ENGINES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saveOk && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Saved
            </span>
          )}
          {saveError && <span className="text-xs text-red-400 max-w-xs truncate">{saveError}</span>}
          <button
            onClick={handleSave} disabled={saving}
            className="h-7 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-all flex items-center gap-1.5"
          >
            {saving ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin-fast" /> : null}
            {saving ? 'Saving…' : 'Save table'}
          </button>
        </div>
      </div>

      {/* ── Column editor table ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className={thCls}>Column name</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Length / Values</th>
              <th className={thCls}>Default</th>
              <th className={thCls + ' text-center'}>NULL</th>
              <th className={thCls + ' text-center'}>AI</th>
              <th className={thCls}>Comment</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <ColRow
                key={col._id}
                col={col}
                isOnly={columns.length <= 1}
                autoIncrementId={autoIncId}
                onUpdate={patch => updateCol(col._id, patch)}
                onInsertAfter={() => insertAfter(idx)}
                onMoveUp={() => moveUp(idx)}
                onMoveDown={() => moveDown(idx)}
                onRemove={() => removeCol(col._id)}
                onSetAI={handleSetAI}
              />
            ))}
          </tbody>
        </table>

        {/* Add column row */}
        <button
          onClick={() => insertAfter(columns.length - 1)}
          className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add column
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-6 py-3 border-t border-zinc-800 bg-surface flex items-center gap-3">
        <button
          onClick={handleSave} disabled={saving}
          className="h-7 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-all"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {confirmDrop ? (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-red-400">Drop table <span className="font-mono font-semibold">{tableName}</span>? This cannot be undone.</span>
            <button onClick={handleDrop} disabled={dropping}
              className="h-7 px-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-all">
              {dropping ? 'Dropping…' : 'Confirm drop'}
            </button>
            <button onClick={() => setConfirmDrop(false)}
              className="h-7 px-3 bg-raised border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs rounded-lg font-medium transition-all">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDrop}
            className="h-7 px-3 bg-raised border border-red-900/40 text-red-500 hover:bg-red-500/10 hover:border-red-500/30 text-xs rounded-lg font-medium transition-all"
          >
            Drop table
          </button>
        )}

        <span className="ml-auto text-[10px] text-zinc-500">{columns.length} column{columns.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
