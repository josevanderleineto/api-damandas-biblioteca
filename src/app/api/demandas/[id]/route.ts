import { NextResponse } from 'next/server';
import * as sheetsService from '@/lib/googleSheets';
import * as mailer from '@/lib/mailer';
import * as adminRecipientsService from '@/lib/services/adminRecipientsService';
import { getUserFromRequest } from '@/lib/auth';
import { normalize, normalizeEmail, isValidEmail } from '@/lib/utils';

function splitEmailList(value: string) {
  return String(value || '')
    .split(/[;,|\n\r]/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function normalizeEmailList(value: string) {
  const seen = new Set<string>();
  const result: string[] = [];

  splitEmailList(value).forEach((email) => {
    const normalized = normalizeEmail(email);
    if (isValidEmail(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });

  return result;
}

function demandEmails(demandaEmail: string) {
  return normalizeEmailList(demandaEmail);
}

function emailsToCell(value: string) {
  return normalizeEmailList(value).join('; ');
}

function isAdminRole(role: string) {
  return ['admin', 'root'].includes(normalize(role).toLowerCase());
}

function userCanAccessDemand(user: any, demanda: any) {
  if (!user || !demanda) return false;
  if (isAdminRole(user.role)) return true;
  const userEmail = normalizeEmail(user.email);
  const emails = demandEmails(demanda.email);
  return emails.includes(userEmail);
}

function isResponsavelPelaDemanda(user: any, demanda: any) {
  if (!user || !demanda) return false;
  const userEmail = normalizeEmail(user.email);
  const emails = demandEmails(demanda.email);
  return emails.includes(userEmail);
}

function normalizeStatusValue(status: string) {
  const s = normalize(status).toLowerCase();
  if (s.startsWith('pend')) return 'Pendente';
  if (s.includes('andament')) return 'Em andamento';
  if (s.includes('conclu')) return 'Concluído';
  return status || '';
}

function isAllowedTransition(prev: string, next: string) {
  const from = normalizeStatusValue(prev);
  const to = normalizeStatusValue(next);
  if (from === to) return true;
  if (from === 'Pendente' && to === 'Em andamento') return true;
  if (from === 'Em andamento' && to === 'Concluído') return true;
  return false;
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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const { id } = params;
    const demanda = await sheetsService.buscarPorId(id);

    if (!demanda) {
      return NextResponse.json({ ok: false, erro: `Demanda "${id}" não encontrada.` }, { status: 404 });
    }

    if (!userCanAccessDemand(user, demanda)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado a esta demanda.' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, demanda });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const demandaAtual = await sheetsService.buscarPorId(id);
    if (!demandaAtual) {
      return NextResponse.json({ ok: false, erro: `Demanda "${id}" não encontrada.` }, { status: 404 });
    }

    if (!userCanAccessDemand(user, demandaAtual)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado a esta demanda.' }, { status: 403 });
    }

    const isAdmin = isAdminRole(user.role);
    const isResponsavel = isResponsavelPelaDemanda(user, demandaAtual);

    if (!isResponsavel && !isAdmin) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado a esta demanda.' }, { status: 403 });
    }

    const dadosRaw = {
      responsavel: body?.responsavel ?? body?.Responsável,
      descricao: body?.descricao ?? body?.descrição,
      matricula: body?.matricula ?? body?.Matrícula,
      email: body?.email ?? body?.Email,
      prazo: body?.prazo ?? body?.Prazo,
      status: body?.status ?? body?.Status,
      prioridade: body?.prioridade ?? body?.Prioridade,
      conclusao: body?.conclusao ?? body?.Conclusão,
      tempoExecucao: body?.tempoExecucao ?? body?.tempo_execucao,
      alerta: body?.alerta ?? body?.Alerta,
    };

    const dados: any = !isAdmin
      ? { status: dadosRaw.status, conclusao: dadosRaw.conclusao, tempoExecucao: dadosRaw.tempoExecucao }
      : dadosRaw;

    let statusChanged = false;

    if (typeof dados.status !== 'undefined') {
      const normalizedNext = normalizeStatusValue(dados.status);
      const normalizedPrev = normalizeStatusValue(demandaAtual.status);

      if (!isAllowedTransition(normalizedPrev, normalizedNext) && !isAdmin) {
        return NextResponse.json({ ok: false, erro: 'Transição de status inválida. Use Pendente → Em andamento → Concluído.' }, { status: 400 });
      }

      dados.status = normalizedNext;
      statusChanged = normalizedPrev !== normalizedNext;
    }

    const payload = isAdmin && typeof dados.email !== 'undefined'
      ? { ...dados, email: emailsToCell(dados.email) }
      : dados;

    const result = await sheetsService.atualizar(id, payload);
    const demandaAtualizada = await sheetsService.buscarPorId(id);

    let notificacao: any = { sent: false, reason: 'Email não informado.' };
    if (demandaAtualizada?.email) {
      try {
        notificacao = await mailer.enviarAtualizacaoDemanda(demandaAtualizada);
      } catch (error: any) {
        notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
      }
    }

    const notificacaoAdmins = await notificarAdminsDemanda(
      demandaAtualizada,
      (emailDest) => {
        if (statusChanged) {
          return mailer.enviarAtualizacaoStatusAdmin(demandaAtualizada, emailDest);
        }
        return mailer.enviarMovimentacaoDemandaAdmin(demandaAtualizada, emailDest, {
          subjectPrefix: 'demanda atualizada',
          headline: 'Demanda atualizada',
          contextText: 'A demanda recebeu uma movimentação/atualização no sistema e esta cópia foi enviada para administradores.',
          badgeLabel: 'ATUALIZAÇÃO',
          badgeColor: '#7f56d9',
        });
      }
    );

    return NextResponse.json({ ok: true, ...result, notificacao, notificacaoAdmins });
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

    const { id } = params;
    const result = await sheetsService.remover(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
