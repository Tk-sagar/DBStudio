const mongoose = require('mongoose');

// ── Schemas ───────────────────────────────────────────────────────────────────

const organizationSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  slug:            { type: String, required: true },
  email_domain:    { type: String, default: null },  // e.g. "company.com" — only this domain can be invited
  plan:            { type: String, enum: ['free', 'pro'], default: 'free' },
  owner_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  max_users:       { type: Number, default: 5 },
  max_connections: { type: Number, default: 3 },
  created_at:      { type: Date, default: Date.now },
});
organizationSchema.index({ slug: 1 }, { unique: true });

const userSchema = new mongoose.Schema({
  username:       { type: String, required: true },
  email:          { type: String, default: null },
  email_verified: { type: Boolean, default: false },
  password_hash:  { type: String, required: true },
  role:           { type: String, enum: ['super_admin', 'org_admin', 'user'], default: 'user' },
  org_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  created_at:     { type: Date, default: Date.now },
});
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ email: 1 },    { unique: true, sparse: true });
userSchema.index({ org_id: 1 });

const inviteSchema = new mongoose.Schema({
  org_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  email:      { type: String, required: true },
  role:       { type: String, enum: ['org_admin', 'user'], default: 'user' },
  token:      { type: String, required: true },
  invited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expires_at: { type: Date, required: true },
  used:       { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});
inviteSchema.index({ token: 1 }, { unique: true });
inviteSchema.index({ org_id: 1, email: 1 });
inviteSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

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
  org_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  created_at:      { type: Date, default: Date.now },
});
savedConnectionSchema.index({ org_id: 1 });

const connectionGrantSchema = new mongoose.Schema({
  connection_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedConnection', required: true },
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  org_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  permission:    { type: String, enum: ['read', 'write', 'full'], default: 'read' },
  granted_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  granted_at:    { type: Date, default: Date.now },
});
connectionGrantSchema.index({ connection_id: 1, user_id: 1 }, { unique: true });
connectionGrantSchema.index({ org_id: 1 });

const savedQuerySchema = new mongoose.Schema({
  name:          { type: String, required: true, maxlength: 100 },
  description:   { type: String, default: '',    maxlength: 500 },
  sql:           { type: String, required: true },
  created_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  org_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  created_at:    { type: Date, default: Date.now },
  updated_at:    { type: Date, default: Date.now },
  is_public:     { type: Boolean, default: false },
  shared_with:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  connection_id: { type: String, default: null },
});
savedQuerySchema.index({ created_by: 1 });
savedQuerySchema.index({ org_id: 1 });
savedQuerySchema.index({ shared_with: 1 });
savedQuerySchema.index({ connection_id: 1 });

const otpSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code:       { type: String, required: true },
  type:       { type: String, enum: ['verify_email', 'reset_password'], required: true },
  expires_at: { type: Date, required: true },
  used:       { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});
otpSchema.index({ user_id: 1, type: 1 });
otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const userConnectionPinSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  connection_id: { type: String, required: true },
  pinned_at:     { type: Date, default: Date.now },
});
userConnectionPinSchema.index({ user_id: 1, connection_id: 1 }, { unique: true });

const auditLogSchema = new mongoose.Schema({
  action:         { type: String, enum: ['insert','update','delete','alter','drop'], required: true },
  tableName:      { type: String, required: true },
  connectionId:   { type: String, default: null },
  connectionName: { type: String, default: '' },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username:       { type: String, default: 'unknown' },
  rowId:          { type: mongoose.Schema.Types.Mixed, default: null },
  oldData:        { type: mongoose.Schema.Types.Mixed, default: null },
  newData:        { type: mongoose.Schema.Types.Mixed, default: null },
  detail:         { type: String, default: '' },
  timestamp:      { type: Date, default: Date.now },
});
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ connectionId: 1, timestamp: -1 });
auditLogSchema.index({ tableName: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });

// ── Models ────────────────────────────────────────────────────────────────────

const Organization      = mongoose.model('Organization',      organizationSchema);
const User              = mongoose.model('User',              userSchema);
const Invite            = mongoose.model('Invite',            inviteSchema);
const SavedConnection   = mongoose.model('SavedConnection',   savedConnectionSchema);
const ConnectionGrant   = mongoose.model('ConnectionGrant',   connectionGrantSchema);
const SavedQuery        = mongoose.model('SavedQuery',        savedQuerySchema);
const Otp               = mongoose.model('Otp',               otpSchema);
const UserConnectionPin = mongoose.model('UserConnectionPin', userConnectionPinSchema);
const AuditLog          = mongoose.model('AuditLog',          auditLogSchema);

// ── Connect ───────────────────────────────────────────────────────────────────

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables.');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

module.exports = { connect, Organization, User, Invite, SavedConnection, ConnectionGrant, SavedQuery, Otp, UserConnectionPin, AuditLog };
