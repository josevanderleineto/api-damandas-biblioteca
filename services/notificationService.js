const fs = require('fs');

let nodemailer = null;

try {
  // Dependência opcional: se não estiver instalada, API continua funcionando sem envio.
  // Para ativar envio: npm i nodemailer
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch (error) {
  nodemailer = null;
}

function normalize(value) {
  return String(value || '').trim();
}

function normalizeSmtpUser(value) {
  return normalize(value).replace(/^"|"$/g, '');
}

function normalizeSmtpPass(value) {
  // Senha de app do Google costuma aparecer em blocos com espaços.
  return String(value || '').replace(/\s+/g, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isEnabled() {
  return !!(
    nodemailer
    && process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && process.env.EMAIL_FROM
  );
}

function getDisabledReason() {
  if (!nodemailer) return 'Dependência nodemailer não instalada.';
  const missing = [];

  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_PORT) missing.push('SMTP_PORT');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
  if (!process.env.EMAIL_FROM) missing.push('EMAIL_FROM');

  return missing.length > 0 ? `Variáveis ausentes: ${missing.join(', ')}` : 'Notificação desativada.';
}

function getTransporter() {
  return nodemailer.createTransport({
    host: normalize(process.env.SMTP_HOST),
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: normalizeSmtpUser(process.env.SMTP_USER),
      pass: normalizeSmtpPass(process.env.SMTP_PASS),
    },
  });
}

function getLogoBlocksAndAttachments() {
  const attachments = [];
  let logosHtml = '';

  const primaryUrl = normalize(process.env.EMAIL_LOGO_PRIMARY_URL);
  const secondaryUrl = normalize(process.env.EMAIL_LOGO_SECONDARY_URL);
  const primaryPath = normalize(process.env.EMAIL_LOGO_PRIMARY_PATH);
  const secondaryPath = normalize(process.env.EMAIL_LOGO_SECONDARY_PATH);

  let primarySrc = '';
  let secondarySrc = '';

  if (primaryPath && fs.existsSync(primaryPath)) {
    primarySrc = 'cid:logo_primary';
    attachments.push({
      filename: 'logo-primary.png',
      path: primaryPath,
      cid: 'logo_primary',
    });
  } else if (primaryUrl) {
    primarySrc = primaryUrl;
  }

  if (secondaryPath && fs.existsSync(secondaryPath)) {
    secondarySrc = 'cid:logo_secondary';
    attachments.push({
      filename: 'logo-secondary.png',
      path: secondaryPath,
      cid: 'logo_secondary',
    });
  } else if (secondaryUrl) {
    secondarySrc = secondaryUrl;
  }

  if (primarySrc || secondarySrc) {
    logosHtml = `
      <div style="display:flex; gap:12px; align-items:center; justify-content:center; margin-bottom:10px;">
        ${primarySrc ? `<img src="${escapeHtml(primarySrc)}" alt="Sistema Biblioteca" style="height:52px; max-width:240px; object-fit:contain;">` : ''}
        ${secondarySrc ? `<img src="${escapeHtml(secondarySrc)}" alt="UniFTC/UNEX" style="height:42px; max-width:200px; object-fit:contain;">` : ''}
      </div>
    `;
  }

  return { logosHtml, attachments };
}

function buildHtmlEmail({ headline, contextText, demanda, badgeLabel, badgeColor }) {
  const safe = {
    demanda: escapeHtml(demanda.demanda),
    responsavel: escapeHtml(demanda.responsavel),
    descricao: escapeHtml(demanda.descricao),
    matricula: escapeHtml(demanda.matricula),
    email: escapeHtml(demanda.email),
    dataCriacao: escapeHtml(demanda.dataCriacao),
    prazo: escapeHtml(demanda.prazo),
    status: escapeHtml(demanda.status),
    prioridade: escapeHtml(demanda.prioridade),
  };

  const { logosHtml, attachments } = getLogoBlocksAndAttachments();

  const html = `
  <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:680px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
      <div style="padding:24px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
        ${logosHtml}
        <div style="font-size:22px; font-weight:700; line-height:1.25;">Sistema de Biblioteca UniFTC/UNEX</div>
        <div style="font-size:13px; opacity:0.9; margin-top:6px;">Gestão de Demandas</div>
      </div>

      <div style="padding:24px; color:#10213d;">
        <div style="display:inline-block; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; background:${escapeHtml(badgeColor)};">
          ${escapeHtml(badgeLabel)}
        </div>

        <h2 style="margin:14px 0 8px; font-size:20px; color:#0f1b6d;">${escapeHtml(headline)}</h2>
        <p style="margin:0 0 18px; color:#405270; font-size:14px;">${escapeHtml(contextText)}</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden;">
          <tr><td style="padding:10px 12px; background:#f8fbff; width:180px; font-weight:700;">Demanda</td><td style="padding:10px 12px;">#${safe.demanda}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Responsável</td><td style="padding:10px 12px;">${safe.responsavel}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Descrição</td><td style="padding:10px 12px;">${safe.descricao}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Matrícula</td><td style="padding:10px 12px;">${safe.matricula}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">E-mail</td><td style="padding:10px 12px;">${safe.email}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Data de criação</td><td style="padding:10px 12px;">${safe.dataCriacao}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Prazo</td><td style="padding:10px 12px;">${safe.prazo}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Status</td><td style="padding:10px 12px;">${safe.status}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Prioridade</td><td style="padding:10px 12px;">${safe.prioridade}</td></tr>
        </table>

        <p style="margin:20px 0 0; font-size:12px; color:#6d7f9b;">Mensagem automática do Sistema de Biblioteca UniFTC/UNEX.</p>
      </div>
    </div>
  </div>
  `;

  return { html, attachments };
}

async function testarConexaoSMTP() {
  if (!isEnabled()) {
    return { ok: false, reason: getDisabledReason() };
  }

  const transporter = getTransporter();
  await transporter.verify();
  return { ok: true };
}

async function sendEmail({ to, subject, text, html, attachments = [] }) {
  if (!isEnabled()) {
    return { sent: false, reason: getDisabledReason() };
  }

  const target = normalize(to);
  if (!isValidEmail(target)) {
    return { sent: false, reason: 'Email de destino inválido.' };
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: target,
    subject,
    text,
    html,
    attachments,
  });

  return { sent: true };
}

