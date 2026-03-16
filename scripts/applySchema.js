require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL não configurado no ambiente.');
  }

  const schemaPath = path.resolve(__dirname, '../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({
    connectionString,
    ssl: String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false'
      ? { rejectUnauthorized: false }
      : false,
  });

  await client.connect();
  await client.query(sql);

  const checks = await client.query(
    "SELECT to_regclass('public.users') AS users_table, to_regclass('public.prazo_requests') AS prazo_table, to_regclass('public.demanda_notifications') AS notif_table"
  );

  console.log('Schema aplicado com sucesso.');
  console.log('users:', checks.rows[0].users_table);
  console.log('prazo_requests:', checks.rows[0].prazo_table);
  console.log('demanda_notifications:', checks.rows[0].notif_table);

  await client.end();
}

run().catch((error) => {
  console.error('Falha ao aplicar schema:', error.message);
  process.exit(1);
});
