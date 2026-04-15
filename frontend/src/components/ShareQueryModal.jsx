import { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function ShareQueryModal({ query, onClose, onSaved }) {
  const [isPublic,  setIsPublic]  = useState(query.is_public);
  const [userInput, setUserInput] = useState('');
  const [users,     setUsers]     = useState(
    (query.shared_with || []).map(u => u.username).filter(Boolean)
  );
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const addUser = () => {
    const name = userInput.trim();
    if (!name) return;
    if (users.includes(name)) { setUserInput(''); return; }
    setUsers(prev => [...prev, name]);
    setUserInput('');
  };

  const removeUser = (name) => setUsers(prev => prev.filter(u => u !== name));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.put(`/queries/${query.id}/share`, { isPublic, usernames: users });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update sharing.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#111113] border border-white/[0.08] rounded-2xl shadow-2xl p-6 space-y-5">

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
              : 'bg-[#0d0d10] border-white/[0.07] hover:border-white/[0.12]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPublic ? 'bg-violet-500/20' : 'bg-white/[0.05]'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={isPublic ? 'text-violet-400' : 'text-zinc-500'}>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className={`text-xs font-medium ${isPublic ? 'text-violet-300' : 'text-zinc-300'}`}>Share with everyone</p>
              <p className="text-[11px] text-zinc-600">All users in this app can see and run this query</p>
            </div>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            isPublic ? 'bg-violet-500 border-violet-500' : 'border-zinc-600'
          }`}>
            {isPublic && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
        </div>

        {/* Specific users */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-zinc-400">Or share with specific users</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUser(); } }}
              placeholder="Enter username…"
              className="flex-1 bg-[#0d0d10] border border-white/[0.08] text-zinc-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 placeholder-zinc-600 transition-all"
            />
            <button
              onClick={addUser}
              className="px-3 py-2 bg-[#1c1c1f] hover:bg-[#27272a] border border-white/[0.07] text-zinc-300 text-xs rounded-xl transition-all font-medium"
            >
              Add
            </button>
          </div>

          {users.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {users.map(u => (
                <span key={u} className="flex items-center gap-1.5 bg-[#1c1c1f] border border-white/[0.07] text-zinc-300 text-xs px-2.5 py-1 rounded-lg">
                  <span className="font-mono">{u}</span>
                  <button onClick={() => removeUser(u)} className="text-zinc-600 hover:text-red-400 transition-colors">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-xs py-2 rounded-xl border border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.12] transition-all">
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
