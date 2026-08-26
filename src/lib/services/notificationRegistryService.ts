import { query } from '../db';

function normalizeId(value: any) {
  return String(value || '').trim();
}

function normalizeField(value: any) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

export function buildAssignmentHash(demanda: any) {
  return [
    demanda?.demanda,
    demanda?.responsavel,
    demanda?.email,
  ]
    .map(normalizeField)
    .join('|');
}

export async function getRecord(demandaId: string) {
  const id = normalizeId(demandaId);
  if (!id) return null;

  const result = await query(
    `SELECT demanda_id, assignment_hash, assignment_sent_at, last_reminder_key, last_reminder_sent_at
       FROM demanda_notifications
      WHERE demanda_id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function assignmentAlreadySent(demandaId: string, assignmentHash: string): Promise<boolean> {
  const record = await getRecord(demandaId);
  return !!(record && record.assignment_hash === assignmentHash && record.assignment_sent_at);
}

export async function markAssignmentSent(demandaId: string, assignmentHash: string): Promise<void> {
  const id = normalizeId(demandaId);
  if (!id) return;

  await query(
    `INSERT INTO demanda_notifications (demanda_id, assignment_hash, assignment_sent_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (demanda_id) DO UPDATE SET
       assignment_hash = EXCLUDED.assignment_hash,
       assignment_sent_at = NOW(),
       updated_at = NOW()`,
    [id, assignmentHash]
  );
}

export async function reminderAlreadySent(demandaId: string, reminderKey: string): Promise<boolean> {
  const record = await getRecord(demandaId);
  return !!(record && record.last_reminder_key === reminderKey && record.last_reminder_sent_at);
}

export async function markReminderSent(demandaId: string, reminderKey: string): Promise<void> {
  const id = normalizeId(demandaId);
  if (!id) return;

  await query(
    `INSERT INTO demanda_notifications (demanda_id, last_reminder_key, last_reminder_sent_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (demanda_id) DO UPDATE SET
       last_reminder_key = EXCLUDED.last_reminder_key,
       last_reminder_sent_at = NOW(),
       updated_at = NOW()`,
    [id, reminderKey]
  );
}
