import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest, sanitizeUser, findUserById } from '@/lib/auth';
import { parseDateFlexible, formatToDateIso, formatToDateBr, getDescricaoAusencia } from '@/lib/ausencia';
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
    : `finalizou/cancelou seu período de afastamento`;

  const contexto = `O colaborador ${usuario.nome} ${statusDesc}.\nDetalhes: ${getDescricaoAusencia(usuario)}`;

  return mailer.enviarAvisoAdminsUsuario(destinatarios, {
    titulo: usuario.ausente ? 'Aviso de Afastamento de Colaborador' : 'Retorno de Colaborador Afastado',
    contexto,
    usuario,
    autor,
  });
}

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const dbUser = await findUserById(user.id);
    if (!dbUser) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      ausencia: {
        ausente: !!dbUser.ausente,
        ausenteTipo: dbUser.ausente_tipo || '',
        ausenteInicio: dbUser.ausente_inicio ? formatToDateIso(dbUser.ausente_inicio) : '',
        ausenteFim: dbUser.ausente_fim ? formatToDateIso(dbUser.ausente_fim) : '',
        ausenteMotivo: dbUser.ausente_motivo || '',
        descricao: getDescricaoAusencia(dbUser),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
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
      [ausente, ausenteTipo, inicioIso, fimIso, ausenteMotivo, user.id]
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
