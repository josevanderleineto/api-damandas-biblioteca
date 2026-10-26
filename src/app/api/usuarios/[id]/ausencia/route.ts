import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest, sanitizeUser } from '@/lib/auth';
import { parseDateFlexible, formatToDateIso, getDescricaoAusencia } from '@/lib/ausencia';
import * as mailer from '@/lib/mailer';
import * as adminRecipientsService from '@/lib/services/adminRecipientsService';

async function notificarAdminsAusencia(usuario: any, autor: any) {
  if (!mailer.isEnabled()) {
    return { sent: false, reason: mailer.getDisabledReason() };
  }

  const destinatarios = await adminRecipientsService.listarDestinatariosAdmins();
  if (!destinatarios.length) {
    return { sent: false, reason: 'Nenhum admin ativo com e-mail válido.' };
  }

  const statusDesc = usuario.ausente
    ? `sinalizou afastamento (${usuario.ausente_tipo || 'Ausente'})`
    : `finalizou/cancelou o período de afastamento`;

  const contexto = `O status de afastamento do colaborador ${usuario.nome} foi atualizado por ${autor?.nome || 'Sistema'}.\nDetalhes: ${getDescricaoAusencia(usuario)}`;

  return mailer.enviarAvisoAdminsUsuario(destinatarios, {
    titulo: usuario.ausente ? 'Atualização de Afastamento' : 'Retorno de Colaborador',
    contexto,
    usuario,
    autor,
  });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const targetUserId = params?.id;
    const isSelf = String(user.id) === String(targetUserId);
    const isAdmin = ['admin', 'root'].includes(user.role);

    if (!isSelf && !isAdmin) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const ausente = Boolean(body?.ausente);
    const ausenteTipo = ausente ? String(body?.ausenteTipo || body?.tipo || 'Férias').trim() : null;
    const inicioDate = ausente ? parseDateFlexible(body?.ausenteInicio || body?.inicio) : null;
    const fimDate = ausente ? parseDateFlexible(body?.ausenteFim || body?.fim) : null;
    const ausenteMotivo = ausente ? String(body?.ausenteMotivo || body?.motivo || '').trim() || null : null;

    if (ausente && inicioDate && fimDate && inicioDate.getTime() > fimDate.getTime()) {
      return NextResponse.json(
        { ok: false, erro: 'A data de início do afastamento não pode ser posterior à data de término.' },
        { status: 400 }
      );
    }

    const inicioIso = inicioDate ? formatToDateIso(inicioDate) : null;
    const fimIso = fimDate ? formatToDateIso(fimDate) : null;

    const result = await query(
      `UPDATE users
          SET ausente = $1,
              ausente_tipo = $2,
              ausente_inicio = $3,
              ausente_fim = $4,
              ausente_motivo = $5,
              ausente_updated_at = NOW(),
              updated_at = NOW()
        WHERE id = $6
      RETURNING id, nome, email, matricula, role, ativo,
                ausente, ausente_tipo, ausente_inicio, ausente_fim, ausente_motivo, created_at`,
      [ausente, ausenteTipo, inicioIso, fimIso, ausenteMotivo, targetUserId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
    }

    const updatedUser = result.rows[0];

    let notificacaoAdmins: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      notificacaoAdmins = await notificarAdminsAusencia(updatedUser, user);
    } catch (err: any) {
      notificacaoAdmins = { sent: false, reason: `Falha ao notificar admins: ${err.message}` };
    }

    return NextResponse.json({
      ok: true,
      user: sanitizeUser(updatedUser),
      descricao: getDescricaoAusencia(updatedUser),
      notificacaoAdmins,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
