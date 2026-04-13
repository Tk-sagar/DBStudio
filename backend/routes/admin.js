const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const { User, SavedConnection, ConnectionGrant } = require('../db/app');
const { encrypt, decrypt } = require('../utils/crypto');
const { createAdapter }    = require('../adapters');
const requireAdmin = require('../middleware/requireAdmin');

const SALT_ROUNDS = 12;

router.use('/admin', requireAdmin);

// ── Safe connection shape — never include db_password_enc or __v ──────────────
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/users', async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username?.trim())               return res.status(400).json({ error: 'Username is required.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({ username: username.trim(), password_hash: hash, role });

    res.status(201).json({ user: { id: row._id.toString(), username: row.username, role: row.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    res.status(500).json({ error: err.message });
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
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.findByIdAndUpdate(id, { password_hash: hash });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/users/:id/temp-password — generate a one-time temp password for the user
router.post('/admin/users/:id/temp-password', async (req, res) => {
  try {
    const chars  = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const tmpPwd = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const hash   = await bcrypt.hash(tmpPwd, SALT_ROUNDS);
    const user   = await User.findByIdAndUpdate(req.params.id, { password_hash: hash }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ tempPassword: tmpPwd, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      return safeConn(sc, {
        creator_name: sc.created_by?.username || null,
        grant_count,
      });
    }));
    res.json({ connections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/connections', async (req, res) => {
  try {
    const { name, type, host, port, username: dbUser, password, database } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Connection name is required.' });
    if (!type)         return res.status(400).json({ error: 'Database type is required.' });
    if (!database)     return res.status(400).json({ error: 'Database name/path is required.' });

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
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await SavedConnection.findById(id).lean();
    if (!row) return res.status(404).json({ error: 'Connection not found.' });

    const { name, type, host, port, username: dbUser, password, database } = req.body;
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
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Delete grants first (cascade)
    await ConnectionGrant.deleteMany({ connection_id: id });
    await SavedConnection.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
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
        .filter(g => g.user_id != null)   // skip orphaned grants whose user was deleted
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
