const express        = require('express');
const router         = express.Router();
const { SavedQuery, User } = require('../db/app');
const requireAppAuth = require('../middleware/requireAppAuth');
const requireDbAuth  = require('../middleware/auth');

router.use(requireAppAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeQuery(q, currentUserId) {
  return {
    id:          q._id.toString(),
    name:        q.name,
    description: q.description || '',
    sql:         q.sql,
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

// ── List — own + shared with me + public ──────────────────────────────────────
router.get('/queries', requireDbAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const queries = await SavedQuery.find({
      $or: [
        { created_by: userId },
        { shared_with: userId },
        { is_public: true },
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

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/queries', requireDbAuth, async (req, res) => {
  try {
    const { name, description = '', sql } = req.body;
    if (!name?.trim())  return res.status(400).json({ error: 'Query name is required.' });
    if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be at most 100 characters.' });
    if (!sql?.trim())   return res.status(400).json({ error: 'SQL is required.' });

    const q = await SavedQuery.create({
      name: name.trim(),
      description: description?.trim() || '',
      sql: sql.trim(),
      created_by: req.session.user.id,
    });

    res.status(201).json({ id: q._id.toString(), name: q.name });
  } catch (err) {
    console.error('[queries POST]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Update (owner only) ───────────────────────────────────────────────────────
router.put('/queries/:id', requireDbAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const q = await SavedQuery.findById(req.params.id).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'admin') {
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

// ── Delete (owner or admin) ───────────────────────────────────────────────────
router.delete('/queries/:id', requireDbAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const q = await SavedQuery.findById(req.params.id).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the owner can delete this query.' });
    }

    await SavedQuery.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[queries DELETE]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Share settings (owner only) ───────────────────────────────────────────────
// PUT /api/queries/:id/share
// body: { isPublic: bool, usernames: string[] }
router.put('/queries/:id/share', requireDbAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const q = await SavedQuery.findById(req.params.id).lean();
    if (!q) return res.status(404).json({ error: 'Query not found.' });
    if (q.created_by.toString() !== userId && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the owner can change sharing settings.' });
    }

    const { isPublic, usernames = [] } = req.body;

    // Resolve usernames → user IDs
    let sharedWithIds = [];
    if (Array.isArray(usernames) && usernames.length > 0) {
      const cleanNames = [...new Set(usernames.map(u => u.trim()).filter(Boolean))];
      const users = await User.find(
        { username: { $in: cleanNames } },
        '_id username'
      ).lean();
      sharedWithIds = users
        .filter(u => u._id.toString() !== userId)  // don't share with yourself
        .map(u => u._id);
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
