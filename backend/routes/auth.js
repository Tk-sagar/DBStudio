const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { Tenant, User, Invite, SavedConnection, ConnectionGrant, UserConnectionPin, Otp } = require('../db/app');
const { decrypt }        = require('../utils/crypto');
const { createAdapter }  = require('../adapters');
const registry           = require('../adapters/registry');
const { sendVerifyEmail, sendPasswordReset } = require('../utils/mailer');

const SALT_ROUNDS = 12;
const MAX_USERNAME = 50;
const MAX_PASSWORD = 128;
const OTP_TTL_MS   = 10 * 60 * 1000;
const OTP_COOLDOWN = 60 * 1000;
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 1;
  while (await Tenant.exists({ slug })) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

function sessionUser(row, tenant = null) {
  return {
    id:          row._id.toString(),
    username:    row.username,
    email:       row.email || null,
    role:        row.role,
    tenant_id:   tenant ? tenant._id.toString() : (row.tenant_id ? row.tenant_id.toString() : null),
    tenant_name: tenant ? tenant.name : null,
  };
}

async function issueOtp(userId, type) {
  const recent = await Otp.findOne({ user_id: userId, type, used: false }).sort({ created_at: -1 }).lean();
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
  if (!otp)                                  throw Object.assign(new Error('OTP not found or already used.'), { status: 400 });
  if (new Date(otp.expires_at) < new Date()) throw Object.assign(new Error('OTP has expired. Request a new one.'), { status: 400 });
  if (otp.code !== String(code).trim())      throw Object.assign(new Error('Invalid OTP.'), { status: 400 });
  await Otp.findByIdAndUpdate(otp._id, { used: true });
}

