const db = require('../db/pool');

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeField(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function buildAssignmentHash(demanda) {
  return [
    demanda?.demanda,
    demanda?.responsavel,
    demanda?.email,
  ]
    .map(normalizeField)
    .join('|');
}

async function getRecord(demandaId) {
  const id = normalizeId(demandaId);
  if (!id) return null;

  const result = await db.query(
    `SELECT demanda_id, assignment_hash, assignment_sent_at, last_reminder_key, last_reminder_sent_at
       FROM demanda_notifications
      WHERE demanda_id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function assignmentAlreadySent(demandaId, assignmentHash) {
  const record = await getRecord(demandaId);
  return !!(record && record.assignment_hash === assignmentHash && record.assignment_sent_at);
}

async function markAssignmentSent(demandaId, assignmentHash) {
  const id = normalizeId(demandaId);
  if (!id) return;

  await db.query(
    `INSERT INTO demanda_notifications (demanda_id, assignment_hash, assignment_sent_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (demanda_id) DO UPDATE SET
       assignment_hash = EXCLUDED.assignment_hash,
       assignment_sent_at = NOW(),
       updated_at = NOW()`,
    [id, assignmentHash]
  );
}

async function reminderAlreadySent(demandaId, reminderKey) {
  const record = await getRecord(demandaId);
  return !!(record && record.last_reminder_key === reminderKey && record.last_reminder_sent_at);
}

async function markReminderSent(demandaId, reminderKey) {
  const id = normalizeId(demandaId);
  if (!id) return;

  await db.query(
    `INSERT INTO demanda_notifications (demanda_id, last_reminder_key, last_reminder_sent_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (demanda_id) DO UPDATE SET
       last_reminder_key = EXCLUDED.last_reminder_key,
       last_reminder_sent_at = NOW(),
       updated_at = NOW()`,
    [id, reminderKey]
  );
}

module.exports = {
  buildAssignmentHash,
  assignmentAlreadySent,
  markAssignmentSent,
  reminderAlreadySent,
  markReminderSent,
};
