import { useState, useEffect } from 'react';
import api from '../api/client.js';

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2.5L4.5 7 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function RowEditPage({ tableName, row, pkColumn, onBack }) {
  const [structure, setStructure] = useState([]);
  const [values,    setValues]    = useState({ ...row });
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    api.get(`/table/${tableName}/structure`)
      .then(r => setStructure(r.data.structure || []))
      .catch(() => {});
  }, [tableName]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!pkColumn) { setError('No primary key — cannot update this row.'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/table/${tableName}/row/${row[pkColumn]}`, values);
      setSaved(true);
      setTimeout(onBack, 900);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
      setSaving(false);
    }
  };

  const cols = structure.length > 0
    ? structure
    : Object.keys(row).map(name => ({ name, type: '', key: null }));

  const pkVal = pkColumn ? String(row[pkColumn]) : null;

  return (
    <div className="h-full flex flex-col bg-base font-sans">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-b border-zinc-800 shrink-0 bg-base">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-medium transition-colors"
        >
          <BackIcon />
          Back
        </button>
        <span className="text-white/[0.12] select-none">|</span>
        <span className="text-xs font-semibold text-zinc-200">Edit Row</span>
        <span className="text-[11px] font-mono text-zinc-600">{tableName}</span>
        {pkVal && (
          <span className="text-[11px] text-zinc-500">#{pkVal}</span>
        )}

        {saved && (
          <span className="ml-auto flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Saved
          </span>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSave} className="max-w-2xl space-y-3">

          {cols.map(col => {
            const isPk      = col.name === pkColumn || col.key === 'PRI';
            const isLong    = col.type && /text|blob|json/i.test(col.type);
            const val       = values[col.name] ?? '';

            return (
              <div key={col.name} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  <span className="font-mono normal-case text-zinc-400 text-xs">{col.name}</span>
                  {col.type && (
                    <span className="text-zinc-500 normal-case font-normal">({col.type})</span>
                  )}
                  {isPk && (
                    <span className="text-amber-500 font-bold text-[9px]">PK</span>
                  )}
                </label>

                {isLong ? (
                  <textarea
                    value={val === null ? '' : String(val)}
                    onChange={e => setValues(p => ({ ...p, [col.name]: e.target.value }))}
                    disabled={isPk}
                    rows={4}
                    className={`w-full bg-surface border rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 resize-y focus:outline-none transition-all placeholder-zinc-500 ${
                      isPk
                        ? 'border-zinc-800 text-zinc-600 cursor-not-allowed opacity-60'
                        : 'border-zinc-700/70 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/15'
                    }`}
                  />
                ) : (
                  <input
                    type="text"
                    value={val === null ? '' : String(val)}
                    onChange={e => setValues(p => ({ ...p, [col.name]: e.target.value }))}
                    disabled={isPk}
                    placeholder={isPk ? '(primary key — read only)' : ''}
                    className={`w-full bg-surface border rounded-lg px-3 py-2 h-9 text-xs font-mono text-zinc-200 focus:outline-none transition-all placeholder-zinc-500 ${
                      isPk
                        ? 'border-zinc-800 text-zinc-600 cursor-not-allowed opacity-60'
                        : 'border-zinc-700/70 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/15'
                    }`}
                  />
                )}
              </div>
            );
          })}

          {error && (
            <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-lg px-4 py-2.5 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-700/80">
            <button
              type="submit"
              disabled={saving || saved}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
            >
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 bg-raised hover:bg-overlay text-zinc-400 border border-zinc-800 rounded-lg text-xs font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
