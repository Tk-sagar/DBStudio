const express          = require('express');
const router           = express.Router();
const { SavedConnection, ConnectionGrant } = require('../db/app');
const { decrypt }      = require('../utils/crypto');
const { createAdapter } = require('../adapters');
const registry         = require('../adapters/registry');
const requireAppAuth   = require('../middleware/requireAppAuth');

router.use(requireAppAuth);

// GET /my/connections — connections accessible to the current user
router.get('/my/connections', async (req, res) => {
  try {
    const { id: userId, role } = req.session.user;

    if (role === 'admin') {
      const rows = await SavedConnection
        .find({}, 'name type database_name created_at')
        .sort({ created_at: -1 })
        .lean();
      return res.json({
        connections: rows.map(sc => ({
          id:            sc._id.toString(),
          name:          sc.name,
          type:          sc.type,
          database_name: sc.database_name,
          created_at:    sc.created_at,
          permission:    'full',
        })),
      });
    }

    // Regular user: only granted connections
    const grants = await ConnectionGrant
      .find({ user_id: userId })
      .sort({ granted_at: -1 })
      .populate('connection_id', 'name type database_name')
      .lean();

    res.json({
      connections: grants
        .filter(g => g.connection_id)
        .map(g => ({
          id:            g.connection_id._id.toString(),
          name:          g.connection_id.name,
          type:          g.connection_id.type,
          database_name: g.connection_id.database_name,
          permission:    g.permission,
        })),
    });
  } catch (err) {
    console.error('[my/connections GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /my/connections/:id/connect — connect using server-stored credentials
router.post('/my/connections/:id/connect', async (req, res) => {
  try {
    const connId = req.params.id;
    const { id: userId, role } = req.session.user;

    let permission = 'full';
    if (role !== 'admin') {
      const grant = await ConnectionGrant.findOne({ connection_id: connId, user_id: userId }).lean();
      if (!grant) return res.status(403).json({ error: 'Access to this connection has not been granted.' });
      permission = grant.permission;
    }

    const conn = await SavedConnection.findById(connId).lean();
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const existing = registry.get(req.session.id);
    if (existing) {
      try { await existing.close(); } catch (_) {}
      registry.delete(req.session.id);
    }

    const adapter = await createAdapter({
      type:     conn.type,
      host:     conn.host,
      port:     conn.port,
      username: conn.db_username,
      password: decrypt(conn.db_password_enc),
      database: conn.database_name,
    });

    const tables = await adapter.getTables();
    registry.set(req.session.id, adapter);

    req.session.dbInfo = {
      type:     conn.type,
      database: conn.database_name,
      name:     conn.name,
    };
    req.session.dbPermission = permission;

    res.json({
      success:      true,
      dbInfo:       req.session.dbInfo,
      dbPermission: permission,
      tables,
    });
  } catch (err) {
    console.error('[my/connections/connect]', err.message);
    res.status(503).json({ error: 'Connection failed. Please try again or contact your admin.' });
  }
});

module.exports = router;
