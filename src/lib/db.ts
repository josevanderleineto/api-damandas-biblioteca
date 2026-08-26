import { Pool, QueryResult, QueryResultRow } from 'pg';

let globalPool: Pool | null = null;

export function getPool(): Pool {
  if (globalPool) {
    return globalPool;
  }

  const rawConnectionString = String(process.env.DATABASE_URL || '').trim();

  if (!rawConnectionString) {
    throw new Error('DATABASE_URL não configurado no ambiente.');
  }

  const sslEnabled = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';
  
  let connectionString = rawConnectionString;
  if (sslEnabled && !rawConnectionString.includes('sslmode=')) {
    connectionString = `${rawConnectionString}${rawConnectionString.includes('?') ? '&' : '?'}sslmode=verify-full`;
  }

  globalPool = new Pool({
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  globalPool.on('error', (err) => {
    console.error('[db] Erro inesperado em cliente ocioso:', err.message);
  });

  return globalPool;
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  const pool = getPool();
  return pool.query<R>(text, params);
}
