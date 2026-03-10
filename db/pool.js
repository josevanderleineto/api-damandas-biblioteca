const { Pool } = require('pg');

const connectionString = String(process.env.DATABASE_URL || '').trim();

if (!connectionString) {
  throw new Error('DATABASE_URL não configurado. Defina a conexão do Neon no ambiente.');
}

const sslEnabled = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};
