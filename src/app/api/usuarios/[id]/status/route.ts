import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalize } from '@/lib/utils';
import { getUserFromRequest, sanitizeUser } from '@/lib/auth';
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const userId = normalize(params?.id);
    const body = await req.json().catch(() => ({}));
    const ativo = !!body?.ativo;

    if (!userId) {
      return NextResponse.json({ ok: false, erro: 'ID de usuário obrigatório.' }, { status: 400 });
    }

    const result = await query(
      `UPDATE users
          SET ativo = $1,
              updated_at = NOW()
        WHERE id = $2
      RETURNING id, nome, email, matricula, role, ativo, created_at`,
      [ativo, userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado.' }, { status: 404 });
    }

    let notificacaoAdmins: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacaoAdmins = await notificarAdminsUsuario(
        `Status de usuário alterado (${ativo ? 'ativado' : 'desativado'})`,
        `O status do usuário ${result.rows[0].nome} foi alterado por ${user?.nome || 'Sistema'}.`,
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
