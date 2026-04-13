const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function getKey() {
  const k = process.env.ENCRYPTION_KEY || '';
  // Prefer an explicit 64-hex-char key (32 bytes)
  if (k.length >= 64) return Buffer.from(k.slice(0, 64), 'hex');
  // Dev fallback: derive from SESSION_SECRET (never use in production)
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Output format: base64( iv[12] + tag[16] + ciphertext )
 */
function encrypt(plaintext) {
  if (!plaintext) return '';
  const key    = getKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypts a value produced by encrypt().
 */
function decrypt(data) {
  if (!data) return '';
  try {
    const buf     = Buffer.from(data, 'base64');
    const iv      = buf.subarray(0, 12);
    const tag     = buf.subarray(12, 28);
    const enc     = buf.subarray(28);
    const key     = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

module.exports = { encrypt, decrypt };
