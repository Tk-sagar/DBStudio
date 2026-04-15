import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import api from '../api/client.js';

// ── SQL builder (display + save) ──────────────────────────────────────────────
const OP_SQL = {
  eq:          (c, v) => `${c} = '${v}'`,
  neq:         (c, v) => `${c} != '${v}'`,
  gt:          (c, v) => `${c} > '${v}'`,
  gte:         (c, v) => `${c} >= '${v}'`,
  lt:          (c, v) => `${c} < '${v}'`,
  lte:         (c, v) => `${c} <= '${v}'`,
  contains:    (c, v) => `${c} LIKE '%${v}%'`,
  starts:      (c, v) => `${c} LIKE '${v}%'`,
  ends:        (c, v) => `${c} LIKE '%${v}'`,
  is_null:     (c)    => `${c} IS NULL`,
  is_not_null: (c)    => `${c} IS NOT NULL`,
};

function buildSql(tableName, { appliedSearch, appliedSearchFields, appliedFilterRules, sorting, columnNames, limit, page }) {
  const q = (n) => `\`${n}\``;
  const conditions = [];

  if (appliedSearch) {
    const fields = appliedSearchFields.length > 0 ? appliedSearchFields : columnNames;
    if (fields.length > 0) {
      const parts = fields.map(f => `${q(f)} LIKE '%${appliedSearch}%'`);
      conditions.push(parts.length === 1 ? parts[0] : `(\n    ${parts.join('\n    OR ')}\n  )`);
    }
  }

  for (const rule of appliedFilterRules) {
    if (!rule.field) continue;
    if (!NO_VALUE_OPS.has(rule.op) && !rule.value) continue;
    const fn = OP_SQL[rule.op];
    if (fn) conditions.push(fn(q(rule.field), rule.value));
  }

  let sql = `SELECT *\nFROM ${q(tableName)}`;
  if (conditions.length > 0) sql += `\nWHERE ${conditions.join('\n  AND ')}`;
  if (sorting[0]) sql += `\nORDER BY ${q(sorting[0].id)} ${sorting[0].desc ? 'DESC' : 'ASC'}`;
  // Saveable version ends here — add pagination only for display
  const saveable = sql;
  const offset = (page - 1) * limit;
  const display = `${sql}\nLIMIT ${limit} OFFSET ${offset}`;
  return { display, saveable };
}

// ── Inline save modal ─────────────────────────────────────────────────────────
function InlineSaveModal({ sql, onClose }) {
  const [name,   setName]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [done,   setDone]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/queries', { name: name.trim(), sql });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-xs px-3 py-2 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Query saved!
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => { setName(e.target.value); setError(''); }}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
        placeholder="Query name…"
        maxLength={100}
        className="bg-[#0d0d10] border border-zinc-700 text-zinc-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-600 w-52 transition-all"
      />
      {error && <span className="text-red-400 text-xs">{error}</span>}
      <button onClick={handleSave} disabled={saving}
        className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-lg font-medium transition-all whitespace-nowrap">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={onClose}
        className="text-xs px-2.5 py-1.5 bg-[#1c1c1f] hover:bg-[#232329] border border-zinc-800 text-zinc-500 rounded-lg transition-all">
        Cancel
      </button>
    </div>
  );
}

// ── Filter config ─────────────────────────────────────────────────────────────
const OPERATORS = [
  { value: 'contains',    label: 'contains'      },
  { value: 'eq',          label: '='             },
  { value: 'neq',         label: '≠'             },
  { value: 'gt',          label: '>'             },
  { value: 'gte',         label: '≥'             },
  { value: 'lt',          label: '<'             },
  { value: 'lte',         label: '≤'             },
  { value: 'starts',      label: 'starts with'   },
  { value: 'ends',        label: 'ends with'     },
  { value: 'is_null',     label: 'is null'       },
  { value: 'is_not_null', label: 'is not null'   },
];
const NO_VALUE_OPS = new Set(['is_null', 'is_not_null']);
let _ruleId = 0;
const newRule = (field = '') => ({ id: ++_ruleId, field, op: 'contains', value: '' });

