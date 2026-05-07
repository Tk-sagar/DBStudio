const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const requireAdmin  = require('../middleware/requireAdmin');
const { logAction } = require('../utils/audit');

router.get('/tables', auth, async (req, res) => {
  try {
    const tables = await req.adapter.getTables();
    res.json({ tables });
  } catch (err) {
    console.error('[tables GET]', err.message);
    res.status(500).json({ error: 'Failed to retrieve tables.' });
  }
});

router.get('/table/:name/structure', auth, async (req, res) => {
  try {
    const structure = await req.adapter.getTableStructure(req.params.name);
    res.json({ structure });
  } catch (err) {
    console.error('[table/structure GET]', err.message);
    res.status(500).json({ error: 'Failed to retrieve table structure.' });
  }
});

// ── Export all rows (no pagination cap) ──────────────────────────────────────
router.get('/table/:name/export', auth, async (req, res) => {
  try {
    const orderBy   = req.query.orderBy  || null;
    const orderDir  = req.query.orderDir === 'DESC' ? 'DESC' : 'ASC';
    const search    = req.query.search   || '';
    const searchFields = req.query.searchField
      ? [].concat(req.query.searchField).filter(Boolean)
      : [];
    let filters = [];
    if (req.query.filters) {
      try { filters = JSON.parse(req.query.filters); } catch {}
    }

    const result = await req.adapter.getRows(req.params.name, 1, 100_000, {
      orderBy, orderDir, search, searchFields, filters,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/table/:name', auth, async (req, res) => {
  try {
    const page    = parseInt(req.query.page)  || 1;
    const limit   = Math.min(parseInt(req.query.limit) || 50, 500);
    const orderBy  = req.query.orderBy  || null;
    const orderDir = req.query.orderDir === 'DESC' ? 'DESC' : 'ASC';
    const search   = req.query.search   || '';
    const searchFields = req.query.searchField
      ? [].concat(req.query.searchField).filter(Boolean)
      : [];
    let filters = [];
    if (req.query.filters) {
      try { filters = JSON.parse(req.query.filters); } catch {}
    }

    const result = await req.adapter.getRows(req.params.name, page, limit, {
      orderBy, orderDir, search, searchFields, filters,
    });
    res.json(result);
  } catch (err) {
    // Pass through adapter errors (table not found, invalid column, etc.) — user already has DB access
    res.status(400).json({ error: err.message });
  }
});

// ── Admin-only: get full table info for ALTER TABLE ───────────────────────────
router.get('/table/:name/alter-info', auth, requireAdmin, async (req, res) => {
  if (!req.adapter.getAlterInfo) return res.status(400).json({ error: 'ALTER TABLE not supported for this database type.' });
  try {
    const info = await req.adapter.getAlterInfo(req.params.name);
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Admin-only: apply ALTER TABLE ─────────────────────────────────────────────
router.post('/table/:name/alter', auth, requireAdmin, async (req, res) => {
  if (!req.adapter.alterTable) return res.status(400).json({ error: 'ALTER TABLE not supported for this database type.' });
  try {
    const { columns, newTableName, engine } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) return res.status(400).json({ error: 'columns array required.' });
    const result = await req.adapter.alterTable(req.params.name, { columns, newTableName, engine });
    res.json({ ok: true, tableName: result.tableName });
    const renamed = newTableName && newTableName !== req.params.name ? `, renamed to ${newTableName}` : '';
    logAction(req, { action: 'alter', tableName: req.params.name, detail: `Altered table structure${renamed}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Admin-only: drop table ────────────────────────────────────────────────────
router.delete('/table/:name', auth, requireAdmin, async (req, res) => {
  if (!req.adapter.dropTable) return res.status(400).json({ error: 'DROP TABLE not supported for this database type.' });
  try {
    await req.adapter.dropTable(req.params.name);
    res.json({ ok: true });
    logAction(req, { action: 'drop', tableName: req.params.name, detail: `Dropped table ${req.params.name}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
