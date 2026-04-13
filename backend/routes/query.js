const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const requirePerm = require('../middleware/requirePerm');

const MAX_SQL_LENGTH = 100_000; // 100 KB

router.post('/query', auth, requirePerm('full'), async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || !sql.trim()) {
      return res.status(400).json({ error: 'SQL query is required.' });
    }
    if (sql.length > MAX_SQL_LENGTH) {
      return res.status(400).json({ error: `SQL query too large (max ${MAX_SQL_LENGTH / 1000} KB).` });
    }
    const result = await req.adapter.query(sql);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
