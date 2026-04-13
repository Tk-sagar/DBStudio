const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/tables', auth, async (req, res) => {
  try {
    const tables = await req.adapter.getTables();
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/table/:name/structure', auth, async (req, res) => {
  try {
    const structure = await req.adapter.getTableStructure(req.params.name);
    res.json({ structure });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/table/:name', auth, async (req, res) => {
  try {
    const page    = parseInt(req.query.page)  || 1;
    const limit   = Math.min(parseInt(req.query.limit) || 50, 500);
    const orderBy  = req.query.orderBy  || null;
    const orderDir = req.query.orderDir === 'DESC' ? 'DESC' : 'ASC';
    const search   = req.query.search   || '';
    // searchField can be a single string or array of strings
    const searchFields = req.query.searchField
      ? [].concat(req.query.searchField).filter(Boolean)
      : [];
    // filters is a JSON array of {field, op, value} rules
    let filters = [];
    if (req.query.filters) {
      try { filters = JSON.parse(req.query.filters); } catch {}
    }

    const result = await req.adapter.getRows(req.params.name, page, limit, {
      orderBy, orderDir, search, searchFields, filters,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
