const db = require('../db/pool');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function splitEmailRecipients(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeEmail(item)).filter(Boolean);
  }

  if (value === undefined || value === null) return [];

  return String(value)
    .split(/[;,|\n]/g)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function listarEmailsAdminsAtivos() {
  const result = await db.query(
    `SELECT email
       FROM users
      WHERE role IN ('admin', 'root')
        AND ativo = TRUE`
  );

  return result.rows
    .map((row) => normalizeEmail(row.email))
    .filter((email) => email && isValidEmail(email));
}

async function listarEmailsAtivos() {
  const result = await db.query(
    `SELECT email
       FROM users
      WHERE ativo = TRUE`
  );

  return result.rows
    .map((row) => normalizeEmail(row.email))
    .filter((email) => email && isValidEmail(email));
}

async function listarDestinatariosAdmins() {
  const emails = await listarEmailsAdminsAtivos();
  const extras = [
    ...splitEmailRecipients(process.env.ADMIN_NOTIFICATION_EMAILS),
    normalizeEmail(process.env.ROOT_LOGIN),
  ];

  // Se não houver admins válidos cadastrados, usa o remetente SMTP como fallback.
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

async function listarDestinatariosRelatorioSemanal() {
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

module.exports = {
  isValidEmail,
  listarDestinatariosAdmins,
  listarDestinatariosRelatorioSemanal,
  normalizeEmail,
  splitEmailRecipients,
};
