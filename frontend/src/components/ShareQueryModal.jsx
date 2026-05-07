import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function ShareQueryModal({ query, onClose, onSaved }) {
  const [isPublic,  setIsPublic]  = useState(query.is_public);
  const [allUsers,  setAllUsers]  = useState([]);
  const [selected,  setSelected]  = useState(
    new Set((query.shared_with || []).map(u => u.id).filter(Boolean))
  );
  const [search,    setSearch]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.get('/auth/users')
      .then(res => setAllUsers(res.data.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const toggle = (id) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filtered = allUsers.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const usernames = allUsers.filter(u => selected.has(u.id)).map(u => u.username);
      await api.put(`/queries/${query.id}/share`, { isPublic, usernames });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update sharing.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-zinc-100 font-semibold text-sm">Share query</h3>
            <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[280px]">{query.name}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Public toggle */}
        <div
          onClick={() => setIsPublic(p => !p)}
          className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
            isPublic
              ? 'bg-violet-500/10 border-violet-500/30'
              : 'bg-base border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPublic ? 'bg-violet-500/20' : 'bg-white/[0.09]'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={isPublic ? 'text-violet-400' : 'text-zinc-500'}>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className={`text-xs font-medium ${isPublic ? 'text-violet-300' : 'text-zinc-300'}`}>Share with everyone</p>
              <p className="text-[11px] text-zinc-600">All users in the app can see and run this query</p>
            </div>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            isPublic ? 'bg-violet-500 border-violet-500' : 'border-zinc-600'
          }`}>
            {isPublic && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>

        {/* User picker */}
        {!isPublic && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400">Or select specific users</p>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full bg-base border border-zinc-800 text-zinc-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-500 transition-all"
            />

            {allUsers.length === 0 ? (
              <p className="text-[11px] text-zinc-600 text-center py-4">No other users found.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-700/80 divide-y divide-white/[0.04]">
                {filtered.length === 0 ? (
                  <p className="text-[11px] text-zinc-600 text-center py-4">No users match.</p>
                ) : filtered.map(u => {
                  const checked = selected.has(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        checked ? 'bg-violet-500/[0.07]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                        checked ? 'bg-violet-500 border-violet-500' : 'border-zinc-700'
                      }`}>
                        {checked && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-xs font-mono text-zinc-300">{u.username}</span>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(u.id)} />
                    </label>
                  );
                })}
              </div>
            )}

            {selected.size > 0 && (
              <p className="text-[11px] text-zinc-500">
                Sharing with <span className="text-violet-400 font-medium">{selected.size}</span> user{selected.size !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-xs py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 text-xs py-2 bg-gradient-violet hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-medium transition-all"
          >
            {saving ? 'Saving…' : 'Save sharing'}
          </button>
        </div>
      </div>
    </div>
  );
}
