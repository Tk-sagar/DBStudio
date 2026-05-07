import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import api from '../api/client.js';
import { exportCsv, exportExcel } from '../utils/export.js';

// ── Filter operators — flat list matching phpMyAdmin ─────────────────────────
const OPERATORS = [
  { value: 'eq',          label: '='           },
  { value: 'lt',          label: '<'           },
  { value: 'gt',          label: '>'           },
  { value: 'lte',         label: '<='          },
  { value: 'gte',         label: '>='          },
  { value: 'neq',         label: '!='          },
  { value: 'like',        label: 'LIKE'        },
  { value: 'contains',    label: 'LIKE %%'     },
  { value: 'starts',      label: 'LIKE %v'     },
  { value: 'ends',        label: 'LIKE v%'     },
  { value: 'regexp',      label: 'REGEXP'      },
  { value: 'in',          label: 'IN'          },
  { value: 'find_in_set', label: 'FIND_IN_SET' },
  { value: 'between',     label: 'BETWEEN'     },
  { value: 'is_null',     label: 'IS NULL'     },
  { value: 'not_like',    label: 'NOT LIKE'    },
  { value: 'not_regexp',  label: 'NOT REGEXP'  },
  { value: 'not_in',      label: 'NOT IN'      },
  { value: 'not_between', label: 'NOT BETWEEN' },
  { value: 'is_not_null', label: 'IS NOT NULL' },
  { value: 'is_empty',    label: "IS EMPTY"    },
  { value: 'is_not_empty',label: "IS NOT EMPTY"},
  { value: 'sounds_like', label: 'SOUNDS LIKE' },
  { value: 'sql',         label: 'SQL'         },
];

const NO_VALUE_OPS  = new Set(['is_null', 'is_not_null', 'is_empty', 'is_not_empty']);
const TWO_VALUE_OPS = new Set(['between', 'not_between']);
const MULTI_OPS     = new Set(['in', 'not_in', 'find_in_set']);
const RAW_SQL_OPS   = new Set(['sql']);

function valuePlaceholder(op) {
  if (op === 'like' || op === 'not_like') return "%value% or v_l_e";
  if (op === 'contains')                 return "value  →  LIKE '%value%'";
  if (op === 'regexp' || op === 'not_regexp') return "e.g. ^[A-Z].*";
  if (op === 'in' || op === 'not_in')    return "val1, val2, val3";
  if (op === 'find_in_set')              return "value to find in set";
  if (op === 'sql')                      return "raw SQL e.g. > 5 OR col2 = 'x'";
  if (op === 'between' || op === 'not_between') return "from value";
  return "value";
}

let _ruleId = 0;
const newRule = (field = '') => ({ id: ++_ruleId, field, op: 'eq', value: '', value2: '' });

// ── SQL builder ───────────────────────────────────────────────────────────────
const listVals = (v) => v.split(',').map(x => `'${x.trim()}'`).filter(x => x !== "''").join(', ');

const OP_SQL = {
  eq:           (c, v)     => `${c} = '${v}'`,
  neq:          (c, v)     => `${c} != '${v}'`,
  gt:           (c, v)     => `${c} > '${v}'`,
  gte:          (c, v)     => `${c} >= '${v}'`,
  lt:           (c, v)     => `${c} < '${v}'`,
  lte:          (c, v)     => `${c} <= '${v}'`,
  like:         (c, v)     => `${c} LIKE '${v}'`,
  not_like:     (c, v)     => `${c} NOT LIKE '${v}'`,
  contains:     (c, v)     => `${c} LIKE '%${v}%'`,
  starts:       (c, v)     => `${c} LIKE '${v}%'`,
  ends:         (c, v)     => `${c} LIKE '%${v}'`,
  regexp:       (c, v)     => `${c} REGEXP '${v}'`,
  not_regexp:   (c, v)     => `${c} NOT REGEXP '${v}'`,
  sounds_like:  (c, v)     => `${c} SOUNDS LIKE '${v}'`,
  in:           (c, v)     => `${c} IN (${listVals(v)})`,
  not_in:       (c, v)     => `${c} NOT IN (${listVals(v)})`,
  find_in_set:  (c, v)     => `FIND_IN_SET('${v}', ${c})`,
  between:      (c, v, v2) => `${c} BETWEEN '${v}' AND '${v2}'`,
  not_between:  (c, v, v2) => `${c} NOT BETWEEN '${v}' AND '${v2}'`,
  is_null:      (c)        => `${c} IS NULL`,
  is_not_null:  (c)        => `${c} IS NOT NULL`,
  is_empty:     (c)        => `${c} = ''`,
  is_not_empty: (c)        => `${c} != ''`,
  sql:          (_c, v)    => v,   // raw SQL WHERE fragment
};

const ANYWHERE = '__anywhere__';

