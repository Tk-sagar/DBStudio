const express        = require('express');
const router         = express.Router();
const { createAdapter }         = require('../adapters');
const { UserConnectionPin }     = require('../db/app');
const registry                  = require('../adapters/registry');
const requireAppAuth            = require('../middleware/requireAppAuth');
const requireAdmin              = require('../middleware/requireAdmin');

const ALLOWED_TYPES = new Set(['mysql', 'mariadb', 'postgres', 'postgresql', 'sqlite']);
const DIRECT_ID     = '__direct__';

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

    // Close any existing direct connection, then add the new one
    await registry.removeOne(req.session.id, DIRECT_ID);

    const adapter = await createAdapter({ type, host, port, username, password, database });
    const tables  = await adapter.getTables();

    registry.add(req.session.id, DIRECT_ID, adapter);

    const dbInfo = { type, database, name: database };
    req.session.connections  = { ...(req.session.connections || {}), [DIRECT_ID]: { dbInfo, permission: 'full' } };
    req.session.activeConnId = DIRECT_ID;
    req.session.dbInfo       = dbInfo;
    req.session.dbPermission = 'full';

    res.json({ success: true, connId: DIRECT_ID, dbInfo, dbPermission: 'full', tables });
  } catch (err) {
    console.error('[connect]', err.message);
    res.status(503).json({ error: 'Connection failed. Check your credentials and try again.' });
  }
});

// DELETE /disconnect — close ALL DB connections but keep user session alive
router.delete('/disconnect', async (req, res) => {
  try {
    await registry.delete(req.session.id);
    await UserConnectionPin.deleteMany({ user_id: req.session.user.id });
    delete req.session.dbInfo;
    delete req.session.dbPermission;
    delete req.session.connections;
    delete req.session.activeConnId;
    res.json({ success: true });
  } catch (err) {
    console.error('[disconnect]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /status — current DB connection state
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
