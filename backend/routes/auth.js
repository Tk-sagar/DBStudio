const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { User, SavedConnection, ConnectionGrant, UserConnectionPin, Otp } = require('../db/app');
const { decrypt }        = require('../utils/crypto');
const { createAdapter }  = require('../adapters');
const registry           = require('../adapters/registry');
const { sendVerifyEmail, sendPasswordReset } = require('../utils/mailer');

const SALT_ROUNDS = 12;
const MAX_USERNAME = 50;
const MAX_PASSWORD = 128;
const OTP_TTL_MS   = 10 * 60 * 1000; // 10 min
const OTP_COOLDOWN = 60 * 1000;       // 1 min between resends
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function issueOtp(userId, type) {
  const recent = await Otp.findOne({ user_id: userId, type, used: false })
    .sort({ created_at: -1 }).lean();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < OTP_COOLDOWN) {
    const wait = Math.ceil((OTP_COOLDOWN - (Date.now() - new Date(recent.created_at).getTime())) / 1000);
    throw Object.assign(new Error(`Please wait ${wait}s before requesting another code.`), { status: 429 });
  }
  await Otp.deleteMany({ user_id: userId, type });
  const code = generateOtp();
  await Otp.create({ user_id: userId, type, code, expires_at: new Date(Date.now() + OTP_TTL_MS) });
  return code;
}

async function verifyOtp(userId, type, code) {
  const otp = await Otp.findOne({ user_id: userId, type, used: false }).lean();
  if (!otp)                                 throw Object.assign(new Error('OTP not found or already used.'), { status: 400 });
  if (new Date(otp.expires_at) < new Date()) throw Object.assign(new Error('OTP has expired. Request a new one.'), { status: 400 });
  if (otp.code !== String(code).trim())     throw Object.assign(new Error('Invalid OTP.'), { status: 400 });
  await Otp.findByIdAndUpdate(otp._id, { used: true });
}

// ── Bootstrap (GET /auth/me) ──────────────────────────────────────────────────

router.get('/auth/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });

  const userId = req.session.user.id;
  const role   = req.session.user.role;

  const pins = await UserConnectionPin.find({ user_id: userId }).sort({ pinned_at: 1 }).lean();

  const openConnections = [];
  const sessionConns    = {};

  for (const pin of pins) {
    const connId = pin.connection_id;
    if (connId === '__direct__') continue;

    const conn = await SavedConnection.findById(connId).lean();
    if (!conn) { await UserConnectionPin.deleteOne({ _id: pin._id }); continue; }

    let permission = 'full';
    if (role !== 'admin') {
      const grant = await ConnectionGrant.findOne({ connection_id: connId, user_id: userId }).lean();
      if (!grant) { await UserConnectionPin.deleteOne({ _id: pin._id }); continue; }
      permission = grant.permission;
    }

    const dbInfo = { type: conn.type, database: conn.database_name, name: conn.name };
    openConnections.push({ id: connId, name: conn.name, type: conn.type, permission, dbInfo });
    sessionConns[connId] = { dbInfo, permission };

    if (!registry.getAllConnIds(req.session.id).includes(connId)) {
      try {
        const newAdapter = await createAdapter({
          type:     conn.type,
          host:     conn.host,
          port:     conn.port,
          username: conn.db_username,
          password: decrypt(conn.db_password_enc),
          database: conn.database_name,
          ssl:      conn.use_ssl ?? false,
        });
        registry.add(req.session.id, connId, newAdapter);
      } catch (_) {}
    }
  }

  if (Object.keys(sessionConns).length) {
    req.session.connections = sessionConns;
    const validIds = openConnections.map(c => c.id);
    if (!validIds.includes(req.session.activeConnId)) {
      req.session.activeConnId = validIds[validIds.length - 1] ?? null;
    }
    if (req.session.activeConnId) {
      registry.activate(req.session.id, req.session.activeConnId);
      req.session.dbInfo       = sessionConns[req.session.activeConnId]?.dbInfo;
      req.session.dbPermission = sessionConns[req.session.activeConnId]?.permission;
    }
  }

  const adapter = registry.get(req.session.id);
  let tables = [];
  if (adapter) {
    try { tables = await adapter.getTables(); } catch (_) {}
  }

  res.json({
    user:            req.session.user,
    dbConnected:     !!adapter,
    dbInfo:          adapter ? req.session.dbInfo        : null,
    dbPermission:    adapter ? (req.session.dbPermission || 'full') : null,
    tables,
    openConnections,
    activeConnId:    req.session.activeConnId || null,
  });
});

// ── Setup ─────────────────────────────────────────────────────────────────────

