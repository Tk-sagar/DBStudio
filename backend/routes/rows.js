const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const requirePerm = require('../middleware/requirePerm');
const { logAction } = require('../utils/audit');

router.get('/table/:name/pk', auth, async (req, res) => {
  try {
    const pk = await req.adapter.getPrimaryKey(req.params.name);
    res.json({ pk });
  } catch (err) {
    console.error('[table/pk GET]', err.message);
    res.status(500).json({ error: 'Failed to retrieve primary key.' });
  }
});

router.post('/table/:name/row', auth, requirePerm('write'), async (req, res) => {
  try {
    const result = await req.adapter.insertRow(req.params.name, req.body);
    res.status(201).json(result);
    logAction(req, {
      action: 'insert', tableName: req.params.name,
      rowId: result.id || null, newData: req.body,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/table/:name/row/:id', auth, requirePerm('write'), async (req, res) => {
  try {
    const pkColumn = await req.adapter.getPrimaryKey(req.params.name);
    if (!pkColumn) return res.status(400).json({ error: 'Table has no primary key.' });
    const oldData = req.adapter.getRowById
      ? await req.adapter.getRowById(req.params.name, req.params.id, pkColumn)
      : null;
    await req.adapter.updateRow(req.params.name, req.params.id, req.body, pkColumn);
    res.json({ success: true });
    logAction(req, {
      action: 'update', tableName: req.params.name,
      rowId: req.params.id, oldData, newData: req.body,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/table/:name/row/:id', auth, requirePerm('write'), async (req, res) => {
  try {
    const pkColumn = await req.adapter.getPrimaryKey(req.params.name);
    if (!pkColumn) return res.status(400).json({ error: 'Table has no primary key.' });
    const oldData = req.adapter.getRowById
      ? await req.adapter.getRowById(req.params.name, req.params.id, pkColumn)
      : null;
    await req.adapter.deleteRow(req.params.name, req.params.id, pkColumn);
    res.json({ success: true });
    logAction(req, {
      action: 'delete', tableName: req.params.name,
      rowId: req.params.id, oldData,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
