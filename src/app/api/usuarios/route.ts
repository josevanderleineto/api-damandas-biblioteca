import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { normalize, normalizeEmail, isValidEmail } from '@/lib/utils';
import { getUserFromRequest, sanitizeUser, findUserByEmail } from '@/lib/auth';
import * as mailer from '@/lib/mailer';
import * as adminRecipientsService from '@/lib/services/adminRecipientsService';

async function notificarAdminsUsuario(titulo: string, contexto: string, usuario: any, autor: any) {
  if (!mailer.isEnabled()) {
    return { sent: false, reason: mailer.getDisabledReason() };
  }

  const destinatarios = await adminRecipientsService.listarDestinatariosAdmins();
  if (!destinatarios.length) {
    return { sent: false, reason: 'Nenhum admin ativo com e-mail válido.' };
  }

  return mailer.enviarAvisoAdminsUsuario(destinatarios, {
    titulo,
    contexto,
    usuario,
    autor,
  });
}

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const result = await query(
      `SELECT id, nome, email, matricula, role, ativo, created_at
         FROM users
        ORDER BY created_at DESC`
    );

    return NextResponse.json({ ok: true, total: result.rows.length, dados: result.rows.map(sanitizeUser) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const nome = normalize(body?.nome);
    const email = normalizeEmail(body?.email);
    const matriculaRaw = body?.matricula;
    const matricula = typeof matriculaRaw === 'string' ? matriculaRaw : String(matriculaRaw || '');
    const senha = String(body?.senha || '');
    const role = normalize(body?.role || 'colaborador').toLowerCase();

    if (!nome || !email || !senha || !matricula || !matricula.trim()) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: nome, email, matricula, senha.' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, erro: 'Email inválido.' }, { status: 400 });
    }

    if (senha.length < 6) {
      return NextResponse.json({ ok: false, erro: 'Senha deve ter ao menos 6 caracteres.' }, { status: 400 });
    }

    if (!['admin', 'colaborador'].includes(role)) {
      return NextResponse.json({ ok: false, erro: 'Role inválida. Use admin ou colaborador.' }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ ok: false, erro: 'Já existe usuário com este email.' }, { status: 409 });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await query(
      `INSERT INTO users (nome, email, matricula, senha_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, matricula, role, ativo, created_at`,
      [nome, email, matricula, senhaHash, role]
    );

    let notificacao: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacao = await mailer.enviarBoasVindasUsuario({ nome, email, senha, role });
    } catch (error: any) {
      notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
    }

    let notificacaoAdmins: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacaoAdmins = await notificarAdminsUsuario(
        'Novo usuário criado',
        `Um novo usuário (${role}) foi criado por ${user?.nome || 'Sistema'}.`,
        result.rows[0],
        user
      );
    } catch (error: any) {
      notificacaoAdmins = { sent: false, reason: `Falha ao notificar admins: ${error.message}` };
    }

    return NextResponse.json({ ok: true, user: sanitizeUser(result.rows[0]), notificacao, notificacaoAdmins }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
