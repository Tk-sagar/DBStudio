require('dotenv').config();
const express     = require('express');
const session     = require('express-session');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const compression = require('compression');
const path        = require('path');
const fs          = require('fs');

const { connect: connectMongo, Organization, User, SavedConnection, ConnectionGrant, UserConnectionPin } = require('./db/app');
const { decrypt }       = require('./utils/crypto');
const { createAdapter } = require('./adapters');
const registry      = require('./adapters/registry');
const connectRouter = require('./routes/connect');
const tablesRouter  = require('./routes/tables');
const queryRouter   = require('./routes/query');
const rowsRouter    = require('./routes/rows');
const authRouter    = require('./routes/auth');
const adminRouter   = require('./routes/admin');
const myConnsRouter    = require('./routes/userConnections');
const savedQueriesRouter = require('./routes/savedQueries');
const superAdminRouter   = require('./routes/superAdmin');
const auditLogRouter     = require('./routes/auditLog');

const IS_PROD       = process.env.NODE_ENV === 'production';
const PORT          = process.env.PORT || 5001;
const FRONTEND_ROOT = path.resolve(__dirname, '../frontend');

// ── Production guards ─────────────────────────────────────────────────────────
if (IS_PROD) {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32 || s === 'change-this-secret-in-production') {
    console.error('FATAL: SESSION_SECRET must be at least 32 random characters.');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 64) {
    console.error('FATAL: ENCRYPTION_KEY must be set to a 64-hex-character (32-byte) value in production.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
}

// ── Embed initial state safely in HTML (prevents </script> injection) ─────────
function safeJSON(data) {
  return JSON.stringify(data)
    .replace(/</g,  '\\u003c')
    .replace(/>/g,  '\\u003e')
    .replace(/&/g,  '\\u0026')
    .replace(/'/g,  '\\u0027');
}

// ── Build the initial data object from the current session ────────────────────
async function getInitialData(req) {
  const user = req.session?.user ?? null;

  let needsSetup = false;
  if (!user) {
    try { needsSetup = (await User.countDocuments()) === 0; } catch (_) {}
  }

  const openConnections = [];
  const sessionConns    = {};

  if (user) {
    const { id: userId, role } = user;
    const pins = await UserConnectionPin.find({ user_id: userId }).sort({ pinned_at: 1 }).lean();

    for (const pin of pins) {
      const connId = pin.connection_id;
      if (connId === '__direct__') continue;

      const conn = await SavedConnection.findById(connId).lean();
      if (!conn || (role !== 'super_admin' && user.org_id && conn.org_id?.toString() !== user.org_id)) {
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
            type:     conn.type,
            host:     conn.host,
            port:     conn.port,
            username: conn.db_username,
            password: decrypt(conn.db_password_enc),
            database: conn.database_name,
            ssl:      conn.use_ssl ?? false,
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
  }

  const adapter = registry.get(req.session.id);
  let tables = [];
  if (adapter) {
    try { tables = await adapter.getTables(); } catch (_) {}
  }

  return {
    user,
    needsSetup,
    dbConnected:  !!adapter,
    dbInfo:       adapter ? (req.session.dbInfo       ?? null) : null,
    dbPermission: adapter ? (req.session.dbPermission ?? 'full') : null,
    tables,
    openConnections,
    activeConnId: req.session.activeConnId || null,
  };
}

async function main() {
  await connectMongo();

  const app = express();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,       // managed separately if needed
    crossOriginEmbedderPolicy: false,   // allow loading assets
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(compression());

  // Hide Express fingerprint
  app.disable('x-powered-by');

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = new Set(
    (process.env.FRONTEND_URL || `http://localhost:${PORT}`)
      .split(',').map(o => o.trim()).filter(Boolean)
  );
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '512kb' }));

  // ── Sessions ──────────────────────────────────────────────────────────────
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: '__s',   // rename from default 'connect.sid' to reduce fingerprinting
    cookie: {
      secure:   IS_PROD && !process.env.ALLOW_HTTP,
      httpOnly: true,
      maxAge:   8 * 60 * 60 * 1000,
      sameSite: 'strict',
    },
  }));

  // ── CSRF origin check ─────────────────────────────────────────────────────
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.has(origin)) return next();
    return res.status(403).json({ error: 'Request origin not allowed.' });
  });

  // ── Rate limiters ─────────────────────────────────────────────────────────
  const rl = (max, skipSuccess = true) => rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    skipSuccessfulRequests: skipSuccess,
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' }),
  });

  // Auth endpoints: strict limits (count all attempts, not just failures)
  app.use('/api/auth/login',           rl(15, false));
  app.use('/api/auth/setup',           rl(10, false));
  app.use('/api/auth/register',        rl(10, false));
  app.use('/api/auth/verify-email',    rl(20, false));
  app.use('/api/auth/forgot-password', rl(10, false));
  app.use('/api/auth/reset-password',  rl(10, false));
  app.use('/api/auth/resend-otp',      rl(10, false));
  // Connection endpoints: moderate limits
  app.use('/api/connect',       rl(20));
  app.use('/api/my/connections', rl(60));
  // Admin write operations
  app.use('/api/admin',         rl(100));

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api', authRouter);
  app.use('/api', adminRouter);
  app.use('/api', myConnsRouter);
  app.use('/api', connectRouter);
  app.use('/api', tablesRouter);
  app.use('/api', queryRouter);
  app.use('/api', rowsRouter);
  app.use('/api', savedQueriesRouter);
  app.use('/api', superAdminRouter);
  app.use('/api', auditLogRouter);

  // Health check — no internal details
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ── SSR ───────────────────────────────────────────────────────────────────
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root:    FRONTEND_ROOT,
      server:  { middlewareMode: true },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      try {
        let template = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);

        const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
        const initialData = await getInitialData(req);
        try {
          const u = new URL(req.originalUrl, 'http://localhost');
          const inviteToken = u.searchParams.get('invite');
          if (inviteToken) initialData.inviteToken = inviteToken;
        } catch (_) {}
        const appHtml     = render(initialData);

        const html = template
          .replace('<!--app-html-->', appHtml)
          .replace('<!--ssr-data-->',  safeJSON(initialData));

        res.status(200).set('Content-Type', 'text/html').end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err);
        next(err);
      }
    });

  } else {
    const clientDist  = path.join(FRONTEND_ROOT, 'dist/client');
    const serverEntry = path.join(FRONTEND_ROOT, 'dist/server/entry-server.js');

    app.use(express.static(clientDist, { index: false }));

    const { render } = await import(serverEntry);
    const template   = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8');

    app.use(async (req, res, next) => {
      try {
        const initialData = await getInitialData(req);
        try {
          const u = new URL(req.originalUrl, 'http://localhost');
          const inviteToken = u.searchParams.get('invite');
          if (inviteToken) initialData.inviteToken = inviteToken;
        } catch (_) {}
        const appHtml     = render(initialData);

        const html = template
          .replace('<!--app-html-->', appHtml)
          .replace('<!--ssr-data-->',  safeJSON(initialData));

        res.status(200).set('Content-Type', 'text/html').end(html);
      } catch (err) { next(err); }
    });
  }

  // ── Global error handler — never leak stack traces or internal details ────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(`[${req.method} ${req.path}]`, err.message);
    const status = err.status || 500;
    // Only pass through safe error messages (403 CORS/CSRF; 429 rate limit)
    const safe = status === 403 || status === 429;
    res.status(status).json({ error: safe ? err.message : 'Something went wrong. Please try again.' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}  [${IS_PROD ? 'production' : 'development'}]`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
