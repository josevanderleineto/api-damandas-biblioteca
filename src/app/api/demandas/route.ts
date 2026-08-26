import { NextResponse } from 'next/server';
import * as sheetsService from '@/lib/googleSheets';
import * as mailer from '@/lib/mailer';
import * as notificationRegistry from '@/lib/services/notificationRegistryService';
import * as adminRecipientsService from '@/lib/services/adminRecipientsService';
import { getUserFromRequest } from '@/lib/auth';
import { normalize, normalizeEmail, isValidEmail, gerarId } from '@/lib/utils';

const ALERTA_ATRASADO = '🔴ATRASADO';
const ALERTA_NO_PRAZO = '🟢NO PRAZO';

function parseDateBrToDate(dateBr: string) {
  if (!dateBr || typeof dateBr !== 'string') return null;
  const [dd, mm, yyyy] = dateBr.split('/');
  if (!dd || !mm || !yyyy) return null;

  const day = Number.parseInt(dd, 10);
  const month = Number.parseInt(mm, 10);
  const year = Number.parseInt(yyyy, 10);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function daysDiffFromToday(targetDate: Date) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const diffMs = targetEnd.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isValidPrazo(dateBr: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(dateBr || '').trim()) && !!parseDateBrToDate(dateBr);
}

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

function emailsToCell(value: string) {
  return normalizeEmailList(value).join('; ');
}

function demandEmails(demandaEmail: string) {
  return normalizeEmailList(demandaEmail);
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

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const linhas = await sheetsService.listar();

    if (!linhas || linhas.length === 0) {
      return NextResponse.json([]);
    }

    const [cabecalho, ...dados] = linhas;
    let resultado = dados.map(sheetsService.mapRowToDemanda);

    if (!['admin', 'root'].includes(user.role)) {
      const userEmail = normalizeEmail(user.email);
      resultado = resultado.filter((d) => demandEmails(d.email).includes(userEmail));
    }

    return NextResponse.json({ cabecalho, total: resultado.length, dados: resultado });
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
    const responsavel = normalize(body?.responsavel || body?.Responsável);
    const descricao = normalize(body?.descricao || body?.descrição);
    const matricula = String(body?.matricula || body?.Matrícula || '');
    const email = normalize(body?.email || body?.Email);
    const prazo = normalize(body?.prazo || body?.Prazo);
    const status = normalize(body?.status || body?.Status) || 'Pendente';
    const prioridade = normalize(body?.prioridade || body?.Prioridade);
    const conclusao = normalize(body?.conclusao || body?.Conclusão);
    const tempoExecucao = normalize(body?.tempoExecucao || body?.tempo_execucao);
    const alertaParam = normalize(body?.alerta || body?.Alerta);

    if (!responsavel || !descricao || !prazo || !matricula.trim()) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: responsavel, descricao, matricula, prazo (dd/mm/aaaa).' }, { status: 400 });
    }

    if (!isValidPrazo(prazo)) {
      return NextResponse.json({ ok: false, erro: 'Prazo inválido. Use formato dd/mm/aaaa.' }, { status: 400 });
    }

    const emailsCell = emailsToCell(email);
    const linhas = await sheetsService.listar();
    const dadosSemCabecalho = linhas.length > 0 ? linhas.slice(1) : [];

    const id = gerarId(dadosSemCabecalho);
    const dataCriacao = new Date().toLocaleDateString('pt-BR');

    const prazoDate = parseDateBrToDate(prazo);
    const alerta = prazoDate && daysDiffFromToday(prazoDate) < 0 ? ALERTA_ATRASADO : ALERTA_NO_PRAZO;

    const linha = [
      id,
      responsavel,
      descricao,
      matricula,
      emailsCell,
      dataCriacao,
      prazo,
      status,
      prioridade,
      conclusao,
      tempoExecucao,
      alertaParam || alerta,
    ];

    const insertResult = await sheetsService.inserir(linha);

    let notificacao: any = { sent: false, reason: 'Email não informado.' };
    const demandaMapeada = sheetsService.mapRowToDemanda(linha);

    if (emailsCell) {
      try {
        notificacao = await mailer.enviarNovaDemanda(demandaMapeada);
        if (notificacao.sent) {
          const assignmentHash = notificationRegistry.buildAssignmentHash(demandaMapeada);
          await notificationRegistry.markAssignmentSent(id, assignmentHash);
        }
      } catch (error: any) {
        notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
      }
    }

    const notificacaoAdmins = await notificarAdminsDemanda(
      demandaMapeada,
      (emailDest) => mailer.enviarNovaDemandaAdmin(demandaMapeada, emailDest)
    );

    return NextResponse.json({
      ok: true,
      id,
      rowNumber: insertResult.rowNumber,
      dataCriacao,
      notificacao,
      notificacaoAdmins,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