function buildTextDemanda(demanda) {
  return [
    `Demanda: ${demanda.demanda || ''}`,
    `Responsável: ${demanda.responsavel || ''}`,
    `Descrição: ${demanda.descricao || ''}`,
    `Prazo: ${demanda.prazo || ''}`,
    `Status: ${demanda.status || ''}`,
    `Prioridade: ${demanda.prioridade || ''}`,
  ].join('\n');
}

async function enviarNovaDemanda(demanda) {
  const subject = `Nova demanda atribuída (#${demanda.demanda})`;
  const text = `Você recebeu uma nova demanda.\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Nova demanda atribuída',
    contextText: 'Uma nova atividade foi atribuída para você. Confira os detalhes abaixo.',
    demanda,
    badgeLabel: 'NOVA DEMANDA',
    badgeColor: '#00a7ff',
  });

  return sendEmail({
    to: demanda.email,
    subject,
    text,
    html: payload.html,
    attachments: payload.attachments,
  });
}

async function enviarAtualizacaoDemanda(demanda) {
  const subject = `Atualização da demanda (#${demanda.demanda})`;
  const text = `Sua demanda foi atualizada.\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Atualização de demanda',
    contextText: 'Os dados da sua demanda foram atualizados no sistema.',
    demanda,
    badgeLabel: 'ATUALIZAÇÃO',
    badgeColor: '#7f56d9',
  });

  return sendEmail({
    to: demanda.email,
    subject,
    text,
    html: payload.html,
    attachments: payload.attachments,
  });
}

async function enviarLembretePrazo(demanda, diasRestantes) {
  let contexto = '';
  let badgeLabel = 'LEMBRETE';
  let badgeColor = '#f79009';

  if (diasRestantes < 0) {
    contexto = `Atenção: a demanda está atrasada há ${Math.abs(diasRestantes)} dia(s).`;
    badgeLabel = 'ATRASADA';
    badgeColor = '#d92d20';
  } else if (diasRestantes === 0) {
    contexto = 'Atenção: o prazo da demanda vence hoje.';
    badgeLabel = 'VENCE HOJE';
    badgeColor = '#d92d20';
  } else {
    contexto = `Lembrete: o prazo da demanda vence em ${diasRestantes} dia(s).`;
    badgeLabel = 'PRAZO PRÓXIMO';
    badgeColor = '#f79009';
  }

  const subject = `Lembrete de prazo (#${demanda.demanda})`;
  const text = `${contexto}\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Lembrete de prazo',
    contextText: contexto,
    demanda,
    badgeLabel,
    badgeColor,
  });

  return sendEmail({
    to: demanda.email,
    subject,
    text,
    html: payload.html,
    attachments: payload.attachments,
  });
}

module.exports = {
  isEnabled,
  getDisabledReason,
  testarConexaoSMTP,
  enviarNovaDemanda,
  enviarAtualizacaoDemanda,
  enviarLembretePrazo,
};
