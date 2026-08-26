import { NextResponse } from 'next/server';
import * as sheetsService from '@/lib/googleSheets';
import * as mailer from '@/lib/mailer';
import * as notificationRegistry from '@/lib/services/notificationRegistryService';
import * as adminRecipientsService from '@/lib/services/adminRecipientsService';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { normalize, normalizeEmail, isValidEmail } from '@/lib/utils';

function demandEmails(demandaEmail: string) {
  return (demandaEmail || '')
    .split(/[;,|\n\r]/g)
    .map((v) => normalizeEmail(v))
    .filter((v) => v && isValidEmail(v));
}

async function carregarUsuariosAtivosPorIds(ids: string[]) {
  const unique = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
  if (!unique.length) return [];

  const result = await query(
    `SELECT id, nome, email, matricula
       FROM users
      WHERE id = ANY($1)
        AND ativo = TRUE`,
    [unique]
  );

  return result.rows || [];
}

async function notificarAdminsDemanda(demanda: any, enviarNotificacaoAdmin: (email: string) => Promise<any>) {
  const resumo = { total: 0, enviados: 0, falhas: [] as string[] };
  if (!mailer.isEnabled()) return resumo;

  try {
    const adminEmails = await adminRecipientsService.listarDestinatariosAdmins();
    const destinatariosDemanda = demandEmails(demanda.email);
    const destinatarios = adminEmails.filter((email) => email && !destinatariosDemanda.includes(email));
    resumo.total = destinatarios.length;

    const results = await Promise.allSettled(destinatarios.map((email) => enviarNotificacaoAdmin(email)));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value?.sent) {
        resumo.enviados += 1;
      } else {
        resumo.falhas.push(destinatarios[idx]);
      }
    });
  } catch (error: any) {
    resumo.falhas.push(`Erro geral: ${error.message}`);
  }

  return resumo;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const demandaId = normalize(params?.id);
    const body = await req.json().catch(() => ({}));
    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];

    if (!demandaId || !userIds.length) {
      return NextResponse.json({ ok: false, erro: 'Informe demanda e ao menos um usuário.' }, { status: 400 });
    }

    const demandaAtual = await sheetsService.buscarPorId(demandaId);
    if (!demandaAtual) {
      return NextResponse.json({ ok: false, erro: 'Demanda não encontrada.' }, { status: 404 });
    }

    const usuarios = await carregarUsuariosAtivosPorIds(userIds);
    if (!usuarios.length) {
      return NextResponse.json({ ok: false, erro: 'Nenhum usuário ativo encontrado.' }, { status: 400 });
    }

    const emailsExistentes = demandEmails(demandaAtual.email);
    const nomesExistentes = String(demandaAtual.responsavel || '')
      .split(/[;,|]/g)
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const emailsCombinados = Array.from(
      new Set([
        ...emailsExistentes,
        ...usuarios.map((u) => normalizeEmail(u.email)).filter((email) => email && isValidEmail(email)),
      ])
    );

    const nomesCombinados = Array.from(
      new Set([
        ...nomesExistentes,
        ...usuarios.map((u) => u.nome).filter(Boolean),
      ])
    );

    const emailsCell = emailsCombinados.join('; ');
    const nomes = nomesCombinados.join('; ');

    await sheetsService.atualizar(demandaId, { responsavel: nomes, email: emailsCell });
    const demandaAtualizada = await sheetsService.buscarPorId(demandaId);

    let notificacao: any = { sent: false, reason: 'Email não informado.' };
    if (emailsCell && demandaAtualizada) {
      try {
        notificacao = await mailer.enviarNovaDemanda(demandaAtualizada);
        if (notificacao.sent) {
          const assignmentHash = notificationRegistry.buildAssignmentHash(demandaAtualizada);
          await notificationRegistry.markAssignmentSent(demandaId, assignmentHash);
        }
      } catch (error: any) {
        notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
      }
    }

    const notificacaoAdmins = await notificarAdminsDemanda(
      demandaAtualizada,
      (emailDest) => mailer.enviarNovaDemandaAdmin(demandaAtualizada, emailDest)
    );

    return NextResponse.json({ ok: true, demanda: demandaAtualizada, notificacao, notificacaoAdmins });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
