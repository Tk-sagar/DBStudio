import { useState, useEffect } from 'react';
import api from '../api/client.js';

const KEY_META = {
  PRI: { label: 'PRIMARY', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  UNI: { label: 'UNIQUE',  cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  MUL: { label: 'INDEX',   cls: 'bg-zinc-700/40 text-zinc-400 border-zinc-800' },
};

export default function TableStructure({ tableName }) {
  const [structure, setStructure] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    api.get(`/table/${tableName}/structure`)
      .then(res => setStructure(res.data.structure))
      .catch(err => setError(err.response?.data?.error || 'Failed to load structure'))
      .finally(() => setLoading(false));
  }, [tableName]);

  if (loading) return (
    <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-6">
      <span className="w-4 h-4 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
      Loading structure…
    </div>
  );

  if (error) return (
    <div className="bg-red-500/[0.08] border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
  );

  return (
    <div className="overflow-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="bg-raised border-b-2 border-zinc-800">
            {['#', 'Column', 'Type', 'Nullable', 'Default', 'Key'].map(h => (
              <th key={h} className="px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-800/60 last:border-r-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {structure.map((col, i) => {
            const meta = KEY_META[col.key];
            return (
              <tr key={col.name}
                className={`border-b border-zinc-800/70 last:border-0 hover:bg-raised transition-colors ${i % 2 === 0 ? 'bg-surface' : 'bg-base'}`}
              >
                <td className="px-4 py-3 text-zinc-500 text-xs font-mono border-r border-zinc-800/40">{i + 1}</td>
                <td className="px-4 py-3 text-zinc-100 font-mono text-sm font-semibold border-r border-zinc-800/40">{col.name}</td>
                <td className="px-4 py-3 text-sky-400 font-mono text-xs border-r border-zinc-800/40">{col.type}</td>
                <td className="px-4 py-3 border-r border-zinc-800/40">
                  {col.nullable
                    ? <span className="text-emerald-400 text-xs font-medium">YES</span>
                    : <span className="text-zinc-600 text-xs">NO</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs border-r border-zinc-800/40">
                  {col.default != null
                    ? <span className="text-amber-400">{String(col.default)}</span>
                    : <span className="text-zinc-500 italic">NULL</span>}
                </td>
                <td className="px-4 py-3">
                  {meta && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold tracking-wide ${meta.cls}`}>
                      {meta.label}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