// Helper: restore pinned connections for /auth/me
async function restoreConnections(req, userId, role, tenantId) {
  const pins = await UserConnectionPin.find({ user_id: userId }).sort({ pinned_at: 1 }).lean();
  const openConnections = [];
  const sessionConns    = {};

  for (const pin of pins) {
    const connId = pin.connection_id;
    if (connId === '__direct__') continue;

    const conn = await SavedConnection.findById(connId).lean();
    if (!conn || (tenantId && conn.tenant_id?.toString() !== tenantId)) {
      await UserConnectionPin.deleteOne({ _id: pin._id }); continue;
    }

    let permission = 'full';
    if (role === 'user') {
      const grant = await ConnectionGrant.findOne({ connection_id: connId, user_id: userId }).lean();
      if (!grant) { await UserConnectionPin.deleteOne({ _id: pin._id }); continue; }
      permission = grant.permission;
    }

    const dbInfo = { type: conn.type, database: conn.database_name, name: conn.name };
    openConnections.push({ id: connId, name: conn.name, type: conn.type, permission, dbInfo });
    sessionConns[connId] = { dbInfo, permission };

    if (!registry.getAllConnIds(req.session.id).includes(connId)) {
      try {
        const adapter = await createAdapter({
          type: conn.type, host: conn.host, port: conn.port,
          username: conn.db_username, password: decrypt(conn.db_password_enc),
          database: conn.database_name, ssl: conn.use_ssl ?? false,
        });
        registry.add(req.session.id, connId, adapter);
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
  return { openConnections, sessionConns };
}

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get('/auth/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const { id: userId, role, tenant_id: tenantId } = req.session.user;

  // Enrich tenant_name if missing from session
  if (tenantId && !req.session.user.tenant_name) {
    const t = await Tenant.findById(tenantId).lean();
    if (t) req.session.user.tenant_name = t.name;
  }

  const { openConnections } = await restoreConnections(req, userId, role, tenantId);

  const adapter = registry.get(req.session.id);
  let tables = [];
  if (adapter) { try { tables = await adapter.getTables(); } catch (_) {} }

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

// ── GET /auth/setup-required ──────────────────────────────────────────────────

router.get('/auth/setup-required', async (_req, res) => {
  try {
    const n = await User.countDocuments();
    res.json({ required: n === 0 });
  } catch (err) {
    console.error('[auth/setup-required]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── POST /auth/setup — creates super_admin (first run only) ───────────────────

router.post('/auth/setup', async (req, res) => {
  try {
    const n = await User.countDocuments();
    if (n > 0) return res.status(400).json({ error: 'Setup already completed.' });

    const { username, password, email } = req.body;
    if (!username?.trim())                        return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)     return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!password || password.length < 8)          return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)            return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const emailVal = email?.trim().toLowerCase();
    if (emailVal && !EMAIL_RE.test(emailVal)) return res.status(400).json({ error: 'Invalid email address.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({
      username:       username.trim(),
      password_hash:  hash,
      role:           'super_admin',
      tenant_id:      null,
      ...(emailVal && { email: emailVal, email_verified: true }),
    });

    const user = sessionUser(row);
    req.session.user = user;
    res.json({ user });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already exists.' });
    console.error('[auth/setup]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── POST /auth/register — creates Tenant + tenant_admin ───────────────────────

router.post('/auth/register', async (req, res) => {
  try {
    const { orgName, username, email, password } = req.body;
    if (!orgName?.trim())                         return res.status(400).json({ error: 'Organization name is required.' });
    if (orgName.trim().length > 100)              return res.status(400).json({ error: 'Organization name must be at most 100 characters.' });
    if (!username?.trim())                        return res.status(400).json({ error: 'Username is required.' });
    if (username.trim().length > MAX_USERNAME)     return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (!email?.trim())                           return res.status(400).json({ error: 'Email is required.' });
    if (!EMAIL_RE.test(email.trim()))             return res.status(400).json({ error: 'Invalid email address.' });
    if (!password || password.length < 8)         return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)           return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const slug  = await uniqueSlug(orgName.trim());
    const tenant = await Tenant.create({ name: orgName.trim(), slug });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({
      username:       username.trim(),
      email:          email.trim().toLowerCase(),
      email_verified: false,
      password_hash:  hash,
      role:           'tenant_admin',
      tenant_id:      tenant._id,
    });

    // Link tenant owner
    await Tenant.findByIdAndUpdate(tenant._id, { owner_id: row._id });

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

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Username/email and password are required.' });
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input.' });
    }

    let row = await User.findOne({ username: identifier.trim() }).collation({ locale: 'en', strength: 2 });
    if (!row && EMAIL_RE.test(identifier.trim())) {
      row = await User.findOne({ email: identifier.trim().toLowerCase() });
    }

    const hash = row?.password_hash || '$2a$12$invalidhashtopreventtimingattacks000000000000000000000';
    const ok   = await bcrypt.compare(password, hash);
    if (!row || !ok) return res.status(401).json({ error: 'Invalid credentials.' });

    if (row.email && !row.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        pendingVerification: true,
        userId: row._id.toString(),
      });
    }

    let tenant = null;
    if (row.tenant_id) tenant = await Tenant.findById(row.tenant_id).lean();

    const user = sessionUser(row, tenant);
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

// ── POST /auth/verify-email ───────────────────────────────────────────────────

router.post('/auth/verify-email', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: 'userId and otp are required.' });

    await verifyOtp(userId, 'verify_email', otp);
    const row = await User.findByIdAndUpdate(userId, { email_verified: true }, { new: true }).lean();
    if (!row) return res.status(404).json({ error: 'User not found.' });

    let tenant = null;
    if (row.tenant_id) tenant = await Tenant.findById(row.tenant_id).lean();

    const user = sessionUser(row, tenant);
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

// ── POST /auth/resend-otp ─────────────────────────────────────────────────────

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

// ── POST /auth/forgot-password ────────────────────────────────────────────────

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

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────

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

// ── GET /auth/invite/:token — preview invite (no auth needed) ─────────────────

router.get('/auth/invite/:token', async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token, used: false })
      .populate('tenant_id', 'name')
      .lean();
    if (!invite || new Date(invite.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Invite link is invalid or has expired.' });
    }
    res.json({
      email:       invite.email,
      role:        invite.role,
      tenant_name: invite.tenant_id?.name || '',
    });
  } catch (err) {
    console.error('[auth/invite]', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ── POST /auth/join — accept invite, create account ───────────────────────────

router.post('/auth/join', async (req, res) => {
  try {
    const { token, username, password } = req.body;
    if (!token || !username?.trim() || !password) {
      return res.status(400).json({ error: 'Token, username, and password are required.' });
    }
    if (username.trim().length > MAX_USERNAME) return res.status(400).json({ error: `Username must be at most ${MAX_USERNAME} characters.` });
    if (password.length < 8)                   return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD)        return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters.` });

    const invite = await Invite.findOne({ token, used: false })
      .populate('tenant_id')
      .lean();
    if (!invite || new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite link is invalid or has expired.' });
    }

    // Check if email already has an account
    const existing = await User.findOne({ email: invite.email }).lean();
    if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const row  = await User.create({
      username:       username.trim(),
      email:          invite.email,
      email_verified: true, // invite = verified email
      password_hash:  hash,
      role:           invite.role,
      tenant_id:      invite.tenant_id._id,
    });

    await Invite.findByIdAndUpdate(invite._id, { used: true });

    const tenant = invite.tenant_id;
    const user   = sessionUser(row, tenant);
    req.session.regenerate((err) => {
      if (err) {
        console.error('[auth/join] session regenerate:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      req.session.user = user;
      res.status(201).json({ user });
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Username already taken.' });
    console.error('[auth/join]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── GET /auth/users — list users in same tenant (for query sharing UI) ────────

router.get('/auth/users', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const { id: userId, tenant_id } = req.session.user;
    const users = await User
      .find({ _id: { $ne: userId }, tenant_id: tenant_id || null }, 'username')
      .sort({ username: 1 }).lean();
    res.json({ users: users.map(u => ({ id: u._id.toString(), username: u.username })) });
  } catch (err) {
    console.error('[auth/users]', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── POST /auth/change-password ────────────────────────────────────────────────

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

// ── POST /auth/logout ─────────────────────────────────────────────────────────

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
