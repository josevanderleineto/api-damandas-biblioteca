const { Pool } = require('pg');

const rawConnectionString = String(process.env.DATABASE_URL || '').trim();

if (!rawConnectionString) {
  throw new Error('DATABASE_URL não configurado. Defina a conexão do Neon no ambiente.');
}

// Sugestão do driver: evitar warn de sslmode. Se não vier no URL, força verify-full.
const connectionString = rawConnectionString.includes('sslmode=')
  ? rawConnectionString
  : `${rawConnectionString}${rawConnectionString.includes('?') ? '&' : '?'}sslmode=verify-full`;

const sslEnabled = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Evita crash se o provedor encerrar conexões ociosas.
  console.error('[db] erro inesperado em cliente ocioso:', err.message);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};
