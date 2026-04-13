// In-memory connection store: sessionId → { adapter, expiresAt }
// TTL must match session maxAge (8 hours).

const TTL_MS = 8 * 60 * 60 * 1000;
const connections = new Map();

const registry = {
  set(sessionId, adapter) {
    connections.set(sessionId, { adapter, expiresAt: Date.now() + TTL_MS });
  },

  get(sessionId) {
    const entry = connections.get(sessionId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      try { entry.adapter.close(); } catch (_) {}
      connections.delete(sessionId);
      return undefined;
    }
    entry.expiresAt = Date.now() + TTL_MS; // refresh TTL on use
    return entry.adapter;
  },

  delete(sessionId) {
    connections.delete(sessionId);
  },

  has(sessionId) {
    return this.get(sessionId) !== undefined;
  },
};

// Periodic cleanup — prevents stale connections from accumulating indefinitely.
// .unref() ensures this timer doesn't keep the Node process alive on its own.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of connections) {
    if (now > entry.expiresAt) {
      try { entry.adapter.close(); } catch (_) {}
      connections.delete(id);
    }
  }
}, 30 * 60 * 1000).unref();

module.exports = registry;
