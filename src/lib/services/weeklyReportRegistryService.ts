import { query } from '../db';

function normalizeKey(value: any) {
  return String(value || '').trim();
}

let ensureTablePromise: Promise<void> | null = null;

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS weekly_demand_reports (
      report_key TEXT PRIMARY KEY,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      summary_json JSONB NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_weekly_demand_reports_sent_at ON weekly_demand_reports(sent_at)');
  await query('CREATE INDEX IF NOT EXISTS idx_weekly_demand_reports_period_end ON weekly_demand_reports(period_end)');
}

export function ensureReady() {
  if (!ensureTablePromise) {
    ensureTablePromise = ensureTable();
  }
  return ensureTablePromise;
}

export async function getReport(reportKey: string) {
  const key = normalizeKey(reportKey);
  if (!key) return null;

  await ensureReady();

  const result = await query(
    `SELECT report_key, period_start, period_end, summary_json, sent_at, created_at, updated_at
       FROM weekly_demand_reports
      WHERE report_key = $1`,
    [key]
  );

  return result.rows[0] || null;
}

export async function reportAlreadySent(reportKey: string): Promise<boolean> {
  const report = await getReport(reportKey);
  return !!(report && report.sent_at);
}

export async function getPreviousSentReport(reportKey: string) {
  const key = normalizeKey(reportKey);
  if (!key) return null;

  await ensureReady();

  const result = await query(
    `SELECT report_key, period_start, period_end, summary_json, sent_at, created_at, updated_at
       FROM weekly_demand_reports
      WHERE report_key < $1
        AND sent_at IS NOT NULL
      ORDER BY report_key DESC
      LIMIT 1`,
    [key]
  );

  return result.rows[0] || null;
}

export async function markReportSent({ reportKey, periodStart, periodEnd, summaryJson }: {
  reportKey: string;
  periodStart: string;
  periodEnd: string;
  summaryJson: any;
}) {
  const key = normalizeKey(reportKey);
  if (!key) return null;

  await ensureReady();

  const result = await query(
    `INSERT INTO weekly_demand_reports (
       report_key, period_start, period_end, summary_json, sent_at, updated_at
     ) VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
     ON CONFLICT (report_key) DO UPDATE SET
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       summary_json = EXCLUDED.summary_json,
       sent_at = NOW(),
       updated_at = NOW()
     RETURNING report_key, period_start, period_end, summary_json, sent_at, created_at, updated_at`,
    [key, periodStart, periodEnd, JSON.stringify(summaryJson)]
  );

  return result.rows[0] || null;
}
