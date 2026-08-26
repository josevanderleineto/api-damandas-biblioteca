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

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const userId = normalize(params?.id);
    const body = await req.json().catch(() => ({}));
    const nome = normalize(body?.nome);
    const email = normalizeEmail(body?.email);
    const matriculaRaw = body?.matricula;
    const matricula = typeof matriculaRaw === 'string' ? matriculaRaw : String(matriculaRaw || '');
    const role = normalize(body?.role || 'colaborador').toLowerCase();
    const senha = String(body?.senha || '').trim();

    if (!userId) {
      return NextResponse.json({ ok: false, erro: 'ID de usuário obrigatório.' }, { status: 400 });
    }

    if (!nome || !email || !matricula || !matricula.trim()) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: nome, email, matricula.' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, erro: 'Email inválido.' }, { status: 400 });
    }

    if (!['admin', 'colaborador'].includes(role)) {
      return NextResponse.json({ ok: false, erro: 'Role inválida. Use admin ou colaborador.' }, { status: 400 });
    }

    if (senha && senha.length < 6) {
      return NextResponse.json({ ok: false, erro: 'Senha deve ter ao menos 6 caracteres.' }, { status: 400 });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail && existingEmail.id !== userId) {
      return NextResponse.json({ ok: false, erro: 'Já existe usuário com este email.' }, { status: 409 });
    }

    const senhaHash = senha ? await bcrypt.hash(senha, 10) : null;
    const queryParams: any[] = [nome, email, matricula, role];
    let senhaSnippet = '';

    if (senhaHash) {
      queryParams.push(senhaHash);
      senhaSnippet = `, senha_hash = $${queryParams.length}`;
    }

    queryParams.push(userId);
    const idPlaceholder = queryParams.length;

    const result = await query(
      `UPDATE users
          SET nome = $1,
              email = $2,
              matricula = $3,
              role = $4${senhaSnippet},
              updated_at = NOW()
        WHERE id = $${idPlaceholder}
      RETURNING id, nome, email, matricula, role, ativo, created_at`,
      queryParams
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado.' }, { status: 404 });
    }

    let notificacaoAdmins: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacaoAdmins = await notificarAdminsUsuario(
        'Dados de usuário atualizados',
        `O usuário ${result.rows[0].nome} foi atualizado por ${user?.nome || 'Sistema'}.`,
        result.rows[0],
        user
      );
    } catch (error: any) {
      notificacaoAdmins = { sent: false, reason: `Falha ao notificar admins: ${error.message}` };
    }

    return NextResponse.json({ ok: true, user: sanitizeUser(result.rows[0]), notificacaoAdmins });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const userId = normalize(params?.id);
    if (!userId) return NextResponse.json({ ok: false, erro: 'ID obrigatório.' }, { status: 400 });

    const usuario = await query('SELECT id, nome, email, matricula, role, ativo FROM users WHERE id = $1', [userId]);

    if (usuario.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado.' }, { status: 404 });
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);

    let notificacaoAdmins: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacaoAdmins = await notificarAdminsUsuario(
        'Usuário removido',
        `O usuário ${usuario.rows[0].nome || usuario.rows[0].email || ''} foi removido por ${user?.nome || 'Sistema'}.`,
        { ...usuario.rows[0], ativo: false },
        user
      );
    } catch (error: any) {
      notificacaoAdmins = { sent: false, reason: `Falha ao notificar admins: ${error.message}` };
    }

    return NextResponse.json({ ok: true, removido: userId, notificacaoAdmins });
  } catch (error: any) {
    if (error.message && error.message.includes('prazo_requests')) {
      return NextResponse.json({ ok: false, erro: 'Usuário possui solicitações vinculadas. Desative-o em vez de excluir.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
