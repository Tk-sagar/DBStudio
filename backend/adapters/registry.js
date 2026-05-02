// Multi-connection in-memory store.
// Structure: sessionId → { activeId, conns: Map<connId, { adapter, expiresAt }> }
// TTL matches session maxAge (8 hours).

const TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function sess(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, { activeId: null, conns: new Map() });
  return sessions.get(sessionId);
}

const registry = {
  // Add a connection and make it active
  add(sessionId, connId, adapter) {
    const s = sess(sessionId);
    s.conns.set(connId, { adapter, expiresAt: Date.now() + TTL_MS });
    s.activeId = connId;
  },

  // Get the active adapter (backward-compatible)
  get(sessionId) {
    const s = sessions.get(sessionId);
    if (!s || !s.activeId) return undefined;
    const entry = s.conns.get(s.activeId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      entry.adapter.close().catch(() => {});
      s.conns.delete(s.activeId);
      s.activeId = s.conns.size > 0 ? s.conns.keys().next().value : null;
      return s.activeId ? this.get(sessionId) : undefined;
    }
    entry.expiresAt = Date.now() + TTL_MS;
    return entry.adapter;
  },

  // Switch which connection is active
  activate(sessionId, connId) {
    const s = sessions.get(sessionId);
    if (!s?.conns.has(connId)) return false;
    s.activeId = connId;
    return true;
  },

  // Close and remove a specific connection; auto-picks next active
  async removeOne(sessionId, connId) {
    const s = sessions.get(sessionId);
    if (!s) return;
    const entry = s.conns.get(connId);
    if (entry) {
      try { await entry.adapter.close(); } catch (_) {}
      s.conns.delete(connId);
    }
    if (s.activeId === connId) {
      s.activeId = s.conns.size > 0 ? s.conns.keys().next().value : null;
    }
  },

  // Close all connections for a session
  async delete(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return;
    for (const [, entry] of s.conns) {
      try { await entry.adapter.close(); } catch (_) {}
    }
    sessions.delete(sessionId);
  },

  has(sessionId) {
    return this.get(sessionId) !== undefined;
  },

  getActiveId(sessionId) {
    return sessions.get(sessionId)?.activeId ?? null;
  },

  getAllConnIds(sessionId) {
    const s = sessions.get(sessionId);
    return s ? [...s.conns.keys()] : [];
  },
};

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    for (const [cid, entry] of s.conns) {
      if (now > entry.expiresAt) {
        entry.adapter.close().catch(() => {});
        s.conns.delete(cid);
        if (s.activeId === cid) s.activeId = s.conns.size > 0 ? s.conns.keys().next().value : null;
      }
    }
    if (s.conns.size === 0) sessions.delete(sid);
  }
}, 30 * 60 * 1000).unref();

module.exports = registry;
