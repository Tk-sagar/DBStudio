const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { User } = require('../db/app');
const registry = require('../adapters/registry');

const SALT_ROUNDS = 12;
const MAX_USERNAME = 50;
const MAX_PASSWORD = 128;

// GET /auth/me — current app user + DB connection state (single bootstrap call)
router.get('/auth/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });

  const adapter = registry.get(req.session.id);
  let tables = [];
  if (adapter) {
    try { tables = await adapter.getTables(); } catch (_) {}
  }

  res.json({
    user:         req.session.user,
    dbConnected:  !!adapter,
    dbInfo:       adapter ? req.session.dbInfo        : null,
    dbPermission: adapter ? (req.session.dbPermission || 'full') : null,
    tables,
  });
});

// GET /auth/setup-required — true if no users exist yet
router.get('/auth/setup-required', async (_req, res) => {
  try {
    const n = await User.countDocuments();
    res.json({ required: n === 0 });
  } catch (err) {
    console.error('[auth/setup-required]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/setup — create the first admin account (only if no users exist)
router.post('/auth/setup', async (req, res) => {
  try {
    const n = await User.countDocuments();
    if (n > 0) return res.status(400).json({ error: 'Setup already completed.' });

    const { username, password } = req.body;
    if (!username?.trim())                         return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)      return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!password || password.length < 8)           return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)             return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({ username: username.trim(), password_hash: hash, role: 'admin' });

    const user = { id: row._id.toString(), username: row.username, role: row.role };
    req.session.user = user;
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    console.error('[auth/setup]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    // Case-insensitive lookup via collation
    const row  = await User.findOne({ username: username.trim() }).collation({ locale: 'en', strength: 2 });
    // Constant-time compare even on miss (prevent user enumeration via timing)
    const hash = row?.password_hash || '$2a$12$invalidhashtopreventtimingattacks000000000000000000000';
    const ok   = await bcrypt.compare(password, hash);
    if (!row || !ok) return res.status(401).json({ error: 'Invalid username or password.' });

    const user = { id: row._id.toString(), username: row.username, role: row.role };
    req.session.regenerate((err) => {
      if (err) {
        console.error('[auth/login] session regenerate:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      req.session.user = user;
      res.json({ user });
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/register — self-registration (always creates 'user' role)
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim())                         return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)      return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!password || password.length < 8)           return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)             return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({ username: username.trim(), password_hash: hash, role: 'user' });

    const user = { id: row._id.toString(), username: row.username, role: row.role };
    req.session.regenerate((err) => {
      if (err) {
        console.error('[auth/register] session regenerate:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      req.session.user = user;
      res.status(201).json({ user });
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already taken.' });
    console.error('[auth/register]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/logout
router.post('/auth/logout', async (req, res) => {
  try {
    const adapter = registry.get(req.session.id);
    if (adapter) {
      try { await adapter.close(); } catch (_) {}
      registry.delete(req.session.id);
    }
    req.session.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/logout]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
