const crypto = require('crypto');
const db = require('../db/pool');

const ensureTablePromise = ensureTable();

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query('CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at)');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

async function createTokenForUser(userId, ttlMinutes = 60) {
  if (!userId) throw new Error('userId obrigatório');
  await ensureTablePromise;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  // Remove tokens antigos ou expirados do usuário.
  await db.query('DELETE FROM password_resets WHERE user_id = $1 OR expires_at < NOW()', [userId]);

  await db.query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

async function consumeToken(rawToken) {
  if (!rawToken) return null;
  await ensureTablePromise;

  const tokenHash = hashToken(rawToken);
  const result = await db.query(
    `UPDATE password_resets
        SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    [tokenHash]
  );

  if (result.rowCount === 0) return null;

  const userId = result.rows[0].user_id;
  // Limpa outros tokens ativos do mesmo usuário para evitar reutilização.
  await db.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
  return userId;
}

module.exports = {
  createTokenForUser,
  consumeToken,
};
