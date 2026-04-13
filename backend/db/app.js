const mongoose = require('mongoose');

// ── Schemas ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username:      { type: String, required: true },
  password_hash: { type: String, required: true },
  role:          { type: String, enum: ['admin', 'user'], default: 'user' },
  created_at:    { type: Date, default: Date.now },
});
// Case-insensitive unique index on username
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const savedConnectionSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  type:            { type: String, required: true },
  host:            { type: String, default: '' },
  port:            { type: Number, default: null },
  db_username:     { type: String, default: '' },
  db_password_enc: { type: String, default: '' },
  database_name:   { type: String, required: true },
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

// ── Models ────────────────────────────────────────────────────────────────────

const User            = mongoose.model('User',            userSchema);
const SavedConnection = mongoose.model('SavedConnection', savedConnectionSchema);
const ConnectionGrant = mongoose.model('ConnectionGrant', connectionGrantSchema);

// ── Connect ───────────────────────────────────────────────────────────────────

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables.');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

module.exports = { connect, User, SavedConnection, ConnectionGrant };
