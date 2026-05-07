const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');
const { User, Organization, Invite, SavedConnection, ConnectionGrant } = require('../db/app');
const { encrypt, decrypt } = require('../utils/crypto');
const { createAdapter }    = require('../adapters');
const { sendInvite }       = require('../utils/mailer');
const requireAdmin = require('../middleware/requireAdmin');

const SALT_ROUNDS  = 12;
const MAX_USERNAME = 50;
const MAX_PASSWORD = 128;
const MAX_NAME     = 100;
const INVITE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days

router.use('/admin', requireAdmin);

// Helper: current tenant scope
const ts = (req) => ({ org_id: req.session.user.org_id });

function safeConn(sc, extra = {}) {
  return {
    id:            sc._id.toString(),
    name:          sc.name,
    type:          sc.type,
    host:          sc.host   || '',
    port:          sc.port   ?? null,
    db_username:   sc.db_username || '',
    database_name: sc.database_name,
    use_ssl:       sc.use_ssl ?? false,
    created_at:    sc.created_at,
    ...extra,
  };
}

// ── Organization info ─────────────────────────────────────────────────────────

router.get('/admin/tenant', async (req, res) => {
  try {
    const tenant = await Organization.findById(req.session.user.org_id).lean();
    if (!tenant) return res.status(404).json({ error: 'Organization not found.' });
    const userCount = await User.countDocuments({ org_id: tenant._id });
    const connCount = await SavedConnection.countDocuments({ org_id: tenant._id });
    res.json({
      tenant: {
        id:              tenant._id.toString(),
        name:            tenant.name,
        slug:            tenant.slug,
        plan:            tenant.plan,
        email_domain:    tenant.email_domain || null,
        max_users:       tenant.max_users,
        max_connections: tenant.max_connections,
        user_count:      userCount,
        conn_count:      connCount,
        created_at:      tenant.created_at,
      },
    });
  } catch (err) {
    console.error('[admin/tenant GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find({ ...ts(req) }, 'username email role email_verified created_at').sort({ _id: 1 }).lean();
    res.json({
      users: users.map(u => ({
        id:             u._id.toString(),
        username:       u.username,
        email:          u.email || null,
        role:           u.role,
        email_verified: u.email_verified,
        created_at:     u.created_at,
      })),
    });
  } catch (err) {
    console.error('[admin/users GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/admin/users/:id', async (req, res) => {
  try {
    const { role, password } = req.body;
    const user = await User.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (role !== undefined) {
      if (!['org_admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
      await User.findByIdAndUpdate(req.params.id, { role });
    }
    if (password !== undefined && password !== '') {
      if (password.length < 8)           return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      if (password.length > MAX_PASSWORD) return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await User.findByIdAndUpdate(req.params.id, { password_hash: hash });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/users PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/users/:id/temp-password', async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const chars  = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const bytes  = crypto.randomBytes(12);
    const tmpPwd = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const hash = await bcrypt.hash(tmpPwd, SALT_ROUNDS);
    await User.findByIdAndUpdate(req.params.id, { password_hash: hash });
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
    const user = await User.findOne({ _id: id, ...ts(req) }).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/users DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Invites ───────────────────────────────────────────────────────────────────

router.get('/admin/invites', async (req, res) => {
  try {
    const invites = await Invite.find({ ...ts(req), used: false })
      .populate('invited_by', 'username')
      .sort({ created_at: -1 }).lean();
    res.json({
      invites: invites
        .filter(i => new Date(i.expires_at) > new Date())
        .map(i => ({
          id:          i._id.toString(),
          email:       i.email,
          role:        i.role,
          invited_by:  i.invited_by?.username || null,
          expires_at:  i.expires_at,
          created_at:  i.created_at,
        })),
    });
  } catch (err) {
    console.error('[admin/invites GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/invites', async (req, res) => {
  try {
    const { email, role = 'user' } = req.body;
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Invalid email.' });
    if (!['org_admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });

    // Check if user already exists globally (one email = one account)
    const existing = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    // Check plan limits + domain restriction
    const tenant = await Organization.findById(req.session.user.org_id).lean();

    if (tenant.email_domain) {
      const invitedDomain = email.trim().toLowerCase().split('@')[1];
      if (invitedDomain !== tenant.email_domain) {
        return res.status(403).json({ error: `Only @${tenant.email_domain} email addresses can be invited to this organization.` });
      }
    }
    const userCount = await User.countDocuments(ts(req));
    if (userCount >= tenant.max_users) {
      return res.status(403).json({ error: `Your plan allows at most ${tenant.max_users} users. Upgrade to invite more.` });
    }

    // Invalidate any existing pending invite for this email+tenant
    await Invite.deleteMany({ org_id: req.session.user.org_id, email: email.trim().toLowerCase(), used: false });

    const token   = crypto.randomBytes(32).toString('hex');
    const invite  = await Invite.create({
      org_id:  req.session.user.org_id,
      email:      email.trim().toLowerCase(),
      role,
      token,
      invited_by: req.session.user.id,
      expires_at: new Date(Date.now() + INVITE_TTL),
    });

    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:5001'}?invite=${token}`;
    await sendInvite(invite.email, req.session.user.username, tenant.name, joinUrl);

    res.status(201).json({ success: true, id: invite._id.toString() });
  } catch (err) {
    console.error('[admin/invites POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/admin/invites/:id', async (req, res) => {
  try {
    await Invite.findOneAndDelete({ _id: req.params.id, ...ts(req) });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/invites DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Saved Connections ─────────────────────────────────────────────────────────

router.get('/admin/connections', async (req, res) => {
  try {
    const rows = await SavedConnection
      .find({ ...ts(req) }, 'name type host port db_username database_name use_ssl created_at created_by')
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
    const { name, type, host, port, username: dbUser, password, database, use_ssl } = req.body;
    if (!name?.trim())              return res.status(400).json({ error: 'Connection name is required.' });
    if (name.trim().length > MAX_NAME) return res.status(400).json({ error: `Name must be at most ${MAX_NAME} characters.` });
    if (!type)                      return res.status(400).json({ error: 'Database type is required.' });
    if (!['mysql','mariadb','postgres','postgresql','sqlite'].includes(String(type).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid database type.' });
    }
    if (!database) return res.status(400).json({ error: 'Database name/path is required.' });

    const tenant = await Organization.findById(req.session.user.org_id).lean();
    const connCount = await SavedConnection.countDocuments(ts(req));
    if (connCount >= tenant.max_connections) {
      return res.status(403).json({ error: `Your plan allows at most ${tenant.max_connections} connections. Upgrade to add more.` });
    }

    const enc = encrypt(password || '');
    const row = await SavedConnection.create({
      name: name.trim(), type,
      host: host || '', port: port ? parseInt(port) : null,
      db_username: dbUser || '', db_password_enc: enc,
      database_name: database, use_ssl: !!use_ssl,
      created_by: req.session.user.id,
      org_id:  req.session.user.org_id,
    });

    res.status(201).json({ id: row._id.toString(), name: row.name });
  } catch (err) {
    console.error('[admin/connections POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/admin/connections/:id', async (req, res) => {
  try {
    const row = await SavedConnection.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!row) return res.status(404).json({ error: 'Connection not found.' });

    const { name, type, host, port, username: dbUser, password, database, use_ssl } = req.body;
    if (type !== undefined && !['mysql','mariadb','postgres','postgresql','sqlite'].includes(String(type).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid database type.' });
    }
    const enc = password !== undefined ? encrypt(password) : row.db_password_enc;

    await SavedConnection.findByIdAndUpdate(req.params.id, {
      name:            name     ?? row.name,
      type:            type     ?? row.type,
      host:            host     ?? row.host,
      port:            port !== undefined ? (port ? parseInt(port) : null) : row.port,
      db_username:     dbUser   ?? row.db_username,
      db_password_enc: enc,
      database_name:   database ?? row.database_name,
      use_ssl:         use_ssl !== undefined ? !!use_ssl : row.use_ssl,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/connections PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/admin/connections/:id', async (req, res) => {
  try {
    const conn = await SavedConnection.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });
    await ConnectionGrant.deleteMany({ connection_id: req.params.id });
    await SavedConnection.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/connections DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/admin/connections/:id/test', async (req, res) => {
  try {
    const row = await SavedConnection.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!row) return res.status(404).json({ error: 'Connection not found.' });

    const adapter = await createAdapter({
      type: row.type, host: row.host, port: row.port,
      username: row.db_username, password: decrypt(row.db_password_enc),
      database: row.database_name, ssl: row.use_ssl ?? false,
    });
    await adapter.getTables();
    await adapter.close();
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/connections/test]', err.message);
    res.status(400).json({ error: 'Connection failed. Verify the host, credentials, and database name.' });
  }
});

// ── Grants ────────────────────────────────────────────────────────────────────

router.get('/admin/connections/:id/grants', async (req, res) => {
  try {
    const conn = await SavedConnection.findOne({ _id: req.params.id, ...ts(req) }).lean();
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

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
    const conn = await SavedConnection.findOne({ _id: connId, ...ts(req) }).lean();
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const { userId, permission = 'read' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    if (!['read', 'write', 'full'].includes(permission)) return res.status(400).json({ error: 'Invalid permission.' });

    // Verify user belongs to this tenant
    const user = await User.findOne({ _id: userId, ...ts(req) }).lean();
    if (!user) return res.status(404).json({ error: 'User not found in this workspace.' });

    await ConnectionGrant.findOneAndUpdate(
      { connection_id: connId, user_id: userId },
      { permission, granted_by: req.session.user.id, granted_at: new Date(), org_id: req.session.user.org_id },
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
