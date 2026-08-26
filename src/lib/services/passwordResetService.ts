import crypto from 'crypto';
import { query } from '../db';

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at)');
    tableEnsured = true;
  } catch (err) {
    console.error('Erro ao garantir tabela password_resets:', err);
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export async function createTokenForUser(userId: string, ttlMinutes = 60) {
  if (!userId) throw new Error('userId obrigatório');
  await ensureTable();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await query('DELETE FROM password_resets WHERE user_id = $1 OR expires_at < NOW()', [userId]);

  await query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

export async function consumeToken(rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  await ensureTable();

  const tokenHash = hashToken(rawToken);
  const result = await query(
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
  await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
  return userId;
}
