const express        = require('express');
const router         = express.Router();
const { SavedQuery, User } = require('../db/app');
const requireAppAuth = require('../middleware/requireAppAuth');
const requireDbAuth  = require('../middleware/auth');
const requirePerm    = require('../middleware/requirePerm');

router.use(requireAppAuth);

function safeQuery(q, currentUserId) {
  return {
    id:          q._id.toString(),
    name:        q.name,
    description: q.description || '',
    is_public:   q.is_public,
    is_owner:    q.created_by?._id
                   ? q.created_by._id.toString() === currentUserId
                   : q.created_by?.toString() === currentUserId,
    created_by:  q.created_by?.username || null,
    created_at:  q.created_at,
    updated_at:  q.updated_at,
    shared_with: (q.shared_with || []).map(u =>
      u._id ? { id: u._id.toString(), username: u.username } : { id: u.toString() }
    ),
  };
}

router.get('/queries/:id', requireDbAuth, requirePerm('full'), async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const tenantId = req.session.user.org_id;
    const q = await SavedQuery.findOne({ _id: req.params.id, org_id: tenantId })
      .populate('created_by', 'username')
      .populate('shared_with', 'username')
      .lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });

    const isOwner  = q.created_by?._id ? q.created_by._id.toString() === userId : q.created_by?.toString() === userId;
    const isShared = (q.shared_with || []).some(u => (u._id || u).toString() === userId);
    if (!isOwner && !isShared && !q.is_public) return res.status(403).json({ error: 'Access denied.' });

    res.json({ query: { ...safeQuery(q, userId), sql: q.sql } });
  } catch (err) {
    console.error('[queries/:id GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/queries', requireDbAuth, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const connId   = req.session.activeConnId || null;
    const tenantId = req.session.user.org_id;

    const connScope = connId
      ? { connection_id: connId }
      : { $or: [{ connection_id: null }, { connection_id: { $exists: false } }] };

    const queries = await SavedQuery.find({
      $and: [
        { org_id: tenantId },
        { $or: [{ created_by: userId }, { shared_with: userId }, { is_public: true }] },
        ...(Object.keys(connScope).length ? [connScope] : []),
      ],
    })
      .sort({ updated_at: -1 })
      .populate('created_by', 'username')
      .populate('shared_with', 'username')
      .lean();

    res.json({ queries: queries.map(q => safeQuery(q, userId)) });
  } catch (err) {
    console.error('[queries GET]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/queries', requireDbAuth, async (req, res) => {
  try {
    const { name, description = '', sql } = req.body;
    if (!name?.trim())  return res.status(400).json({ error: 'Query name is required.' });
    if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be at most 100 characters.' });
    if (!sql?.trim())   return res.status(400).json({ error: 'SQL is required.' });

    const q = await SavedQuery.create({
      name:          name.trim(),
      description:   description?.trim() || '',
      sql:           sql.trim(),
      created_by:    req.session.user.id,
      org_id:     req.session.user.org_id,
      connection_id: req.session.activeConnId || null,
    });

    res.status(201).json({ id: q._id.toString(), name: q.name });
  } catch (err) {
    console.error('[queries POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.put('/queries/:id', requireDbAuth, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const tenantId = req.session.user.org_id;
    const q = await SavedQuery.findOne({ _id: req.params.id, org_id: tenantId }).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only the owner can edit this query.' });
    }

    const { name, description, sql } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    if (name !== undefined && name.trim().length > 100) return res.status(400).json({ error: 'Name must be at most 100 characters.' });

    await SavedQuery.findByIdAndUpdate(req.params.id, {
      ...(name        !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(sql         !== undefined && { sql: sql.trim() }),
      updated_at: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[queries PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/queries/:id', requireDbAuth, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const tenantId = req.session.user.org_id;
    const q = await SavedQuery.findOne({ _id: req.params.id, org_id: tenantId }).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only the owner can delete this query.' });
    }
    await SavedQuery.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[queries DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/queries/:id/run', requireDbAuth, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const tenantId = req.session.user.org_id;
    const q = await SavedQuery.findOne({ _id: req.params.id, org_id: tenantId }).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });

    const isOwner  = q.created_by.toString() === userId;
    const isShared = (q.shared_with || []).some(id => id.toString() === userId);
    if (!isOwner && !isShared && !q.is_public) return res.status(403).json({ error: 'Access denied.' });

    const result = await req.adapter.query(q.sql);
    res.json(result);
  } catch (err) {
    console.error('[queries/run]', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.put('/queries/:id/share', requireDbAuth, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const tenantId = req.session.user.org_id;
    const q = await SavedQuery.findOne({ _id: req.params.id, org_id: tenantId }).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only the owner can change sharing settings.' });
    }

    const { isPublic, usernames = [] } = req.body;
    let sharedWithIds = [];
    if (Array.isArray(usernames) && usernames.length > 0) {
      const cleanNames = [...new Set(usernames.map(u => u.trim()).filter(Boolean))];
      const users = await User.find(
        { username: { $in: cleanNames }, org_id: tenantId },
        '_id username'
      ).lean();
      sharedWithIds = users.filter(u => u._id.toString() !== userId).map(u => u._id);
    }

    await SavedQuery.findByIdAndUpdate(req.params.id, {
      is_public:   typeof isPublic === 'boolean' ? isPublic : q.is_public,
      shared_with: sharedWithIds,
      updated_at:  new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[queries/share PUT]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
