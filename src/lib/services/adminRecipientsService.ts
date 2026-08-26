import { query } from '../db';
import { normalizeEmail, isValidEmail } from '../utils';

export function splitEmailRecipients(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeEmail(item)).filter(Boolean);
  }

  if (value === undefined || value === null) return [];

  return String(value)
    .split(/[;,|\n]/g)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

export async function listarEmailsAdminsAtivos(): Promise<string[]> {
  const result = await query(
    `SELECT email
       FROM users
      WHERE role IN ('admin', 'root')
        AND ativo = TRUE`
  );

  return result.rows
    .map((row) => normalizeEmail(row.email))
    .filter((email) => email && isValidEmail(email));
}

export async function listarEmailsAtivos(): Promise<string[]> {
  const result = await query(
    `SELECT email
       FROM users
      WHERE ativo = TRUE`
  );

  return result.rows
    .map((row) => normalizeEmail(row.email))
    .filter((email) => email && isValidEmail(email));
}

export async function listarDestinatariosAdmins(): Promise<string[]> {
  const emails = await listarEmailsAdminsAtivos();
  const extras = [
    ...splitEmailRecipients(process.env.ADMIN_NOTIFICATION_EMAILS),
    normalizeEmail(process.env.ROOT_LOGIN),
  ];

  if (emails.length === 0) {
    extras.push(normalizeEmail(process.env.SMTP_USER));
  }

  extras.forEach((email) => {
    if (email && isValidEmail(email) && !emails.includes(email)) {
      emails.push(email);
    }
  });

  return emails;
}

export async function listarDestinatariosRelatorioSemanal(): Promise<string[]> {
  const emails = await listarEmailsAtivos();
  const extras = [
    ...splitEmailRecipients(process.env.WEEKLY_REPORT_EMAILS),
    normalizeEmail(process.env.ROOT_LOGIN),
  ];

  if (emails.length === 0) {
    extras.push(normalizeEmail(process.env.SMTP_USER));
  }

  extras.forEach((email) => {
    if (email && isValidEmail(email) && !emails.includes(email)) {
      emails.push(email);
    }
  });

  return emails;
}
