const express        = require('express');
const router         = express.Router();
const { createAdapter } = require('../adapters');
const registry       = require('../adapters/registry');
const requireAppAuth = require('../middleware/requireAppAuth');
const requireAdmin   = require('../middleware/requireAdmin');

const ALLOWED_TYPES = new Set(['mysql', 'mariadb', 'postgres', 'postgresql', 'sqlite']);

router.use(requireAppAuth);

// POST /connect — admin-only direct DB connection with user-supplied credentials
router.post('/connect', requireAdmin, async (req, res) => {
  try {
    const { type, host, port, username, password, database } = req.body;

    if (!type || !ALLOWED_TYPES.has(String(type).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid or unsupported database type.' });
    }
    if (type === 'sqlite') {
      if (!database) return res.status(400).json({ error: 'Database file path is required for SQLite.' });
    } else {
      if (!host)     return res.status(400).json({ error: 'Host is required.' });
      if (!database) return res.status(400).json({ error: 'Database name is required.' });
    }

    const existing = registry.get(req.session.id);
    if (existing) {
      try { await existing.close(); } catch (_) {}
      registry.delete(req.session.id);
    }

    const adapter = await createAdapter({ type, host, port, username, password, database });
    const tables  = await adapter.getTables();

    registry.set(req.session.id, adapter);
    req.session.dbInfo = { type, database, name: database };
    req.session.dbPermission = 'full';

    res.json({ success: true, dbInfo: req.session.dbInfo, dbPermission: 'full', tables });
  } catch (err) {
    // Log full error server-side — never expose host/credentials/internal details to client
    console.error('[connect]', err.message);
    res.status(503).json({ error: 'Connection failed. Check your credentials and try again.' });
  }
});

// DELETE /disconnect — close the DB adapter but keep the user session alive
router.delete('/disconnect', async (req, res) => {
  try {
    const adapter = registry.get(req.session.id);
    if (adapter) {
      try { await adapter.close(); } catch (_) {}
      registry.delete(req.session.id);
    }
    delete req.session.dbInfo;
    delete req.session.dbPermission;
    res.json({ success: true });
  } catch (err) {
    console.error('[disconnect]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /status — current DB connection state (used for bootstrap polling)
router.get('/status', async (req, res) => {
  const adapter = registry.get(req.session.id);
  if (!adapter) return res.json({ connected: false, dbInfo: null, tables: [], dbPermission: null });
  try {
    const tables = await adapter.getTables();
    res.json({ connected: true, dbInfo: req.session.dbInfo, tables, dbPermission: req.session.dbPermission || 'full' });
  } catch (_) {
    res.json({ connected: true, dbInfo: req.session.dbInfo, tables: [], dbPermission: req.session.dbPermission || 'full' });
  }
});

module.exports = router;
