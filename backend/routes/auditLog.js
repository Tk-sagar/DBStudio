const express      = require('express');
const router       = express.Router();
const auth         = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { AuditLog } = require('../db/app');

router.get('/audit-logs', auth, requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;

    const filter = {};
    if (req.query.tableName) filter.tableName  = req.query.tableName;
    if (req.query.action)    filter.action      = req.query.action;
    if (req.query.username)  filter.username    = { $regex: req.query.username, $options: 'i' };
    if (req.query.connId)    filter.connectionId = req.query.connId;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, limit });
  } catch (err) {
    console.error('[audit-logs GET]', err.message);
    res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

module.exports = router;