function buildRuleClause(q, rule, columnNames) {
  if (!rule.field) return null;

  // Raw SQL: use value verbatim as WHERE clause fragment
  if (RAW_SQL_OPS.has(rule.op)) return rule.value.trim() || null;

  // No-value ops
  if (NO_VALUE_OPS.has(rule.op)) {
    if (rule.field === ANYWHERE) return null; // null/empty doesn't make sense for "anywhere"
    return OP_SQL[rule.op]?.(q(rule.field)) ?? null;
  }

  // Two-value ops (BETWEEN)
  if (TWO_VALUE_OPS.has(rule.op)) {
    if (!rule.value || !rule.value2) return null;
    if (rule.field === ANYWHERE) return null;
    return OP_SQL[rule.op]?.(q(rule.field), rule.value, rule.value2) ?? null;
  }

  if (!rule.value) return null;

  // "(anywhere)" — search the value across all columns
  if (rule.field === ANYWHERE) {
    const parts = columnNames
      .map(col => OP_SQL[rule.op]?.(q(col), rule.value))
      .filter(Boolean);
    return parts.length > 0 ? `(${parts.join('\n    OR ')})` : null;
  }

  return OP_SQL[rule.op]?.(q(rule.field), rule.value) ?? null;
}

function buildSql(tableName, { appliedSearch, appliedSearchFields, appliedFilterRules, appliedFilterLogic, sorting, columnNames, limit, page }) {
  const q = (n) => `\`${n}\``;
  const conditions = [];
  const logic = appliedFilterLogic === 'OR' ? '\n  OR ' : '\n  AND ';

  if (appliedSearch && appliedSearchFields.length > 0) {
    const parts = appliedSearchFields.map(f => `${q(f)} LIKE '%${appliedSearch}%'`);
    if (parts.length > 0) {
      conditions.push(parts.length === 1 ? parts[0] : `(\n    ${parts.join('\n    OR ')}\n  )`);
    }
  }

  const filterClauses = appliedFilterRules.map(r => buildRuleClause(q, r, columnNames)).filter(Boolean);
  if (filterClauses.length > 0) {
    const joined = filterClauses.length === 1
      ? filterClauses[0]
      : `(${filterClauses.join(logic)})`;
    conditions.push(joined);
  }

  let sql = `SELECT *\nFROM ${q(tableName)}`;
  if (conditions.length > 0) sql += `\nWHERE ${conditions.join('\n  AND ')}`;
  if (sorting[0]) sql += `\nORDER BY ${q(sorting[0].id)} ${sorting[0].desc ? 'DESC' : 'ASC'}`;
  const saveable = sql;
  const display = `${sql}\nLIMIT ${limit} OFFSET ${(page - 1) * limit}`;
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
        className="bg-base border border-zinc-700 text-zinc-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-500 w-52 transition-all"
      />
      {error && <span className="text-red-400 text-xs">{error}</span>}
      <button onClick={handleSave} disabled={saving}
        className="text-xs px-3 py-1.5 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-lg font-medium transition-all whitespace-nowrap">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={onClose}
        className="text-xs px-2.5 py-1.5 bg-raised hover:bg-overlay border border-zinc-800 text-zinc-500 rounded-lg transition-all">
        Cancel
      </button>
    </div>
  );
}

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
const toolInput  = 'bg-base border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/15 placeholder-zinc-500 transition-all font-sans';
const toolSelect = toolInput + ' cursor-pointer';
const cellInput  = 'bg-raised text-zinc-100 px-1.5 h-[22px] rounded w-full text-xs font-mono min-w-[60px] border border-zinc-700/70 focus:outline-none focus:border-violet-500/60 transition-colors';

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" className="text-zinc-600 shrink-0">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M11 11L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── phpMyAdmin-style labeled fieldbox ─────────────────────────────────────────
function FieldBox({ label, children, className = '' }) {
  return (
    <div className={`relative border border-zinc-700/50 rounded-lg px-2.5 pb-1.5 pt-3 ${className}`}>
      <span className="absolute top-[-8px] left-2 bg-base px-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider select-none leading-none">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Table export menu ─────────────────────────────────────────────────────────
function TableExportMenu({ tableName, data, total, appliedSearch, appliedSearchFields, appliedFilterRules, sorting }) {
  const [open,        setOpen]        = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Use the dedicated export endpoint — no row cap, respects current filters
  const fetchAll = async () => {
    const qs = new URLSearchParams();
    if (sorting[0]) { qs.set('orderBy', sorting[0].id); qs.set('orderDir', sorting[0].desc ? 'DESC' : 'ASC'); }
    if (appliedSearch && appliedSearchFields.length > 0) {
      qs.set('search', appliedSearch);
      for (const f of appliedSearchFields) qs.append('searchField', f);
    }
    const validRules = appliedFilterRules.filter(r => r.field && (NO_VALUE_OPS.has(r.op) || r.value));
    if (validRules.length > 0) qs.set('filters', JSON.stringify(validRules));
    const res = await api.get(`/table/${tableName}/export?${qs}`);
    return res.data.rows || data;
  };

  const handleExport = async (format) => {
    setOpen(false);
    setExporting(true);
    try {
      const rows = await fetchAll();
      const filename = tableName;
      if (format === 'csv')   exportCsv(rows, null, filename);
      if (format === 'excel') exportExcel(rows, null, filename);
    } catch (_) {}
    finally { setExporting(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-base border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 rounded-lg transition-all disabled:opacity-50"
      >
        {exporting ? (
          <span className="w-3 h-3 border border-zinc-600 border-t-violet-500 rounded-full animate-spin-fast" />
        ) : (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v6M2.5 5l3 3 3-3M1 9h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        Export
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1.5 2.5l2.5 3 2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20">
          {total > data.length && (
            <div className="px-3 py-1.5 border-b border-zinc-700/60">
              <p className="text-[10px] text-zinc-600">All {total.toLocaleString()} rows will be exported</p>
            </div>
          )}
          <button
            onClick={() => handleExport('csv')}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/15 flex items-center gap-2 transition-colors"
          >
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <rect x="0.5" y="0.5" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1"/>
              <path d="M3 5h5M3 7.5h5M3 10h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Export CSV
          </button>
          <div className="border-t border-zinc-700/60" />
          <button
            onClick={() => handleExport('excel')}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/15 flex items-center gap-2 transition-colors"
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

// ── Filter persistence (per table) ───────────────────────────────────────────
const lsFilterKey = (t) => `tg_filters_${t}`;

function loadTableFilters(tableName) {
  try {
    const raw = localStorage.getItem(lsFilterKey(tableName));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveTableFilters(tableName, state) {
  try { localStorage.setItem(lsFilterKey(tableName), JSON.stringify(state)); } catch {}
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TableGrid({ tableName, dbPermission, onEditRow }) {
  const canWrite = dbPermission !== 'read';

  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [page,    setPage]    = useState(1);
  const [limit, setLimit]     = useState(() => loadTableFilters(tableName)?.limit ?? 50);
  const [limitInput, setLimitInput] = useState(() => String(loadTableFilters(tableName)?.limit ?? 50));
  const [sorting, setSorting] = useState([]);

  const [globalSearch,    setGlobalSearch]    = useState(() => loadTableFilters(tableName)?.globalSearch    ?? '');
  const [searchFields,    setSearchFields]    = useState(() => loadTableFilters(tableName)?.searchFields    ?? []);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const fieldPickerRef = useRef(null);

  const [filterRules,  setFilterRules]  = useState(() => loadTableFilters(tableName)?.filterRules  ?? []);
  const [filterLogic,  setFilterLogic]  = useState(() => loadTableFilters(tableName)?.filterLogic  ?? 'AND');
  const [showFilters,  setShowFilters]  = useState(false);
  const filterInputRefs    = useRef(new Map());
  const pendingFocusRuleId = useRef(null);

  // ── Query bar ──
  const [queryText,    setQueryText]    = useState('');
  const [queryManual,  setQueryManual]  = useState(false); // true = user edited manually
  const [queryRunning, setQueryRunning] = useState(false);
  const [showSave,     setShowSave]     = useState(false);
  const [showQuery,    setShowQuery]    = useState(false);
  const queryRef = useRef(null);

  const [appliedSearch,       setAppliedSearch]       = useState(() => loadTableFilters(tableName)?.appliedSearch       ?? '');
  const [appliedSearchFields, setAppliedSearchFields] = useState(() => loadTableFilters(tableName)?.appliedSearchFields ?? []);
  const [appliedFilterRules,  setAppliedFilterRules]  = useState(() => loadTableFilters(tableName)?.appliedFilterRules  ?? []);
  const [appliedFilterLogic,  setAppliedFilterLogic]  = useState(() => loadTableFilters(tableName)?.appliedFilterLogic  ?? 'AND');

  const [pkColumn,  setPkColumn]  = useState(null);
  const [structure, setStructure] = useState([]);

  const [editingRowIndex, setEditingRowIndex] = useState(null);
  const [editValues,      setEditValues]      = useState({});

  const [showAddForm,   setShowAddForm]   = useState(false);
  const [newRowData,    setNewRowData]    = useState({});
  const [saving,        setSaving]        = useState(false);
  const [actionError,   setActionError]   = useState('');
  const [selectedRows,  setSelectedRows]  = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const columnNames = useMemo(() => {
    if (structure.length > 0) return structure.map(s => s.name);
    if (data.length > 0) return Object.keys(data[0]);
    return [];
  }, [structure, data]);

  const totalPages        = Math.ceil(total / limit) || 1;
  const activeFilterCount = appliedFilterRules.filter(r => r.field && (NO_VALUE_OPS.has(r.op) || r.value)).length;
  const hasActiveFilters  = (appliedSearch && appliedSearchFields.length > 0) || activeFilterCount > 0;
  const hasPendingChanges =
    globalSearch !== appliedSearch ||
    JSON.stringify(searchFields) !== JSON.stringify(appliedSearchFields) ||
    JSON.stringify(filterRules)  !== JSON.stringify(appliedFilterRules) ||
    filterLogic  !== appliedFilterLogic;

  useEffect(() => {
    const saved = loadTableFilters(tableName);
    setPage(1);
    setSorting(saved?.sorting ?? []);
    setLimit(saved?.limit ?? 50);
    setLimitInput(String(saved?.limit ?? 50));
    setGlobalSearch(saved?.globalSearch ?? '');
    setSearchFields(saved?.searchFields ?? []);
    setShowFieldPicker(false);
    setFilterRules(saved?.filterRules ?? []);
    setFilterLogic(saved?.filterLogic ?? 'AND');
    setShowFilters(false); setShowSave(false);
    setQueryManual(false); setQueryText(`SELECT *\nFROM \`${tableName}\`\nLIMIT 50 OFFSET 0`);
    setAppliedSearch(saved?.appliedSearch ?? '');
    setAppliedSearchFields(saved?.appliedSearchFields ?? []);
    setAppliedFilterRules(saved?.appliedFilterRules ?? []);
    setAppliedFilterLogic(saved?.appliedFilterLogic ?? 'AND');
    setEditingRowIndex(null); setShowAddForm(false); setActionError('');
    setSelectedRows(new Set()); setDeleteConfirm(false);
  }, [tableName]);

  // Persist filter state whenever it changes
  useEffect(() => {
    if (!tableName) return;
    saveTableFilters(tableName, {
      globalSearch, searchFields,
      filterRules, filterLogic,
      appliedSearch, appliedSearchFields, appliedFilterRules, appliedFilterLogic,
      sorting, limit,
    });
  }, [tableName, globalSearch, searchFields, filterRules, filterLogic,
      appliedSearch, appliedSearchFields, appliedFilterRules, appliedFilterLogic, sorting, limit]);

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
      appliedSearch, appliedSearchFields, appliedFilterRules, appliedFilterLogic,
      sorting, columnNames, limit, page,
    });
    setQueryText(display);
  }, [queryManual, tableName, appliedSearch, appliedSearchFields, appliedFilterRules, sorting, columnNames, limit, page]);

const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (sorting[0]) { qs.set('orderBy', sorting[0].id); qs.set('orderDir', sorting[0].desc ? 'DESC' : 'ASC'); }
      if (appliedSearch && appliedSearchFields.length > 0) {
        qs.set('search', appliedSearch);
        for (const f of appliedSearchFields) qs.append('searchField', f);
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

  useEffect(() => {
    if (!pendingFocusRuleId.current) return;
    const el = filterInputRefs.current.get(pendingFocusRuleId.current);
    if (el) { el.focus(); pendingFocusRuleId.current = null; }
  });

  const applyFilters = () => {
    setAppliedSearch(globalSearch);
    setAppliedSearchFields([...searchFields]);
    setAppliedFilterRules([...filterRules]);
    setAppliedFilterLogic(filterLogic);
    setPage(1);
  };
  const clearAllFilters = () => {
    setGlobalSearch(''); setSearchFields([]); setFilterRules([]); setFilterLogic('AND');
    setAppliedSearch(''); setAppliedSearchFields([]); setAppliedFilterRules([]); setAppliedFilterLogic('AND');
    setPage(1);
  };

  const addFilterRule    = ()          => setFilterRules(p => [...p, newRule(columnNames[0] || '')]);

  const addFilterForColumn = (col) => {
    const r = newRule(col);
    pendingFocusRuleId.current = r.id;
    setFilterRules(p => [...p, r]);
    setShowFilters(true);
  };
  const removeFilterRule = (id)        => setFilterRules(p => p.filter(r => r.id !== id));
  const updateFilterRule = (id, patch) => setFilterRules(p => p.map(r => {
    if (r.id !== id) return r;
    // Reset values when operator type changes
    const next = { ...r, ...patch };
    if (patch.op && patch.op !== r.op) next.value = next.value2 = '';
    return next;
  }));

  const toggleSearchField = (col) =>
    setSearchFields(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);

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

  const toggleRowSelect = (pkVal) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(String(pkVal))) next.delete(String(pkVal));
      else next.add(String(pkVal));
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!pkColumn || selectedRows.size === 0) return;
    setSaving(true); setActionError('');
    try {
      for (const pkVal of [...selectedRows]) {
        await api.delete(`/table/${tableName}/row/${pkVal}`);
      }
      setSelectedRows(new Set()); setDeleteConfirm(false);
      await fetchData();
    } catch (err) {
      setActionError('Delete failed: ' + (err.response?.data?.error || err.message));
      setDeleteConfirm(false);
    } finally { setSaving(false); }
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

  // Cell renderers read live state via table.options.meta so cell function
  // identity stays stable across keystrokes (prevents focus loss).
  const columns = useMemo(() => {
    if (data.length === 0 && structure.length === 0) return [];
    const keys = data.length > 0 ? Object.keys(data[0]) : structure.map(s => s.name);
    return [
      // ── Checkbox column ──────────────────────────────────────────────────────
      {
        id: '_select', enableSorting: false,
        header: ({ table: t }) => {
          const { selectedRows: sr, data: d, pkColumn: pk } = t.options.meta;
          const allSelected = d.length > 0 && pk && d.every(r => sr.has(String(r[pk])));
          const someSelected = !allSelected && pk && d.some(r => sr.has(String(r[pk])));
          return (
            <input
              type="checkbox"
              checked={!!allSelected}
              ref={el => { if (el) el.indeterminate = !!someSelected; }}
              onChange={() => {
                const { selectedRows: s2, data: d2, pkColumn: pk2, setSelectedRows: ssr } = t.options.meta;
                const all = d2.length > 0 && pk2 && d2.every(r => s2.has(String(r[pk2])));
                ssr(all ? new Set() : new Set(d2.filter(r => pk2).map(r => String(r[pk2]))));
              }}
              className="w-3.5 h-3.5 accent-violet-500 cursor-pointer"
            />
          );
        },
        cell: ({ row, table: t }) => {
          const { selectedRows: sr, toggleRowSelect: tr, pkColumn: pk, onEditRow: oer } = t.options.meta;
          const pkVal = pk ? String(row.original[pk]) : null;
          return (
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={pkVal ? sr.has(pkVal) : false}
                disabled={!pkVal}
                onChange={() => pkVal && tr(pkVal)}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 accent-violet-500 cursor-pointer disabled:opacity-30 shrink-0"
              />
              {oer && (
                <button
                  onClick={e => { e.stopPropagation(); oer(row.original, pk); }}
                  title="Edit row"
                  className="opacity-0 group-hover/row:opacity-100 text-zinc-600 hover:text-violet-400 transition-all"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          );
        },
      },
      // ── Data columns ─────────────────────────────────────────────────────────
      ...keys.map(key => ({
        accessorKey: key,
        header: key,
        cell: ({ row, getValue, table: t }) => {
          const { editingRowIndex: eri, editValues: ev, setEditValues: sev } = t.options.meta;
          const val = getValue();
          if (eri === row.index) {
            return (
              <input
                className={cellInput}
                value={ev[key] ?? (val === null ? '' : String(val))}
                onChange={e => sev(p => ({ ...p, [key]: e.target.value }))}
              />
            );
          }
          if (val === null) return <span className="text-zinc-500 italic text-xs font-mono">NULL</span>;
          const str = String(val);
          return <span className="max-w-[260px] truncate inline-block font-mono text-xs text-zinc-300" title={str}>{str}</span>;
        },
      })),
    ];
  }, [data, structure]);

  const table = useReactTable({
    data, columns,
    state: { sorting },
    onSortingChange: handleSortChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true,
    meta: {
      editingRowIndex, editValues, setEditValues, saving,
      startEdit, saveEdit, cancelEdit,
      selectedRows, toggleRowSelect, setSelectedRows, pkColumn, data,
      onEditRow,
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 font-sans">

      {/* ── Toolbar ── single line, Adminer style ── */}
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Search input */}
        <div className="relative flex items-center bg-surface border border-zinc-800 rounded-lg px-2.5 h-7 gap-1.5 flex-1 min-w-[140px] max-w-[220px] focus-within:border-zinc-400 transition-colors">
          <SearchIcon />
          <input
            type="text"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            placeholder="Search…"
            className="bg-transparent text-zinc-200 text-xs focus:outline-none placeholder-zinc-500 w-full min-w-0"
          />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')} className="text-zinc-600 hover:text-zinc-300 transition-colors leading-none shrink-0">×</button>
          )}
        </div>

        {/* Field picker */}
        {columnNames.length > 0 && (
          <div className="relative" ref={fieldPickerRef}>
            <button
              onClick={() => setShowFieldPicker(s => !s)}
              className={`h-7 px-2.5 flex items-center gap-1 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                searchFields.length > 0
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                  : 'bg-surface border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {searchFields.length === 0
                ? 'No field'
                : searchFields.length === columnNames.length
                  ? 'All fields'
                  : `${searchFields.length} field${searchFields.length > 1 ? 's' : ''}`}
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`transition-transform ${showFieldPicker ? 'rotate-180' : ''}`}>
                <path d="M1.5 2.5l2.5 3 2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showFieldPicker && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-raised border border-zinc-800 rounded-xl shadow-modal min-w-[160px] max-h-60 overflow-y-auto">
                <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Search in</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSearchFields([...columnNames])}
                      className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                    >All</button>
                    {searchFields.length > 0 && (
                      <button
                        onClick={() => setSearchFields([])}
                        className="text-xs text-zinc-600 hover:text-zinc-400 font-medium transition-colors"
                      >Clear</button>
                    )}
                  </div>
                </div>
                {columnNames.map(col => (
                  <label key={col} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-zinc-800/20 cursor-pointer transition-colors">
                    <input type="checkbox" checked={searchFields.includes(col)} onChange={() => toggleSearchField(col)} className="w-3 h-3 accent-violet-500 rounded" />
                    <span className="text-xs font-mono text-zinc-300 truncate">{col}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <span className="w-px h-4 bg-zinc-800 shrink-0" />

        {/* Filter rules button */}
        <button
          onClick={() => setShowFilters(s => !s)}
          className={`h-7 px-2.5 flex items-center gap-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap ${
            showFilters || filterRules.length > 0
              ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
              : 'bg-surface border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-violet-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">{activeFilterCount}</span>
          )}
        </button>

        {/* Limit input */}
        <div className="flex items-center gap-1.5 h-7 px-2.5 bg-surface border border-zinc-800 rounded-lg">
          <span className="text-[10px] text-zinc-600 select-none">Limit</span>
          <input
            type="number"
            min="1"
            max="10000"
            value={limitInput}
            onChange={e => setLimitInput(e.target.value)}
            onBlur={() => {
              const n = parseInt(limitInput, 10);
              if (n > 0) { setLimit(n); setPage(1); } else setLimitInput(String(limit));
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const n = parseInt(limitInput, 10);
                if (n > 0) { setLimit(n); setPage(1); } else setLimitInput(String(limit));
                e.target.blur();
              }
            }}
            className="w-12 bg-transparent text-zinc-300 text-xs focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Active sort pill */}
        {sorting[0] && (
          <span className="h-7 px-2.5 flex items-center gap-1.5 text-xs bg-surface border border-zinc-800 rounded-lg text-zinc-400">
            <span className="font-mono text-zinc-300">{sorting[0].id}</span>
            <span className="text-zinc-600">{sorting[0].desc ? '↓' : '↑'}</span>
            <button onClick={() => { setSorting([]); setPage(1); }} className="text-zinc-500 hover:text-zinc-300 transition-colors leading-none">×</button>
          </span>
        )}

        {/* Apply */}
        <button
          onClick={applyFilters}
          className={`h-7 px-3 text-xs rounded-lg font-medium transition-all whitespace-nowrap ${
            hasPendingChanges
              ? 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-surface border border-zinc-800 text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {hasPendingChanges ? 'Apply' : 'Select'}
        </button>

        {/* Clear */}
        {hasActiveFilters && (
          <button onClick={clearAllFilters} className="h-7 px-2 text-xs text-red-400 hover:text-red-300 transition-colors font-medium">
            Clear
          </button>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Row count */}
          <span className="text-xs whitespace-nowrap">
            {total > 0 ? (
              <>
                <span className={hasActiveFilters ? 'text-violet-400 font-medium' : 'text-zinc-400 font-medium'}>{total.toLocaleString()}</span>
                <span className="text-zinc-600">{hasActiveFilters ? ' filtered' : ' rows'}</span>
              </>
            ) : <span className="text-zinc-600">0 rows</span>}
          </span>
          {canWrite && data.length > 0 && editingRowIndex === null && (
            <span className="text-[10px] text-zinc-500 select-none hidden sm:inline">double-click to edit</span>
          )}

          {/* Query toggle */}
          <button
            onClick={() => setShowQuery(s => !s)}
            className={`h-7 px-2.5 flex items-center gap-1.5 text-xs rounded-lg border font-medium transition-all whitespace-nowrap ${
              showQuery
                ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                : 'bg-surface border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 3.5L4 6.5L1.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5.5 9.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Query
          </button>

          {data.length > 0 && (
            <TableExportMenu
              tableName={tableName}
              data={data}
              total={total}
              appliedSearch={appliedSearch}
              appliedSearchFields={appliedSearchFields}
              appliedFilterRules={appliedFilterRules}
              sorting={sorting}
            />
          )}

          {canWrite && (
            <button onClick={() => setShowAddForm(s => !s)}
              className="h-7 px-3 bg-gradient-violet hover:opacity-90 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              New row
            </button>
          )}
        </div>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {filterRules.map((rule, idx) => (
            <div key={rule.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/80 last:border-b-0 bg-surface">
              {/* Logic label */}
              <span className="w-8 text-right text-[10px] font-semibold shrink-0 select-none">
                {idx === 0
                  ? <span className="text-zinc-600">IF</span>
                  : <span className="text-violet-500">{filterLogic}</span>
                }
              </span>

              {/* Column */}
              <select
                value={rule.field}
                onChange={e => updateFilterRule(rule.id, { field: e.target.value })}
                className="bg-base border border-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 cursor-pointer"
              >
                <option value="">— column —</option>
                <option value={ANYWHERE}>(anywhere)</option>
                {columnNames.map(col => <option key={col} value={col}>{col}</option>)}
              </select>

              {/* Operator */}
              <select
                value={rule.op}
                onChange={e => updateFilterRule(rule.id, { op: e.target.value })}
                className="bg-base border border-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 cursor-pointer"
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {/* Value(s) */}
              {!NO_VALUE_OPS.has(rule.op) && !TWO_VALUE_OPS.has(rule.op) && (
                <input
                  type="text"
                  ref={el => { if (el) filterInputRefs.current.set(rule.id, el); else filterInputRefs.current.delete(rule.id); }}
                  value={rule.value}
                  onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && applyFilters()}
                  placeholder={valuePlaceholder(rule.op)}
                  className="bg-base border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 placeholder-zinc-500 flex-1 min-w-[120px]"
                />
              )}
              {TWO_VALUE_OPS.has(rule.op) && (
                <>
                  <input type="text" value={rule.value}
                    onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && applyFilters()}
                    placeholder="from…"
                    className="bg-base border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 placeholder-zinc-500 w-24"
                  />
                  <span className="text-[10px] text-zinc-600 shrink-0">AND</span>
                  <input type="text" value={rule.value2}
                    onChange={e => updateFilterRule(rule.id, { value2: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && applyFilters()}
                    placeholder="to…"
                    className="bg-base border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500/50 placeholder-zinc-500 w-24"
                  />
                </>
              )}
              {NO_VALUE_OPS.has(rule.op) && (
                <span className="flex-1" />
              )}

              {/* Remove */}
              <button
                onClick={() => removeFilterRule(rule.id)}
                className="ml-auto text-zinc-500 hover:text-red-400 transition-colors leading-none text-base shrink-0"
              >×</button>
            </div>
          ))}

          {/* Footer: AND/OR toggle + Add */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-base">
            {filterRules.length > 1 && (
              <div className="flex items-center gap-0.5 mr-1">
                {['AND', 'OR'].map(l => (
                  <button key={l} onClick={() => setFilterLogic(l)}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all ${
                      filterLogic === l ? 'bg-violet-600 text-white' : 'text-zinc-600 hover:text-zinc-300'
                    }`}
                  >{l}</button>
                ))}
              </div>
            )}
            <button onClick={addFilterRule}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add rule
            </button>
            {filterRules.length > 0 && (
              <button onClick={() => setFilterRules([])} className="ml-auto text-xs text-zinc-500 hover:text-red-400 transition-colors">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Query bar — toggled via SQL button ── */}
      {showQuery && <div className={`flex items-center gap-2 h-8 px-3 border rounded-lg transition-colors ${
        queryManual ? 'border-violet-500/40 bg-base' : 'border-zinc-800 bg-surface'
      }`}>
        {/* SQL chevron icon */}
        <svg width="10" height="10" viewBox="0 0 11 11" fill="none" className="text-zinc-600 shrink-0">
          <path d="M1.5 3.5L4 6.5L1.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.5 9.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>

        {/* Editable SQL input */}
        <input
          ref={queryRef}
          type="text"
          value={queryText.replace(/\s+/g, ' ').trim()}
          onChange={e => { setQueryText(e.target.value); setQueryManual(true); setShowSave(false); setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
              e.preventDefault();
              queryManual ? runManualQuery() : fetchData();
            }
          }}
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent text-zinc-300 text-xs font-mono focus:outline-none placeholder-zinc-500"
          placeholder={`SELECT * FROM \`${tableName}\` LIMIT ${limit}`}
        />

        {/* Right actions */}
        {showSave ? (
          <InlineSaveModal sql={queryText} onClose={() => setShowSave(false)} />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {queryManual && (
              <button
                onClick={() => { setQueryManual(false); setShowSave(false); setError(''); }}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-1"
              >reset</button>
            )}
            <button
              onClick={() => navigator.clipboard?.writeText(queryText)}
              className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/15"
            >Copy</button>
            <button
              onClick={() => setShowSave(true)}
              className="text-[10px] text-zinc-500 hover:text-violet-300 transition-colors px-1.5 py-0.5 rounded hover:bg-violet-500/[0.07]"
            >Save</button>
            <button
              onClick={queryManual ? runManualQuery : fetchData}
              disabled={queryRunning}
              title="Run (Enter)"
              className={`text-[10px] px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-all disabled:opacity-50 ${
                queryManual
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {queryRunning
                ? <span className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin-fast" />
                : <><svg width="7" height="8" viewBox="0 0 8 9" fill="currentColor"><path d="M1 1l6 3.5L1 8V1z"/></svg> Run</>
              }
            </button>
          </div>
        )}
      </div>}

      {/* ── Add row form ── */}
      {showAddForm && (
        <form onSubmit={addRow} className="bg-surface border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-raised flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">Insert new row</span>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 transition-all text-lg leading-none">×</button>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {structure.map(col => (
              <div key={col.name}>
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600 mb-1.5 uppercase tracking-wide">
                  <span className="font-mono normal-case text-zinc-500">{col.name}</span>
                  <span className="text-zinc-500 normal-case">({col.type})</span>
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
              className="text-xs px-3 py-1.5 bg-raised hover:bg-overlay text-zinc-500 border border-zinc-800 rounded-lg font-medium transition-all">
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
      <div className="overflow-auto rounded-xl border border-zinc-700" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-raised border-b-2 border-zinc-700">
                {hg.headers.map(header => {
                  const isCheckbox = header.column.id === '_select';
                  return (
                    <th key={header.id}
                      onClick={isCheckbox ? undefined : header.column.getToggleSortingHandler()}
                      className={`${isCheckbox ? 'px-3 w-9' : 'px-4'} py-3 whitespace-nowrap select-none border-r border-zinc-700/60 last:border-r-0 group ${
                        !isCheckbox && header.column.getCanSort() ? 'cursor-pointer hover:bg-zinc-800/40 transition-colors' : ''
                      }`}
                    >
                      {isCheckbox ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {header.column.getCanSort() && (
                            <span className="text-[10px]">
                              {header.column.getIsSorted() === 'asc'  && <span className="text-violet-400">↑</span>}
                              {header.column.getIsSorted() === 'desc' && <span className="text-violet-400">↓</span>}
                              {!header.column.getIsSorted() && <span className="text-zinc-500 group-hover:text-zinc-500">↕</span>}
                            </span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); addFilterForColumn(header.column.id); }}
                            title={`Filter by ${header.column.id}`}
                            className="opacity-0 group-hover:opacity-100 ml-auto text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 rounded px-1 py-0.5 text-[11px] font-bold leading-none transition-all"
                          >=</button>
                        </div>
                      )}
                    </th>
                  );
                })}
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
              table.getRowModel().rows.map((row, i) => {
                const pkVal = pkColumn ? String(row.original[pkColumn]) : null;
                const isSelected = pkVal ? selectedRows.has(pkVal) : false;
                const isEditing  = editingRowIndex === row.index;
                return (
                  <tr key={row.id}
                    onDoubleClick={() => { if (!isEditing && canWrite) startEdit(row.index, row.original); }}
                    className={`group/row border-b border-zinc-800/80 last:border-b-0 transition-colors ${
                      canWrite && !isEditing ? 'cursor-pointer' : ''
                    } ${
                      isEditing
                        ? 'bg-violet-500/[0.07]'
                        : isSelected
                          ? 'bg-violet-500/[0.04] border-violet-500/10'
                          : i % 2 === 0
                            ? 'bg-surface hover:bg-raised'
                            : 'bg-base hover:bg-raised'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className={`${isEditing ? 'px-2 py-1' : 'px-3 py-2.5'} whitespace-nowrap border-r border-zinc-800/60 last:border-r-0`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bottom action bar ── */}
      {canWrite && (editingRowIndex !== null || selectedRows.size > 0) && (
        <div className="flex items-start gap-3 flex-wrap">
          {editingRowIndex !== null && (
            <FieldBox label="Modify">
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  disabled={saving}
                  onClick={() => saveEdit(data[editingRowIndex])}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded text-xs font-medium disabled:opacity-50 transition-all"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 border border-zinc-700 rounded text-xs font-medium transition-all"
                >
                  Cancel
                </button>
              </div>
            </FieldBox>
          )}
          {selectedRows.size > 0 && editingRowIndex === null && (
            <FieldBox label={`Selected (${selectedRows.size})`}>
              {deleteConfirm ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-red-400 text-xs">Delete {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''}?</span>
                  <button
                    disabled={saving}
                    onClick={deleteSelected}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded text-xs font-medium disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-400 border border-zinc-700 rounded text-xs font-medium transition-all"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    disabled={selectedRows.size !== 1}
                    onClick={() => {
                      const pkVal = [...selectedRows][0];
                      const found = data.find(r => String(r[pkColumn]) === pkVal);
                      if (found && onEditRow) onEditRow(found, pkColumn);
                    }}
                    className="px-2.5 py-1 bg-raised hover:bg-overlay text-zinc-300 border border-zinc-700 rounded text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded text-xs font-medium transition-all"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedRows(new Set())}
                    className="px-2 py-1 text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </FieldBox>
          )}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          {/* Prev */}
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-surface hover:bg-raised border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 rounded-lg transition-all font-medium"
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
                      : 'bg-surface hover:bg-raised border border-zinc-800 text-zinc-400 hover:text-zinc-200'
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
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-surface hover:bg-raised border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 rounded-lg transition-all font-medium"
          >
            Next
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
