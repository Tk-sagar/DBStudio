const express          = require('express');
const router           = express.Router();
const { SavedConnection, ConnectionGrant, UserConnectionPin } = require('../db/app');
const { decrypt }      = require('../utils/crypto');
const { createAdapter } = require('../adapters');
const registry         = require('../adapters/registry');
const requireAppAuth   = require('../middleware/requireAppAuth');

router.use(requireAppAuth);

router.get('/my/connections', async (req, res) => {
  try {
    const { id: userId, role, tenant_id } = req.session.user;

    if (role === 'tenant_admin') {
      const rows = await SavedConnection
        .find({ tenant_id }, 'name type database_name created_at')
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

    // super_admin: no tenant, no connections
    if (role === 'super_admin') {
      return res.json({ connections: [] });
    }

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

async function loadAndConnectAdapter(req, connId) {
  const { id: userId, role, tenant_id } = req.session.user;

  let permission = 'full';
  if (role === 'user') {
    const grant = await ConnectionGrant.findOne({ connection_id: connId, user_id: userId }).lean();
    if (!grant) throw Object.assign(new Error('Access to this connection has not been granted.'), { status: 403 });
    permission = grant.permission;
  }

  const conn = await SavedConnection.findById(connId).lean();
  if (!conn) throw Object.assign(new Error('Connection not found.'), { status: 404 });
  // Tenant isolation: non-super_admin can only access their tenant's connections
  if (role !== 'super_admin' && tenant_id && conn.tenant_id?.toString() !== tenant_id) {
    throw Object.assign(new Error('Connection not found.'), { status: 404 });
  }

  if (!registry.getAllConnIds(req.session.id).includes(connId)) {
    const adapter = await createAdapter({
      type: conn.type, host: conn.host, port: conn.port,
      username: conn.db_username, password: decrypt(conn.db_password_enc),
      database: conn.database_name, ssl: conn.use_ssl ?? false,
    });
    registry.add(req.session.id, connId, adapter);
  } else {
    registry.activate(req.session.id, connId);
  }

  return { conn, permission };
}

router.post('/my/connections/:id/connect', async (req, res) => {
  try {
    const connId = req.params.id;
    const { conn, permission } = await loadAndConnectAdapter(req, connId);

    const adapter = registry.get(req.session.id);
    const tables  = await adapter.getTables();
    const dbInfo  = { type: conn.type, database: conn.database_name, name: conn.name };

    req.session.connections  = { ...(req.session.connections || {}), [connId]: { dbInfo, permission } };
    req.session.activeConnId = connId;
    req.session.dbInfo       = dbInfo;
    req.session.dbPermission = permission;

    await UserConnectionPin.findOneAndUpdate(
      { user_id: req.session.user.id, connection_id: connId },
      { pinned_at: new Date() },
      { upsert: true }
    );

    res.json({ success: true, connId, dbInfo, dbPermission: permission, tables });
  } catch (err) {
    console.error('[my/connections/connect]', err.message);
    res.status(err.status || 503).json({ error: err.status ? err.message : 'Connection failed. Please try again or contact your admin.' });
  }
});

router.post('/my/connections/:id/activate', async (req, res) => {
  try {
    const connId = req.params.id;
    const { conn, permission } = await loadAndConnectAdapter(req, connId);

    const adapter = registry.get(req.session.id);
    const tables  = await adapter.getTables();
    const dbInfo  = { type: conn.type, database: conn.database_name, name: conn.name };

    req.session.connections  = { ...(req.session.connections || {}), [connId]: { dbInfo, permission } };
    req.session.activeConnId = connId;
    req.session.dbInfo       = dbInfo;
    req.session.dbPermission = permission;

    res.json({ success: true, connId, dbInfo, dbPermission: permission, tables });
  } catch (err) {
    console.error('[my/connections/activate]', err.message);
    res.status(err.status || 503).json({ error: err.status ? err.message : 'Connection failed. Please check the database is reachable.' });
  }
});

router.delete('/my/connections/:id/disconnect', async (req, res) => {
  try {
    const connId = req.params.id;

    await registry.removeOne(req.session.id, connId);
    await UserConnectionPin.deleteOne({ user_id: req.session.user.id, connection_id: connId });

    const { [connId]: _removed, ...remaining } = req.session.connections || {};
    req.session.connections = remaining;

    const newActiveId = registry.getActiveId(req.session.id);
    req.session.activeConnId = newActiveId;

    let tables = [];
    if (newActiveId && req.session.connections?.[newActiveId]) {
      const { dbInfo, permission } = req.session.connections[newActiveId];
      req.session.dbInfo       = dbInfo;
      req.session.dbPermission = permission;
      try {
        const adapter = registry.get(req.session.id);
        tables = await adapter.getTables();
      } catch (_) {}
    } else {
      delete req.session.dbInfo;
      delete req.session.dbPermission;
    }

    res.json({ success: true, activeConnId: newActiveId, tables });
  } catch (err) {
    console.error('[my/connections/disconnect]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
