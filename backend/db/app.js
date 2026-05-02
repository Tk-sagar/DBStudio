const mongoose = require('mongoose');

// ── Schemas ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username:       { type: String, required: true },
  email:          { type: String, default: null },
  email_verified: { type: Boolean, default: false },
  password_hash:  { type: String, required: true },
  role:           { type: String, enum: ['admin', 'user'], default: 'user' },
  created_at:     { type: Date, default: Date.now },
});
// Case-insensitive unique index on username
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Sparse so null emails don't conflict
userSchema.index({ email: 1 }, { unique: true, sparse: true });

const savedConnectionSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  type:            { type: String, required: true },
  host:            { type: String, default: '' },
  port:            { type: Number, default: null },
  db_username:     { type: String, default: '' },
  db_password_enc: { type: String, default: '' },
  database_name:   { type: String, required: true },
  use_ssl:         { type: Boolean, default: false },
  created_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  created_at:      { type: Date, default: Date.now },
});

const connectionGrantSchema = new mongoose.Schema({
  connection_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedConnection', required: true },
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  permission:    { type: String, enum: ['read', 'write', 'full'], default: 'read' },
  granted_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  granted_at:    { type: Date, default: Date.now },
});
connectionGrantSchema.index({ connection_id: 1, user_id: 1 }, { unique: true });

const savedQuerySchema = new mongoose.Schema({
  name:          { type: String, required: true, maxlength: 100 },
  description:   { type: String, default: '',    maxlength: 500 },
  sql:           { type: String, required: true },
  created_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at:    { type: Date, default: Date.now },
  updated_at:    { type: Date, default: Date.now },
  is_public:     { type: Boolean, default: false },
  shared_with:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  connection_id: { type: String, default: null },  // null = legacy, visible on all connections
});
savedQuerySchema.index({ created_by: 1 });
savedQuerySchema.index({ shared_with: 1 });
savedQuerySchema.index({ connection_id: 1 });

// Stores email OTPs for verification and password reset
const otpSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code:       { type: String, required: true },
  type:       { type: String, enum: ['verify_email', 'reset_password'], required: true },
  expires_at: { type: Date, required: true },
  used:       { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});
otpSchema.index({ user_id: 1, type: 1 });
otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // auto-delete after expiry

// Tracks which saved connections a user has "pinned" to their top bar.
// Persisted in DB so tabs survive server restarts, session expiry, and browser clears.
const userConnectionPinSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  connection_id: { type: String, required: true },
  pinned_at:     { type: Date, default: Date.now },
});
userConnectionPinSchema.index({ user_id: 1, connection_id: 1 }, { unique: true });

// ── Models ────────────────────────────────────────────────────────────────────

const User                = mongoose.model('User',                userSchema);
const SavedConnection     = mongoose.model('SavedConnection',     savedConnectionSchema);
const ConnectionGrant     = mongoose.model('ConnectionGrant',     connectionGrantSchema);
const SavedQuery          = mongoose.model('SavedQuery',          savedQuerySchema);
const UserConnectionPin   = mongoose.model('UserConnectionPin',   userConnectionPinSchema);
const Otp                 = mongoose.model('Otp',                 otpSchema);

// ── Connect ───────────────────────────────────────────────────────────────────

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables.');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

module.exports = { connect, User, SavedConnection, ConnectionGrant, SavedQuery, UserConnectionPin, Otp };