router.get('/auth/setup-required', async (_req, res) => {
  try {
    const n = await User.countDocuments();
    res.json({ required: n === 0 });
  } catch (err) {
    console.error('[auth/setup-required]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/auth/setup', async (req, res) => {
  try {
    const n = await User.countDocuments();
    if (n > 0) return res.status(400).json({ error: 'Setup already completed.' });

    const { username, password, email } = req.body;
    if (!username?.trim())                         return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)      return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!password || password.length < 8)           return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)             return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const emailVal = email?.trim().toLowerCase();
    if (emailVal && !EMAIL_RE.test(emailVal)) return res.status(400).json({ error: 'Invalid email address.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({
      username:       username.trim(),
      password_hash:  hash,
      role:           'admin',
      ...(emailVal && { email: emailVal, email_verified: true }),
    });

    const user = { id: row._id.toString(), username: row.username, role: row.role, email: row.email || null };
    req.session.user = user;
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    console.error('[auth/setup]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Username/email and password are required.' });
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    // Find by username (case-insensitive), fall back to email
    let row = await User.findOne({ username: identifier.trim() }).collation({ locale: 'en', strength: 2 });
    if (!row && EMAIL_RE.test(identifier.trim())) {
      row = await User.findOne({ email: identifier.trim().toLowerCase() });
    }

    const hash = row?.password_hash || '$2a$12$invalidhashtopreventtimingattacks000000000000000000000';
    const ok   = await bcrypt.compare(password, hash);
    if (!row || !ok) return res.status(401).json({ error: 'Invalid credentials.' });

    // Block login for unverified email (legacy null-email accounts are always allowed)
    if (row.email && !row.email_verified) {
      return res.status(403).json({
        error:               'Please verify your email before signing in.',
        pendingVerification: true,
        userId:              row._id.toString(),
      });
    }

    const user = { id: row._id.toString(), username: row.username, role: row.role, email: row.email || null };
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

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username?.trim())                        return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)     return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!email?.trim())                           return res.status(400).json({ error: 'Email is required.' });
    if (!EMAIL_RE.test(email.trim()))             return res.status(400).json({ error: 'Invalid email address.' });
    if (!password || password.length < 8)         return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)           return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({
      username:       username.trim(),
      email:          email.trim().toLowerCase(),
      email_verified: false,
      password_hash:  hash,
      role:           'user',
    });

    const code = await issueOtp(row._id, 'verify_email');
    await sendVerifyEmail(row.email, code);

    res.status(201).json({ pendingVerification: true, userId: row._id.toString() });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.message.includes('email') ? 'Email' : 'Username';
      return res.status(409).json({ error: `${field} already taken.` });
    }
    console.error('[auth/register]', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
  }
});

// ── Email verification ────────────────────────────────────────────────────────

router.post('/auth/verify-email', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: 'userId and otp are required.' });

    await verifyOtp(userId, 'verify_email', otp);
    const row = await User.findByIdAndUpdate(userId, { email_verified: true }, { new: true }).lean();
    if (!row) return res.status(404).json({ error: 'User not found.' });

    const user = { id: row._id.toString(), username: row.username, role: row.role, email: row.email || null };
    req.session.regenerate((err) => {
      if (err) {
        console.error('[auth/verify-email] session regenerate:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      req.session.user = user;
      res.json({ user });
    });
  } catch (err) {
    console.error('[auth/verify-email]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
  }
});

// ── Resend OTP ────────────────────────────────────────────────────────────────

router.post('/auth/resend-otp', async (req, res) => {
  try {
    const { userId, type } = req.body;
    if (!userId || !['verify_email', 'reset_password'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    const row = await User.findById(userId).lean();
    if (!row || !row.email) return res.status(404).json({ error: 'User not found.' });
    if (type === 'verify_email' && row.email_verified) {
      return res.status(400).json({ error: 'Email already verified.' });
    }

    const code = await issueOtp(userId, type);
    if (type === 'verify_email') await sendVerifyEmail(row.email, code);
    else                         await sendPasswordReset(row.email, code);

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/resend-otp]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
  }
});

// ── Forgot password ───────────────────────────────────────────────────────────

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const row = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    if (row) {
      try {
        const code = await issueOtp(row._id, 'reset_password');
        await sendPasswordReset(row.email, code);
        return res.json({ success: true, userId: row._id.toString() });
      } catch (err) {
        if (err.status === 429) return res.status(429).json({ error: err.message });
        throw err;
      }
    }

    // Don't reveal whether email exists
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Reset password ────────────────────────────────────────────────────────────

router.post('/auth/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    if (!userId || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (newPassword.length > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });
    }

    await verifyOtp(userId, 'reset_password', otp);
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await User.findByIdAndUpdate(userId, { password_hash: hash });

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
  }
});

// ── Users list (for query sharing UI) ────────────────────────────────────────

router.get('/auth/users', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const users = await User
      .find({ _id: { $ne: req.session.user.id } }, 'username')
      .sort({ username: 1 }).lean();
    res.json({ users: users.map(u => ({ id: u._id.toString(), username: u.username })) });
  } catch (err) {
    console.error('[auth/users]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Change password ───────────────────────────────────────────────────────────

router.post('/auth/change-password', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both current and new password are required.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (newPassword.length > MAX_PASSWORD) return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const row = await User.findById(req.session.user.id);
    if (!row) return res.status(404).json({ error: 'User not found.' });

    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await User.findByIdAndUpdate(row._id, { password_hash: hash });
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/change-password]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/auth/logout', async (req, res) => {
  try {
    await registry.delete(req.session.id);
    await UserConnectionPin.deleteMany({ user_id: req.session.user?.id }).catch(() => {});
    req.session.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('[auth/logout]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
