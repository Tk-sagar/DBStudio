const express     = require('express');
const router      = express.Router();
const auth        = require('../middleware/auth');
const requirePerm = require('../middleware/requirePerm');

router.get('/table/:name/pk', auth, async (req, res) => {
  try {
    const pk = await req.adapter.getPrimaryKey(req.params.name);
    res.json({ pk });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/table/:name/row', auth, requirePerm('write'), async (req, res) => {
  try {
    const result = await req.adapter.insertRow(req.params.name, req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/table/:name/row/:id', auth, requirePerm('write'), async (req, res) => {
  try {
    const pkColumn = await req.adapter.getPrimaryKey(req.params.name);
    if (!pkColumn) return res.status(400).json({ error: 'Table has no primary key.' });
    await req.adapter.updateRow(req.params.name, req.params.id, req.body, pkColumn);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/table/:name/row/:id', auth, requirePerm('write'), async (req, res) => {
  try {
    const pkColumn = await req.adapter.getPrimaryKey(req.params.name);
    if (!pkColumn) return res.status(400).json({ error: 'Table has no primary key.' });
    await req.adapter.deleteRow(req.params.name, req.params.id, pkColumn);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