// ── Pagination helper ─────────────────────────────────────────────────────────
function getPageItems(page, totalPages) {
  const EDGE   = 3;
  const AROUND = 1;
  const pages  = new Set();
  for (let i = 1; i <= Math.min(EDGE, totalPages); i++) pages.add(i);
  for (let i = Math.max(1, totalPages - EDGE + 1); i <= totalPages; i++) pages.add(i);
  for (let i = Math.max(1, page - AROUND); i <= Math.min(totalPages, page + AROUND); i++) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);
  const items  = [];
  for (let idx = 0; idx < sorted.length; idx++) {
    if (idx > 0) {
      const gap = sorted[idx] - sorted[idx - 1];
      if (gap === 2)      items.push(sorted[idx - 1] + 1); // fill single-page gap
      else if (gap > 2)   items.push('...');
    }
    items.push(sorted[idx]);
  }
  return items;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const toolInput  = 'bg-[#0d0d10] border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-600 transition-all font-sans';
const toolSelect = toolInput + ' cursor-pointer';
const cellInput  = 'bg-[#232329] text-zinc-100 px-2 py-1 rounded-lg w-full text-xs font-mono min-w-[80px] border border-zinc-700 focus:outline-none focus:border-violet-500/50 transition-all';

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-zinc-600">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M11 11L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TableGrid({ tableName, dbPermission }) {
  const canWrite = dbPermission !== 'read';

  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [page,    setPage]    = useState(1);
  const [limit]               = useState(50);
  const [sorting, setSorting] = useState([]);

  const [globalSearch,    setGlobalSearch]    = useState('');
  const [searchFields,    setSearchFields]    = useState([]);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const fieldPickerRef = useRef(null);

  const [filterRules, setFilterRules] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // ── Query bar ──
  const [queryText,    setQueryText]    = useState('');
  const [queryManual,  setQueryManual]  = useState(false); // true = user edited manually
  const [queryRunning, setQueryRunning] = useState(false);
  const [showSave,     setShowSave]     = useState(false);
  const queryRef = useRef(null);

  const [appliedSearch,       setAppliedSearch]       = useState('');
  const [appliedSearchFields, setAppliedSearchFields] = useState([]);
  const [appliedFilterRules,  setAppliedFilterRules]  = useState([]);

  const [pkColumn,  setPkColumn]  = useState(null);
  const [structure, setStructure] = useState([]);

  const [editingRowIndex, setEditingRowIndex] = useState(null);
  const [editValues,      setEditValues]      = useState({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newRowData,  setNewRowData]  = useState({});
  const [saving,      setSaving]      = useState(false);
  const [actionError, setActionError] = useState('');

  const totalPages        = Math.ceil(total / limit) || 1;
  const activeFilterCount = appliedFilterRules.filter(r => r.field && (NO_VALUE_OPS.has(r.op) || r.value)).length;
  const hasActiveFilters  = appliedSearch || activeFilterCount > 0;
  const hasPendingChanges =
    globalSearch !== appliedSearch ||
    JSON.stringify(searchFields) !== JSON.stringify(appliedSearchFields) ||
    JSON.stringify(filterRules)  !== JSON.stringify(appliedFilterRules);

  useEffect(() => {
    setPage(1); setSorting([]);
    setGlobalSearch(''); setSearchFields([]); setShowFieldPicker(false);
    setFilterRules([]); setShowFilters(false); setShowSave(false);
    setQueryManual(false); setQueryText(`SELECT *\nFROM \`${tableName}\`\nLIMIT 50 OFFSET 0`);
    setAppliedSearch(''); setAppliedSearchFields([]); setAppliedFilterRules([]);
    setEditingRowIndex(null); setShowAddForm(false); setActionError('');
  }, [tableName]);

  useEffect(() => {
    if (!showFieldPicker) return;
    const h = (e) => { if (fieldPickerRef.current && !fieldPickerRef.current.contains(e.target)) setShowFieldPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showFieldPicker]);

  useEffect(() => {
    if (!tableName) return;
    api.get(`/table/${tableName}/pk`).then(r => setPkColumn(r.data.pk)).catch(() => {});
    api.get(`/table/${tableName}/structure`).then(r => {
      setStructure(r.data.structure);
      const empty = {};
      r.data.structure.forEach(col => { empty[col.name] = ''; });
      setNewRowData(empty);
    }).catch(() => {});
  }, [tableName]);

  // ── Keep query text in sync with current filters (auto mode only) ────────────
  useEffect(() => {
    if (queryManual) return;
    if (!tableName) return;
    if (columnNames.length === 0) {
      setQueryText(`SELECT *\nFROM \`${tableName}\`\nLIMIT ${limit} OFFSET 0`);
      return;
    }
    const { display } = buildSql(tableName, {
      appliedSearch, appliedSearchFields, appliedFilterRules,
      sorting, columnNames, limit, page,
    });
    setQueryText(display);
  }, [queryManual, tableName, appliedSearch, appliedSearchFields, appliedFilterRules, sorting, columnNames, limit, page]);

  // ── Auto-resize the query textarea ───────────────────────────────────────────
  useEffect(() => {
    const el = queryRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [queryText]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (sorting[0]) { qs.set('orderBy', sorting[0].id); qs.set('orderDir', sorting[0].desc ? 'DESC' : 'ASC'); }
      if (appliedSearch) {
        qs.set('search', appliedSearch);
        if (appliedSearchFields.length > 0) for (const f of appliedSearchFields) qs.append('searchField', f);
      }
      const validRules = appliedFilterRules.filter(r => r.field && (NO_VALUE_OPS.has(r.op) || r.value));
      if (validRules.length > 0) qs.set('filters', JSON.stringify(validRules));
      const res = await api.get(`/table/${tableName}?${qs}`);
      setData(res.data.rows);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally { setLoading(false); }
  }, [tableName, page, limit, sorting, appliedSearch, appliedSearchFields, appliedFilterRules]);

  // Run the manually-edited query via the SQL endpoint
  const runManualQuery = useCallback(async () => {
    const sql = queryText.trim();
    if (!sql) return;
    setQueryRunning(true); setError(''); setShowSave(false);
    try {
      const res = await api.post('/query', { sql });
      setData(res.data.rows || []);
      setTotal(res.data.rows?.length || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Query failed.');
    } finally { setQueryRunning(false); }
  }, [queryText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFilters = () => {
    setAppliedSearch(globalSearch); setAppliedSearchFields([...searchFields]);
    setAppliedFilterRules([...filterRules]); setPage(1);
  };
  const clearAllFilters = () => {
    setGlobalSearch(''); setSearchFields([]); setFilterRules([]);
    setAppliedSearch(''); setAppliedSearchFields([]); setAppliedFilterRules([]); setPage(1);
  };

  const addFilterRule    = ()          => setFilterRules(p => [...p, newRule(columnNames[0] || '')]);
  const removeFilterRule = (id)        => setFilterRules(p => p.filter(r => r.id !== id));
  const updateFilterRule = (id, patch) => setFilterRules(p => p.map(r => r.id === id ? { ...r, ...patch } : r));

  const columnNames = useMemo(() => {
    if (structure.length > 0) return structure.map(s => s.name);
    if (data.length > 0) return Object.keys(data[0]);
    return [];
  }, [structure, data]);

  const toggleSearchField = (col) => {
    setSearchFields(prev => {
      const eff  = prev.length === 0 ? columnNames : [...prev];
      const next = eff.includes(col) ? eff.filter(c => c !== col) : [...eff, col];
      return next.length === columnNames.length ? [] : next;
    });
  };

  const handleSortChange = (updater) => {
    setSorting(typeof updater === 'function' ? updater(sorting) : updater);
    setPage(1);
  };

  const startEdit  = (i, row) => { setEditingRowIndex(i); setEditValues({ ...row }); };
  const cancelEdit = ()       => { setEditingRowIndex(null); setEditValues({}); setActionError(''); };

  const saveEdit = async (original) => {
    if (!pkColumn) { setActionError('No primary key — cannot update row.'); return; }
    setSaving(true); setActionError('');
    try { await api.put(`/table/${tableName}/row/${original[pkColumn]}`, editValues); await fetchData(); setEditingRowIndex(null); }
    catch (err) { setActionError('Save failed: ' + (err.response?.data?.error || err.message)); }
    finally { setSaving(false); }
  };

  const deleteRow = async (row) => {
    if (!pkColumn) { setActionError('No primary key — cannot delete row.'); return; }
    if (!window.confirm('Delete this row?')) return;
    setActionError('');
    try { await api.delete(`/table/${tableName}/row/${row[pkColumn]}`); await fetchData(); }
    catch (err) { setActionError('Delete failed: ' + (err.response?.data?.error || err.message)); }
  };

  const addRow = async (e) => {
    e.preventDefault(); setSaving(true); setActionError('');
    try {
      const cleaned = Object.fromEntries(Object.entries(newRowData).filter(([, v]) => v !== ''));
      await api.post(`/table/${tableName}/row`, cleaned);
      await fetchData(); setShowAddForm(false);
      const empty = {}; structure.forEach(col => { empty[col.name] = ''; }); setNewRowData(empty);
    } catch (err) { setActionError('Insert failed: ' + (err.response?.data?.error || err.message)); }
    finally { setSaving(false); }
  };

  const columns = useMemo(() => {
    if (data.length === 0 && structure.length === 0) return [];
    const keys = data.length > 0 ? Object.keys(data[0]) : structure.map(s => s.name);
    return [
      ...keys.map(key => ({
        accessorKey: key,
        header: key,
        cell: ({ row, getValue }) => {
          const val = getValue();
          if (editingRowIndex === row.index) {
            return (
              <input
                className={cellInput}
                value={editValues[key] ?? (val === null ? '' : String(val))}
                onChange={e => setEditValues(p => ({ ...p, [key]: e.target.value }))}
              />
            );
          }
          if (val === null) return <span className="text-zinc-700 italic text-xs font-mono">NULL</span>;
          const str = String(val);
          return <span className="max-w-[260px] truncate inline-block font-mono text-xs text-zinc-300" title={str}>{str}</span>;
        },
      })),
      ...(canWrite ? [{
        id: '_actions', header: '', enableSorting: false,
        cell: ({ row }) => {
          const rowData = row.original;
          if (editingRowIndex === row.index) {
            return (
              <div className="flex gap-1.5 justify-end">
                <button disabled={saving} onClick={() => saveEdit(rowData)}
                  className="text-xs px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg font-medium disabled:opacity-50 transition-all">
                  Save
                </button>
                <button onClick={cancelEdit}
                  className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-400 border border-zinc-800 rounded-lg font-medium transition-all">
                  Cancel
                </button>
              </div>
            );
          }
          return (
            <div className="flex gap-1.5 justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button onClick={() => startEdit(row.index, rowData)}
                className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-500 hover:text-zinc-200 border border-zinc-800 rounded-lg font-medium transition-all">
                Edit
              </button>
              <button onClick={() => deleteRow(rowData)}
                className="text-xs px-2.5 py-1 bg-[#1c1c1f] hover:bg-red-500/10 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/25 rounded-lg font-medium transition-all">
                Del
              </button>
            </div>
          );
        },
      }] : []),
    ];
  }, [data, structure, editingRowIndex, editValues, saving, canWrite]);

  const table = useReactTable({
    data, columns,
    state: { sorting },
    onSortingChange: handleSortChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 font-sans">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Search */}
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><SearchIcon /></span>
          <input type="text" value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            placeholder={searchFields.length === 0 ? 'Search…' : `Search in ${searchFields.length} field${searchFields.length > 1 ? 's' : ''}…`}
            className={toolInput + ' pl-7 pr-7'}
          />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 text-sm transition-colors">×</button>
          )}
        </div>

        {/* Field picker */}
        {columnNames.length > 0 && (
          <div className="relative" ref={fieldPickerRef}>
            <button
              onClick={() => setShowFieldPicker(s => !s)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
                searchFields.length > 0
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                  : 'bg-[#0d0d10] border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {searchFields.length === 0 ? 'All fields' : `${searchFields.length} field${searchFields.length > 1 ? 's' : ''}`}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-zinc-500">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showFieldPicker && (
              <div className="absolute top-full left-0 mt-1.5 z-50 bg-[#1c1c1f] border border-zinc-800 rounded-xl shadow-modal min-w-[170px] max-h-60 overflow-y-auto">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Search in</span>
                  {searchFields.length > 0 && (
                    <button onClick={() => setSearchFields([])} className="text-xs text-violet-400 hover:text-violet-300 font-medium">All</button>
                  )}
                </div>
                {columnNames.map(col => {
                  const checked = searchFields.length === 0 || searchFields.includes(col);
                  return (
                    <label key={col} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer transition-colors">
                      <input type="checkbox" checked={checked} onChange={() => toggleSearchField(col)} className="w-3 h-3 accent-violet-500 rounded" />
                      <span className="text-xs font-mono text-zinc-300 truncate">{col}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Apply */}
        <button onClick={applyFilters}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
            hasPendingChanges
              ? 'bg-gradient-violet border-violet-600 text-white hover:opacity-90 shadow-sm'
              : 'bg-[#0d0d10] border-zinc-800 text-zinc-600 hover:text-zinc-400'
          }`}
        >Apply</button>

        {/* Filters toggle */}
        <button onClick={() => setShowFilters(s => !s)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
            showFilters
              ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
              : 'bg-[#0d0d10] border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
            <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-violet-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{activeFilterCount}</span>
          )}
        </button>


        {/* Active sort */}
        {sorting[0] && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 bg-[#0d0d10] border border-zinc-800 rounded-lg px-2.5 py-1.5">
            <span className="text-zinc-600">Sort:</span>
            <span className="text-zinc-300 font-mono">{sorting[0].id}</span>
            <span>{sorting[0].desc ? '↓' : '↑'}</span>
            <button onClick={() => { setSorting([]); setPage(1); }} className="text-zinc-700 hover:text-zinc-300 ml-0.5 transition-colors">×</button>
          </span>
        )}

        {/* Clear */}
        {hasActiveFilters && (
          <button onClick={clearAllFilters}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-red-400 hover:bg-red-500/15 font-medium transition-all">
            Clear
          </button>
        )}

        {/* Count + new row */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-600 whitespace-nowrap">
            {total > 0 ? (
              <>
                <span className={hasActiveFilters ? 'text-violet-400 font-medium' : 'text-zinc-400 font-medium'}>{total.toLocaleString()}</span>
                <span className="text-zinc-600">{hasActiveFilters ? ' filtered' : ' rows'}</span>
              </>
            ) : '0 rows'}
          </span>
          {canWrite && (
            <button onClick={() => setShowAddForm(s => !s)}
              className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 text-white rounded-lg font-medium flex items-center gap-1.5 transition-all whitespace-nowrap">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              New row
            </button>
          )}
        </div>
      </div>

      {/* ── Filter builder ── */}
      {showFilters && (
        <div className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-[#18181b]">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Filter rules</span>
            {filterRules.length > 0 && (
              <button onClick={() => setFilterRules([])} className="text-xs text-zinc-600 hover:text-red-400 transition-colors font-medium">Clear all</button>
            )}
          </div>
          <div className="p-3 space-y-2">
            {filterRules.length === 0 && <p className="text-xs text-zinc-700 py-1 px-1">No filters yet — add one below.</p>}
            {filterRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-zinc-700 font-mono w-4 text-right shrink-0">{idx + 1}</span>
                <select value={rule.field} onChange={e => updateFilterRule(rule.id, { field: e.target.value })} className={toolSelect + ' min-w-[130px]'}>
                  <option value="">— field —</option>
                  {columnNames.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
                <select value={rule.op} onChange={e => updateFilterRule(rule.id, { op: e.target.value })} className={toolSelect + ' min-w-[110px]'}>
                  {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
                {!NO_VALUE_OPS.has(rule.op) && (
                  <input type="text" value={rule.value} onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="value…" className={toolInput + ' flex-1 min-w-[120px]'} />
                )}
                {NO_VALUE_OPS.has(rule.op) && <span className="flex-1 text-xs text-zinc-700 px-1 italic">no value needed</span>}
                <button onClick={() => removeFilterRule(rule.id)}
                  className="w-6 h-6 flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all shrink-0 text-sm">×</button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={addFilterRule}
                className="text-xs px-2.5 py-1.5 bg-[#1c1c1f] hover:bg-[#232329] border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg font-medium transition-all">
                + Add filter
              </button>
              <button onClick={applyFilters}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  hasPendingChanges ? 'bg-gradient-violet border-violet-600 text-white hover:opacity-90' : 'bg-[#1c1c1f] border-zinc-800 text-zinc-600'
                }`}>Apply filters</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Query bar (always visible) ── */}
      <div className={`bg-[#0d0d10] border rounded-xl overflow-hidden transition-colors ${
        queryManual ? 'border-violet-500/30' : 'border-zinc-800'
      }`}>
        {/* Header row */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/80 bg-[#111113]">
          <div className="flex items-center gap-2">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-zinc-600 shrink-0">
              <path d="M1.5 3.5L4 6.5L1.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5.5 9.5H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">SQL</span>
            {queryManual && (
              <span className="text-[10px] text-violet-400 flex items-center gap-1">
                · edited
                <button
                  onClick={() => { setQueryManual(false); setShowSave(false); setError(''); }}
                  className="text-zinc-600 hover:text-zinc-300 underline transition-colors ml-0.5"
                >reset</button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {showSave ? (
              <InlineSaveModal sql={queryText} onClose={() => setShowSave(false)} />
            ) : (
              <>
                <button
                  onClick={() => navigator.clipboard?.writeText(queryText)}
                  title="Copy"
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.05]"
                >
                  Copy
                </button>
                <button
                  onClick={() => setShowSave(true)}
                  className="text-[10px] text-zinc-500 hover:text-violet-300 transition-colors px-1.5 py-0.5 rounded hover:bg-violet-500/[0.08] flex items-center gap-1"
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  Save
                </button>
                <button
                  onClick={queryManual ? runManualQuery : fetchData}
                  disabled={queryRunning}
                  title="Run (Ctrl+Enter)"
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all disabled:opacity-50 ${
                    queryManual
                      ? 'bg-gradient-violet text-white hover:opacity-90'
                      : 'bg-[#1c1c1f] border border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {queryRunning
                    ? <><span className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin-fast"/></>
                    : <><svg width="8" height="9" viewBox="0 0 8 9" fill="currentColor"><path d="M1 1l6 3.5L1 8V1z"/></svg> Run</>
                  }
                </button>
              </>
            )}
          </div>
        </div>

        {/* Editable textarea */}
        <textarea
          ref={queryRef}
          value={queryText}
          onChange={e => { setQueryText(e.target.value); setQueryManual(true); setShowSave(false); setError(''); }}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              queryManual ? runManualQuery() : fetchData();
            }
          }}
          spellCheck={false}
          className="w-full bg-[#0d0d10] text-zinc-300 text-xs font-mono px-4 py-3 resize-none focus:outline-none leading-relaxed placeholder-zinc-700 block"
          style={{ minHeight: '60px', maxHeight: '180px' }}
          placeholder={`SELECT * FROM \`${tableName}\` LIMIT 50`}
        />
      </div>

      {/* ── Add row form ── */}
      {showAddForm && (
        <form onSubmit={addRow} className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-[#18181b] flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">Insert new row</span>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all text-lg leading-none">×</button>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {structure.map(col => (
              <div key={col.name}>
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600 mb-1.5 uppercase tracking-wide">
                  <span className="font-mono normal-case text-zinc-500">{col.name}</span>
                  <span className="text-zinc-700 normal-case">({col.type})</span>
                  {col.key === 'PRI' && <span className="text-amber-500 font-semibold">PK</span>}
                </label>
                <input type="text" value={newRowData[col.name] ?? ''} onChange={e => setNewRowData(p => ({ ...p, [col.name]: e.target.value }))}
                  placeholder={col.default !== null ? String(col.default) : 'NULL'} className={toolInput + ' w-full'} />
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button type="submit" disabled={saving}
              className="text-xs px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-lg font-medium disabled:opacity-50 transition-all">
              {saving ? 'Inserting…' : 'Insert row'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="text-xs px-3 py-1.5 bg-[#1c1c1f] hover:bg-[#232329] text-zinc-500 border border-zinc-800 rounded-lg font-medium transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Errors ── */}
      {error && (
        <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs font-medium">{error}</div>
      )}
      {actionError && (
        <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="ml-2 text-red-500 hover:text-red-300 transition-colors">×</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-auto rounded-xl border border-zinc-800" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-[#18181b] border-b-2 border-zinc-800">
                {hg.headers.map(header => (
                  <th key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-4 py-3 whitespace-nowrap select-none border-r border-zinc-800/60 last:border-r-0 group ${
                      header.column.getCanSort() ? 'cursor-pointer hover:bg-zinc-800/40 transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {header.column.getCanSort() && (
                        <span className="text-[10px]">
                          {header.column.getIsSorted() === 'asc'  && <span className="text-violet-400">↑</span>}
                          {header.column.getIsSorted() === 'desc' && <span className="text-violet-400">↓</span>}
                          {!header.column.getIsSorted() && <span className="text-zinc-700 group-hover:text-zinc-500">↕</span>}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <div className="flex items-center justify-center gap-2.5 text-zinc-600 text-xs">
                    <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
                    Loading data…
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <p className="text-zinc-600 text-sm">
                    {hasActiveFilters ? (
                      <>No rows match your filters.{' '}
                        <button onClick={clearAllFilters} className="text-violet-400 hover:text-violet-300 underline transition-colors">Clear filters</button>
                      </>
                    ) : 'No rows found'}
                  </p>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr key={row.id}
                  className={`group/row border-b border-zinc-800/70 last:border-b-0 transition-colors ${
                    editingRowIndex === row.index
                      ? 'bg-violet-500/[0.07]'
                      : i % 2 === 0
                        ? 'bg-[#111113] hover:bg-[#18181b]'
                        : 'bg-[#0f0f12] hover:bg-[#18181b]'
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-2.5 whitespace-nowrap border-r border-zinc-800/40 last:border-r-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          {/* Prev */}
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#111113] hover:bg-[#1c1c1f] border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 rounded-lg transition-all font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Prev
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {getPageItems(page, totalPages).map((item, i) =>
              item === '...' ? (
                <span key={`dots-${i}`} className="w-7 text-center text-xs text-zinc-600 select-none">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={`min-w-[30px] h-[30px] px-1.5 text-xs rounded-lg font-medium transition-all ${
                    item === page
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-[#111113] hover:bg-[#1c1c1f] border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>

          {/* Next */}
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#111113] hover:bg-[#1c1c1f] border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 rounded-lg transition-all font-medium"
          >
            Next
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
