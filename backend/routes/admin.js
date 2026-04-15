const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');
const { User, SavedConnection, ConnectionGrant } = require('../db/app');
const { encrypt, decrypt } = require('../utils/crypto');
const { createAdapter }    = require('../adapters');
const requireAdmin = require('../middleware/requireAdmin');

const SALT_ROUNDS  = 12;
const MAX_USERNAME = 50;
const MAX_PASSWORD = 128;
const MAX_NAME     = 100;

router.use('/admin', requireAdmin);

// ── Safe connection shape — only display-safe fields, never credentials ───────
function safeConn(sc, extra = {}) {
  return {
    id:            sc._id.toString(),
    name:          sc.name,
    type:          sc.type,
    host:          sc.host   || '',
    port:          sc.port   ?? null,
    db_username:   sc.db_username || '',
    database_name: sc.database_name,
    created_at:    sc.created_at,
    ...extra,
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/admin/users', async (_req, res) => {
  try {
    const users = await User.find({}, 'username role created_at').sort({ _id: 1 }).lean();
    res.json({ users: users.map(u => ({ id: u._id.toString(), username: u.username, role: u.role, created_at: u.created_at })) });
  } catch (err) {
    console.error('[admin/users GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/users', async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username?.trim())                     return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)  return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!password || password.length < 8)       return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)         return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
    if (!['admin', 'user'].includes(role))      return res.status(400).json({ error: 'Role must be admin or user.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({ username: username.trim(), password_hash: hash, role });

    res.status(201).json({ user: { id: row._id.toString(), username: row.username, role: row.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    console.error('[admin/users POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, password } = req.body;

    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
      await User.findByIdAndUpdate(id, { role });
    }
    if (password !== undefined) {
      if (password.length < 8)        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      if (password.length > MAX_PASSWORD) return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.findByIdAndUpdate(id, { password_hash: hash });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/users PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /admin/users/:id/temp-password — generate a one-time temp password
router.post('/admin/users/:id/temp-password', async (req, res) => {
  try {
    // Use crypto.randomBytes — Math.random() is not cryptographically secure
    const chars  = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const bytes  = crypto.randomBytes(12);
    const tmpPwd = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const hash = await bcrypt.hash(tmpPwd, SALT_ROUNDS);
    const user = await User.findByIdAndUpdate(req.params.id, { password_hash: hash }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ tempPassword: tmpPwd, username: user.username });
  } catch (err) {
    console.error('[admin/users/temp-password]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/users DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Saved Connections ─────────────────────────────────────────────────────────

router.get('/admin/connections', async (_req, res) => {
  try {
    const rows = await SavedConnection
      .find({}, 'name type host port db_username database_name created_at created_by')
      .sort({ created_at: -1 })
      .populate('created_by', 'username')
      .lean();
    const connections = await Promise.all(rows.map(async (sc) => {
      const grant_count = await ConnectionGrant.countDocuments({ connection_id: sc._id });
      return safeConn(sc, { creator_name: sc.created_by?.username || null, grant_count });
    }));
    res.json({ connections });
  } catch (err) {
    console.error('[admin/connections GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/connections', async (req, res) => {
  try {
    const { name, type, host, port, username: dbUser, password, database } = req.body;
    if (!name?.trim())              return res.status(400).json({ error: 'Connection name is required.' });
    if (name.trim().length > MAX_NAME) return res.status(400).json({ error: `Name must be at most ${MAX_NAME} characters.` });
    if (!type)                      return res.status(400).json({ error: 'Database type is required.' });
    if (!['mysql','mariadb','postgres','postgresql','sqlite'].includes(String(type).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid database type.' });
    }
    if (!database) return res.status(400).json({ error: 'Database name/path is required.' });

    const enc = encrypt(password || '');
    const row = await SavedConnection.create({
      name: name.trim(), type,
      host: host || '',
      port: port ? parseInt(port) : null,
      db_username: dbUser || '',
      db_password_enc: enc,
      database_name: database,
      created_by: req.session.user.id,
    });

    res.status(201).json({ id: row._id.toString(), name: row.name });
  } catch (err) {
    console.error('[admin/connections POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/admin/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await SavedConnection.findById(id).lean();
    if (!row) return res.status(404).json({ error: 'Connection not found.' });

    const { name, type, host, port, username: dbUser, password, database } = req.body;
    if (type !== undefined && !['mysql','mariadb','postgres','postgresql','sqlite'].includes(String(type).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid database type.' });
    }
    const enc = password !== undefined ? encrypt(password) : row.db_password_enc;

    await SavedConnection.findByIdAndUpdate(id, {
      name:            name     ?? row.name,
      type:            type     ?? row.type,
      host:            host     ?? row.host,
      port:            port !== undefined ? (port ? parseInt(port) : null) : row.port,
      db_username:     dbUser   ?? row.db_username,
      db_password_enc: enc,
      database_name:   database ?? row.database_name,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/connections PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/admin/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ConnectionGrant.deleteMany({ connection_id: id });
    await SavedConnection.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/connections DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Test a saved connection without connecting permanently
router.post('/admin/connections/:id/test', async (req, res) => {
  try {
    const row = await SavedConnection.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ error: 'Connection not found.' });

    const adapter = await createAdapter({
      type:     row.type,
      host:     row.host,
      port:     row.port,
      username: row.db_username,
      password: decrypt(row.db_password_enc),
      database: row.database_name,
    });
    await adapter.getTables();
    await adapter.close();
    res.json({ success: true });
  } catch (err) {
    // Log full error server-side but never expose host/credentials to client
    console.error('[admin/connections/test]', err.message);
    res.status(400).json({ error: 'Connection failed. Verify the host, credentials, and database name.' });
  }
});

// ── Grants ────────────────────────────────────────────────────────────────────

router.get('/admin/connections/:id/grants', async (req, res) => {
  try {
    const grants = await ConnectionGrant
      .find({ connection_id: req.params.id })
      .sort({ granted_at: 1 })
      .populate('user_id', 'username role')
      .lean();

    res.json({
      grants: grants
        .filter(g => g.user_id != null)
        .map(g => ({
          id:         g._id.toString(),
          permission: g.permission,
          granted_at: g.granted_at,
          user_id:    g.user_id._id.toString(),
          username:   g.user_id.username,
          role:       g.user_id.role,
        })),
    });
  } catch (err) {
    console.error('[admin/grants GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/connections/:id/grants', async (req, res) => {
  try {
    const connId = req.params.id;
    const { userId, permission = 'read' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    if (!['read', 'write', 'full'].includes(permission)) return res.status(400).json({ error: 'Invalid permission.' });

    await ConnectionGrant.findOneAndUpdate(
      { connection_id: connId, user_id: userId },
      { permission, granted_by: req.session.user.id, granted_at: new Date() },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[admin/grants POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/admin/connections/:id/grants/:userId', async (req, res) => {
  try {
    const { permission } = req.body;
    if (!['read', 'write', 'full'].includes(permission)) return res.status(400).json({ error: 'Invalid permission.' });
    await ConnectionGrant.findOneAndUpdate(
      { connection_id: req.params.id, user_id: req.params.userId },
      { permission }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/grants PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/admin/connections/:id/grants/:userId', async (req, res) => {
  try {
    await ConnectionGrant.findOneAndDelete({
      connection_id: req.params.id,
      user_id:       req.params.userId,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/grants DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
