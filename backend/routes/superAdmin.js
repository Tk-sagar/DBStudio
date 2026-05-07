const express          = require('express');
const router           = express.Router();
const { Organization, User, SavedConnection, ConnectionGrant } = require('../db/app');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');

router.use('/super', requireSuperAdmin);

router.get('/super/tenants', async (_req, res) => {
  try {
    const tenants = await Organization.find({}).sort({ created_at: -1 }).lean();
    const result = await Promise.all(tenants.map(async (t) => {
      const [userCount, connCount] = await Promise.all([
        User.countDocuments({ org_id: t._id }),
        SavedConnection.countDocuments({ org_id: t._id }),
      ]);
      return {
        id:              t._id.toString(),
        name:            t.name,
        slug:            t.slug,
        plan:            t.plan,
        email_domain:    t.email_domain || null,
        user_count:      userCount,
        conn_count:      connCount,
        max_users:       t.max_users,
        max_connections: t.max_connections,
        created_at:      t.created_at,
      };
    }));
    res.json({ tenants: result });
  } catch (err) {
    console.error('[super/tenants GET]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/super/tenants/:id', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id).lean();
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    const [users, connections] = await Promise.all([
      User.find({ org_id: org._id }, 'username email role email_verified created_at').sort({ created_at: 1 }).lean(),
      SavedConnection.find({ org_id: org._id }, 'name type database_name host created_at').sort({ created_at: 1 }).lean(),
    ]);

    res.json({
      org: {
        id:              org._id.toString(),
        name:            org.name,
        slug:            org.slug,
        plan:            org.plan,
        email_domain:    org.email_domain || null,
        max_users:       org.max_users,
        max_connections: org.max_connections,
        created_at:      org.created_at,
      },
      users: users.map(u => ({
        id:             u._id.toString(),
        username:       u.username,
        email:          u.email || null,
        role:           u.role,
        email_verified: u.email_verified,
        created_at:     u.created_at,
      })),
      connections: connections.map(c => ({
        id:            c._id.toString(),
        name:          c.name,
        type:          c.type,
        database_name: c.database_name,
        host:          c.host,
        created_at:    c.created_at,
      })),
    });
  } catch (err) {
    console.error('[super/tenants/:id GET]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.put('/super/tenants/:id', async (req, res) => {
  try {
    const { plan, max_users, max_connections, name } = req.body;
    const update = {};
    if (plan && ['free', 'pro'].includes(plan)) update.plan = plan;
    if (max_users)       update.max_users       = parseInt(max_users);
    if (max_connections) update.max_connections = parseInt(max_connections);
    if (name?.trim())    update.name            = name.trim();
    await Organization.findByIdAndUpdate(req.params.id, update);
    res.json({ success: true });
  } catch (err) {
    console.error('[super/tenants PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.delete('/super/tenants/:id', async (req, res) => {
  try {
    const tenantId = req.params.id;
    // Cascade delete everything in this tenant
    const connections = await SavedConnection.find({ org_id: tenantId }, '_id').lean();
    for (const c of connections) {
      await ConnectionGrant.deleteMany({ connection_id: c._id });
    }
    await SavedConnection.deleteMany({ org_id: tenantId });
    await User.deleteMany({ org_id: tenantId });
    await Organization.findByIdAndDelete(tenantId);
    res.json({ success: true });
  } catch (err) {
    console.error('[super/tenants DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/super/stats', async (_req, res) => {
  try {
    const [tenantCount, userCount, connCount] = await Promise.all([
      Organization.countDocuments(),
      User.countDocuments({ role: { $ne: 'super_admin' } }),
      SavedConnection.countDocuments(),
    ]);
    res.json({ tenantCount, userCount, connCount });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
