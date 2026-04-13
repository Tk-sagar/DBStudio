require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const compression = require('compression');

const { connect: connectMongo } = require('./db/app');
const connectRouter  = require('./routes/connect');
const tablesRouter   = require('./routes/tables');
const queryRouter    = require('./routes/query');
const rowsRouter     = require('./routes/rows');
const authRouter     = require('./routes/auth');
const adminRouter    = require('./routes/admin');
const myConnsRouter  = require('./routes/userConnections');

// ── Production guard ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32 || s === 'change-this-secret-in-production') {
    console.error(
      'FATAL: SESSION_SECRET must be set to a cryptographically random string ' +
      'of at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
    process.exit(1);
  }
}

const app = express();

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // API server — CSP is the frontend's concern
}));

// Gzip all responses — JSON compresses 70-80%
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = new Set(
  (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',').map(o => o.trim()).filter(Boolean)
);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
  },
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
    sameSite: 'strict',
  },
}));

// ── CSRF protection ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (allowedOrigins.has(origin)) return next();
  return res.status(403).json({ error: 'Request origin not allowed.' });
});

// ── Rate limiters ─────────────────────────────────────────────────────────────
const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many connection attempts. Please wait 15 minutes before trying again.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/connect',          connectLimiter);
app.use('/api/auth/login',       loginLimiter);
app.use('/api/auth/setup',       loginLimiter);
app.use('/api/auth/register',    loginLimiter);

app.use('/api', authRouter);
app.use('/api', adminRouter);
app.use('/api', myConnsRouter);
app.use('/api', connectRouter);
app.use('/api', tablesRouter);
app.use('/api', queryRouter);
app.use('/api', rowsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Centralised error handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 5001;
connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
