const express          = require('express');
const router           = express.Router();
const { Tenant, User, SavedConnection, ConnectionGrant } = require('../db/app');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');

router.use('/super', requireSuperAdmin);

router.get('/super/tenants', async (_req, res) => {
  try {
    const tenants = await Tenant.find({}).sort({ created_at: -1 }).lean();
    const result = await Promise.all(tenants.map(async (t) => {
      const [userCount, connCount] = await Promise.all([
        User.countDocuments({ tenant_id: t._id }),
        SavedConnection.countDocuments({ tenant_id: t._id }),
      ]);
      return {
        id:           t._id.toString(),
        name:         t.name,
        slug:         t.slug,
        plan:         t.plan,
        user_count:   userCount,
        conn_count:   connCount,
        max_users:    t.max_users,
        max_connections: t.max_connections,
        created_at:   t.created_at,
      };
    }));
    res.json({ tenants: result });
  } catch (err) {
    console.error('[super/tenants GET]', err.message);
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
    await Tenant.findByIdAndUpdate(req.params.id, update);
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
    const connections = await SavedConnection.find({ tenant_id: tenantId }, '_id').lean();
    for (const c of connections) {
      await ConnectionGrant.deleteMany({ connection_id: c._id });
    }
    await SavedConnection.deleteMany({ tenant_id: tenantId });
    await User.deleteMany({ tenant_id: tenantId });
    await Tenant.findByIdAndDelete(tenantId);
    res.json({ success: true });
  } catch (err) {
    console.error('[super/tenants DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/super/stats', async (_req, res) => {
  try {
    const [tenantCount, userCount, connCount] = await Promise.all([
      Tenant.countDocuments(),
      User.countDocuments({ role: { $ne: 'super_admin' } }),
      SavedConnection.countDocuments(),
    ]);
    res.json({ tenantCount, userCount, connCount });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
