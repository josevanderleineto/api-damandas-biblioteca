const fs = require('fs');

let nodemailer = null;

try {
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
  return String(value || '').replace(/\s+/g, '');
}

function normalizeEmailFrom(value) {
  // Remove aspas externas para evitar parse estranho em alguns provedores.
  return normalize(value).replace(/^"|"$/g, '');
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

function splitEmailRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (to === undefined || to === null) return [];

  // Suporta formatos comuns: "a@x.com,b@y.com" | "a@x.com; b@y.com" | "a@x.com | b@y.com"
  return String(to)
    .split(/[;,|\n]/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function buildLembreteMeta(diasRestantes) {
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

  return { contexto, badgeLabel, badgeColor };
}

function getAppUrl() {
  return normalize(process.env.APP_URL || 'http://localhost:3000');
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
    attachments.push({ filename: 'logo-primary.png', path: primaryPath, cid: 'logo_primary' });
  } else if (primaryUrl) {
    primarySrc = primaryUrl;
  }

  if (secondaryPath && fs.existsSync(secondaryPath)) {
    secondarySrc = 'cid:logo_secondary';
    attachments.push({ filename: 'logo-secondary.png', path: secondaryPath, cid: 'logo_secondary' });
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
  </div>`;

  return { html, attachments };
}

async function testarConexaoSMTP() {
  if (!isEnabled()) return { ok: false, reason: getDisabledReason() };
  const transporter = getTransporter();
  await transporter.verify();
  return { ok: true };
}

async function sendEmail({ to, cc, bcc, subject, text, html, attachments = [] }) {
  if (!isEnabled()) return { sent: false, reason: getDisabledReason() };

  const recipients = splitEmailRecipients(to);
  const ccRecipients = splitEmailRecipients(cc);
  const bccRecipients = splitEmailRecipients(bcc);
  const validRecipients = recipients.filter((email) => isValidEmail(email));
  const validCcRecipients = ccRecipients.filter((email) => isValidEmail(email));
  const validBccRecipients = bccRecipients.filter((email) => isValidEmail(email));
  if (validRecipients.length === 0 && validCcRecipients.length === 0 && validBccRecipients.length === 0) {
    return { sent: false, reason: 'Email de destino invalido.' };
  }

  const transporter = getTransporter();
  const mailOptions = {
    from: normalizeEmailFrom(process.env.EMAIL_FROM),
    subject,
    text,
    html,
    attachments,
  };

  if (validRecipients.length) {
    mailOptions.to = validRecipients.join(',');
  }
  if (validCcRecipients.length) {
    mailOptions.cc = validCcRecipients.join(',');
  }
  if (validBccRecipients.length) {
    mailOptions.bcc = validBccRecipients.join(',');
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    sent: true,
    messageId: info.messageId || '',
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || '',
  };
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
  return sendEmail({ to: demanda.email, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarNovaDemandaAdmin(demanda, emailDestino) {
  const subject = `Cópia para admins - nova demanda (#${demanda.demanda})`;
  const text = `Uma nova demanda foi criada.\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Cópia para administradores',
    contextText: 'Uma nova demanda foi registrada e você recebe esta cópia por ser admin.',
    demanda,
    badgeLabel: 'NOVA DEMANDA',
    badgeColor: '#0f1b6d',
  });
  return sendEmail({ to: emailDestino, subject, text, html: payload.html, attachments: payload.attachments });
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
  return sendEmail({ to: demanda.email, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarAtualizacaoStatusAdmin(demanda, emailDestino) {
  const subject = `Cópia para admins - status atualizado (#${demanda.demanda})`;
  const text = `O status da demanda mudou.\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Status atualizado',
    contextText: 'Esta cópia foi enviada para administradores cadastrados.',
    demanda,
    badgeLabel: 'STATUS',
    badgeColor: '#005cbb',
  });
  return sendEmail({ to: emailDestino, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarMovimentacaoDemandaAdmin(
  demanda,
  emailDestino,
  {
    subjectPrefix = 'movimentação da demanda',
    headline = 'Movimentação da demanda',
    contextText = 'A demanda recebeu uma atualização e esta cópia foi enviada para administradores.',
    badgeLabel = 'MOVIMENTAÇÃO',
    badgeColor = '#005cbb',
  } = {}
) {
  const subject = `Cópia para admins - ${subjectPrefix} (#${demanda.demanda})`;
  const text = `${contextText}\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline,
    contextText,
    demanda,
    badgeLabel,
    badgeColor,
  });

  return sendEmail({ to: emailDestino, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarLembretePrazo(demanda, diasRestantes) {
  const { contexto, badgeLabel, badgeColor } = buildLembreteMeta(diasRestantes);

  const subject = `Lembrete de prazo (#${demanda.demanda})`;
  const text = `${contexto}\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({ headline: 'Lembrete de prazo', contextText: contexto, demanda, badgeLabel, badgeColor });
  return sendEmail({ to: demanda.email, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarLembretePrazoAdmin(demanda, diasRestantes, emailDestino) {
  const { contexto } = buildLembreteMeta(diasRestantes);

  const subject = `Cópia para admins - lembrete de prazo (#${demanda.demanda})`;
  const text = `Cópia do lembrete enviado ao responsável.\n\n${contexto}\n\n${buildTextDemanda(demanda)}`;
  const payload = buildHtmlEmail({
    headline: 'Cópia de lembrete de prazo',
    contextText: `${contexto} (cópia para administradores).`,
    demanda,
    badgeLabel: 'LEMBRETE (CÓPIA)',
    badgeColor: '#0f1b6d',
  });

  return sendEmail({ to: emailDestino, subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarBoasVindasUsuario({ nome, email, senha, role }) {
  if (!isEnabled()) return { sent: false, reason: getDisabledReason() };

  const appUrl = getAppUrl();
  const headline = 'Sua conta foi criada';
  const contextText = 'Use as credenciais abaixo para acessar o Sistema de Demandas.';

  const html = `
  <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
      <div style="padding:22px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
        <div style="font-size:22px; font-weight:700; line-height:1.25;">Conta criada no Sistema de Demandas</div>
        <div style="font-size:13px; opacity:0.9; margin-top:6px;">Biblioteca UniFTC/UNEX</div>
      </div>
      <div style="padding:24px; color:#10213d;">
        <h2 style="margin:0 0 8px; font-size:20px; color:#0f1b6d;">Olá, ${escapeHtml(nome)}!</h2>
        <p style="margin:0 0 14px; color:#405270; font-size:14px;">${escapeHtml(contextText)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden;">
          <tr><td style="padding:10px 12px; background:#f8fbff; width:180px; font-weight:700;">Login</td><td style="padding:10px 12px;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Senha provisória</td><td style="padding:10px 12px;">${escapeHtml(senha)}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Perfil</td><td style="padding:10px 12px;">${escapeHtml(role)}</td></tr>
        </table>
        <ol style="margin:18px 0 0; padding-left:20px; color:#405270; font-size:14px; line-height:1.5;">
          <li>Acesse o sistema pelo endereço configurado (ex.: ${escapeHtml(appUrl)}).</li>
          <li>Faça login com o e-mail e a senha provisória acima.</li>
          <li>Altere a senha no primeiro acesso.</li>
        </ol>
        <p style="margin:16px 0 0; font-size:12px; color:#6d7f9b;">Se você não reconhece esta conta, contate um administrador.</p>
      </div>
    </div>
  </div>`;

  const text = `Sua conta foi criada no Sistema de Demandas.\n\nLogin: ${email}\nSenha provisória: ${senha}\nPerfil: ${role}\n\n1) Acesse o sistema (ex.: ${appUrl}).\n2) Faça login com o e-mail e a senha provisória.\n3) Troque a senha no primeiro acesso.`;

  return sendEmail({ to: email, subject: 'Bem-vindo(a) ao Sistema de Demandas', text, html });
}

function buildHtmlAdminUserEvent({ titulo, contexto, usuario, autor }) {
  const safeUser = {
    nome: escapeHtml(usuario.nome || ''),
    email: escapeHtml(usuario.email || ''),
    matricula: escapeHtml(usuario.matricula || ''),
    role: escapeHtml(usuario.role || ''),
    ativo: typeof usuario.ativo === 'boolean' ? (usuario.ativo ? 'Ativo' : 'Inativo') : '',
  };
  const safeAutor = autor
    ? escapeHtml(autor.nome || autor.email || autor.matricula || autor.id || '')
    : 'Sistema';

  const { logosHtml, attachments } = getLogoBlocksAndAttachments();

  const html = `
  <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
      <div style="padding:22px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
        ${logosHtml}
        <div style="font-size:20px; font-weight:700; line-height:1.25;">${escapeHtml(titulo)}</div>
        <div style="font-size:13px; opacity:0.9; margin-top:6px;">Sistema de Demandas</div>
      </div>
      <div style="padding:24px; color:#10213d;">
        <p style="margin:0 0 12px; color:#405270; font-size:14px;">${escapeHtml(contexto)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden;">
          <tr><td style="padding:10px 12px; background:#f8fbff; width:180px; font-weight:700;">Nome</td><td style="padding:10px 12px;">${safeUser.nome}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">E-mail</td><td style="padding:10px 12px;">${safeUser.email}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Matrícula</td><td style="padding:10px 12px;">${safeUser.matricula}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Perfil</td><td style="padding:10px 12px;">${safeUser.role}</td></tr>
          <tr><td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Status</td><td style="padding:10px 12px;">${safeUser.ativo}</td></tr>
        </table>
        <p style="margin:14px 0 0; font-size:13px; color:#6d7f9b;">Ação executada por: <strong>${safeAutor}</strong>.</p>
      </div>
    </div>
  </div>`;

  return { html, attachments };
}

async function enviarAvisoAdminsUsuario(destinatarios, { titulo, contexto, usuario, autor }) {
  const toList = splitEmailRecipients(destinatarios).filter((email) => isValidEmail(email));
  if (!isEnabled()) return { sent: false, reason: getDisabledReason() };
  if (!toList.length) return { sent: false, reason: 'Nenhum admin ativo com e-mail válido.' };

  const subject = `[Usuários] ${titulo} - ${usuario.nome || usuario.email || ''}`;
  const textoAutor = autor ? autor.nome || autor.email || autor.matricula || autor.id || 'não informado' : 'Sistema';
  const text = [
    titulo,
    contexto,
    '',
    `Nome: ${usuario.nome || ''}`,
    `Email: ${usuario.email || ''}`,
    `Matrícula: ${usuario.matricula || ''}`,
    `Perfil: ${usuario.role || ''}`,
    typeof usuario.ativo === 'boolean' ? `Status: ${usuario.ativo ? 'Ativo' : 'Inativo'}` : '',
    `Ação executada por: ${textoAutor}`,
  ].filter(Boolean).join('\n');

  const payload = buildHtmlAdminUserEvent({ titulo, contexto, usuario, autor });
  return sendEmail({ to: toList.join(','), subject, text, html: payload.html, attachments: payload.attachments });
}

async function enviarResetSenha({ email, nome, token, expiresAt, resetUrlBase }) {
  if (!isEnabled()) return { sent: false, reason: getDisabledReason() };

  const safeNome = escapeHtml(nome || 'Usuário');
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleString('pt-BR') : '1 hora';

  const link = resetUrlBase
    ? `${resetUrlBase}${resetUrlBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : '';

  const { logosHtml, attachments } = getLogoBlocksAndAttachments();

  const html = `
  <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
      <div style="padding:22px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
        ${logosHtml}
        <div style="font-size:22px; font-weight:700; line-height:1.25;">Redefinição de senha</div>
        <div style="font-size:13px; opacity:0.9; margin-top:6px;">Sistema de Demandas</div>
      </div>
      <div style="padding:24px; color:#10213d;">
        <p style="margin:0 0 12px; color:#405270; font-size:14px;">Olá, ${safeNome}!</p>
        <p style="margin:0 0 14px; color:#405270; font-size:14px;">Recebemos um pedido para redefinir sua senha. Use o código abaixo ou o botão para definir uma nova senha.</p>
        <div style="margin:16px 0; padding:14px 16px; background:#f8fbff; border:1px dashed #d6e3f5; border-radius:10px; font-size:18px; font-weight:700; letter-spacing:0.6px; text-align:center; color:#0f1b6d;">
          ${escapeHtml(token)}
        </div>
        ${link ? `<div style="text-align:center; margin:12px 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block; padding:12px 20px; background:#0f1b6d; color:#fff; border-radius:10px; text-decoration:none; font-weight:700;">Redefinir senha</a></div>` : ''}
        <p style="margin:16px 0 0; font-size:12px; color:#6d7f9b;">O código expira em ${escapeHtml(expiresLabel)}. Se você não solicitou, ignore este e-mail.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Olá, ${nome || 'usuário'}!`,
    'Recebemos um pedido para redefinir sua senha.',
    `Código: ${token}`,
    link ? `Link direto: ${link}` : '',
    expiresAt ? `Válido até: ${expiresLabel}` : 'Válido por 1 hora.',
    'Se você não solicitou, ignore este e-mail.',
  ]
    .filter(Boolean)
    .join('\n');

  return sendEmail({ to: email, subject: 'Redefinição de senha - Sistema de Demandas', text, html, attachments });
}

function formatWeeklyDelta(delta) {
  if (!Number.isFinite(delta)) return 'sem base anterior';
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : String(delta);
}

function buildWeeklyMetricRows(metrics = []) {
  if (!metrics.length) {
    return '<tr><td colspan="3" style="padding:12px; color:#6d7f9b;">Sem dados para exibir.</td></tr>';
  }

  return metrics.map((metric) => {
    const deltaText = formatWeeklyDelta(metric.delta);
    const deltaColor = !Number.isFinite(metric.delta) || metric.delta === 0
      ? '#6d7f9b'
      : metric.delta > 0
        ? '#d92d20'
        : '#027a48';

    return `
      <tr>
        <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:54%;">${escapeHtml(metric.label)}</td>
        <td style="padding:10px 12px; text-align:right; font-weight:700;">${escapeHtml(String(metric.value ?? 0))}</td>
        <td style="padding:10px 12px; text-align:right; color:${deltaColor}; font-weight:700;">${escapeHtml(deltaText)}</td>
      </tr>`;
  }).join('');
}

function buildWeeklyDemandRows(items, emptyMessage, detailBuilder) {
  if (!items.length) {
    return `<tr><td colspan="4" style="padding:12px; color:#6d7f9b;">${escapeHtml(emptyMessage)}</td></tr>`;
  }

  return items.map((item) => {
    const detail = typeof detailBuilder === 'function' ? detailBuilder(item) : '';

    return `
      <tr>
        <td style="padding:10px 12px; background:#f8fbff; font-weight:700;">#${escapeHtml(item.demanda)}</td>
        <td style="padding:10px 12px;">${escapeHtml(item.responsavel || '-')}</td>
        <td style="padding:10px 12px;">${escapeHtml(item.prazo || '-')}</td>
        <td style="padding:10px 12px;">${escapeHtml(detail || '-')}</td>
      </tr>`;
  }).join('');
}

function buildWeeklyReportHtml(report) {
  const { logosHtml, attachments } = getLogoBlocksAndAttachments();

  const highlightsHtml = (report.highlights || []).length
    ? `<ul style="margin:0; padding-left:20px; color:#405270; font-size:14px; line-height:1.55;">${(report.highlights || [])
      .map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`)
      .join('')}</ul>`
    : '<p style="margin:0; color:#6d7f9b; font-size:14px;">Sem destaques para o periodo.</p>';

  const html = `
  <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
    <div style="max-width:760px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
      <div style="padding:24px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
        ${logosHtml}
        <div style="font-size:22px; font-weight:700; line-height:1.25;">Resumo semanal das demandas</div>
        <div style="font-size:13px; opacity:0.9; margin-top:6px;">Biblioteca UniFTC/UNEX</div>
      </div>
      <div style="padding:24px; color:#10213d;">
        <div style="display:inline-block; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; background:#0f1b6d;">RELATÓRIO SEMANAL</div>
        <h2 style="margin:14px 0 8px; font-size:20px; color:#0f1b6d;">Evolução das demandas</h2>
        <p style="margin:0 0 18px; color:#405270; font-size:14px;">Período analisado: <strong>${escapeHtml(report.periodLabel)}</strong>. Gerado em ${escapeHtml(report.generatedAt)}.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden; margin-bottom:20px;">
          <tr>
            <td style="padding:10px 12px; background:#eef4ff; font-weight:700; width:54%;">Indicador</td>
            <td style="padding:10px 12px; background:#eef4ff; font-weight:700; text-align:right;">Atual</td>
            <td style="padding:10px 12px; background:#eef4ff; font-weight:700; text-align:right;">Variação</td>
          </tr>
          ${buildWeeklyMetricRows(report.metrics || [])}
        </table>

        <h3 style="margin:0 0 10px; font-size:16px; color:#0f1b6d;">Destaques</h3>
        ${highlightsHtml}

        <h3 style="margin:20px 0 10px; font-size:16px; color:#0f1b6d;">Demandas atrasadas</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden; margin-bottom:18px;">
          <tr>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:18%;">Demanda</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:28%;">Responsavel</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:18%;">Prazo</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Situacao</td>
          </tr>
          ${buildWeeklyDemandRows(
            report.overdueItems || [],
            'Nenhuma demanda atrasada no momento.',
            (item) => `Atraso de ${item.diasAtraso} dia(s)`
          )}
        </table>

        <h3 style="margin:0 0 10px; font-size:16px; color:#0f1b6d;">Demandas vencendo nos proximos 7 dias</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid #edf1f7; border-radius:10px; overflow:hidden;">
          <tr>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:18%;">Demanda</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:28%;">Responsavel</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700; width:18%;">Prazo</td>
            <td style="padding:10px 12px; background:#f8fbff; font-weight:700;">Situacao</td>
          </tr>
          ${buildWeeklyDemandRows(
            report.dueSoonItems || [],
            'Nenhuma demanda vencendo nos proximos 7 dias.',
            (item) => (item.diasRestantes === 0 ? 'Vence hoje' : `Faltam ${item.diasRestantes} dia(s)`)
          )}
        </table>

        <p style="margin:20px 0 0; font-size:12px; color:#6d7f9b;">Mensagem automatica do Sistema de Demandas da Biblioteca.</p>
      </div>
    </div>
  </div>`;

  return { html, attachments };
}

function buildWeeklyReportText(report) {
  const lines = [
    'Resumo semanal das demandas',
    `Periodo analisado: ${report.periodLabel}`,
    `Gerado em: ${report.generatedAt}`,
    '',
    'Indicadores:',
    ...(report.metrics || []).map((metric) => {
      const deltaText = formatWeeklyDelta(metric.delta);
      return `- ${metric.label}: ${metric.value}${Number.isFinite(metric.delta) ? ` (${deltaText})` : ' (sem base anterior)'}`;
    }),
    '',
    'Destaques:',
    ...((report.highlights || []).length ? report.highlights.map((item) => `- ${item}`) : ['- Sem destaques para o periodo.']),
    '',
    'Demandas atrasadas:',
    ...((report.overdueItems || []).length
      ? report.overdueItems.map((item) => `- #${item.demanda} | ${item.responsavel || '-'} | prazo ${item.prazo || '-'} | atraso de ${item.diasAtraso} dia(s)`)
      : ['- Nenhuma demanda atrasada no momento.']),
    '',
    'Demandas vencendo nos proximos 7 dias:',
    ...((report.dueSoonItems || []).length
      ? report.dueSoonItems.map((item) => `- #${item.demanda} | ${item.responsavel || '-'} | prazo ${item.prazo || '-'} | ${item.diasRestantes === 0 ? 'vence hoje' : `faltam ${item.diasRestantes} dia(s)`}`)
      : ['- Nenhuma demanda vencendo nos proximos 7 dias.']),
    '',
    'Mensagem automatica do Sistema de Demandas da Biblioteca.',
  ];

  return lines.join('\n');
}

async function enviarResumoSemanalDemandas({ destinatarios, report }) {
  if (!isEnabled()) return { sent: false, reason: getDisabledReason() };

  const recipients = splitEmailRecipients(destinatarios).filter((email) => isValidEmail(email));
  const uniqueRecipients = Array.from(new Set(recipients));
  if (uniqueRecipients.length === 0) {
    return { sent: false, reason: 'Nenhum destinatario valido.' };
  }

  const [to, ...bcc] = uniqueRecipients;
  const subject = `Resumo semanal das demandas (${report.periodLabel})`;
  const text = buildWeeklyReportText(report);
  const payload = buildWeeklyReportHtml(report);

  return sendEmail({
    to,
    bcc,
    subject,
    text,
    html: payload.html,
    attachments: payload.attachments,
  });
}

async function enviarTesteDireto(emailDestino) {
  const now = new Date().toLocaleString('pt-BR');
  const subject = 'Teste de envio - Sistema de Demandas';
  const text = `Teste de envio executado em ${now}.`;
  const html = `<div style="font-family:Arial,sans-serif"><h2>Teste de envio</h2><p>Envio executado em ${escapeHtml(now)}.</p></div>`;
  return sendEmail({ to: emailDestino, subject, text, html });
}

module.exports = {
  isEnabled,
  getDisabledReason,
  testarConexaoSMTP,
  enviarNovaDemanda,
  enviarNovaDemandaAdmin,
  enviarAtualizacaoDemanda,
  enviarAtualizacaoStatusAdmin,
  enviarMovimentacaoDemandaAdmin,
  enviarLembretePrazo,
  enviarLembretePrazoAdmin,
  enviarBoasVindasUsuario,
  enviarResetSenha,
  enviarAvisoAdminsUsuario,
  enviarResumoSemanalDemandas,
  enviarTesteDireto,
};
