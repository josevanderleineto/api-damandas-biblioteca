import * as sheetsService from '../googleSheets';
import * as mailer from '../mailer';
import * as adminRecipientsService from './adminRecipientsService';
import * as weeklyReportRegistry from './weeklyReportRegistryService';

const APP_TIME_ZONE = process.env.TZ || 'America/Bahia';
const REPORT_WEEKDAY = 1;
const DEFAULT_SEND_HOUR = 9;
const DEFAULT_SEND_MINUTE = 0;
const runningReportKeys = new Set<string>();

function normalize(value: any) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function parseDateBr(dateBr: string): Date | null {
  if (!dateBr || typeof dateBr !== 'string') return null;
  const [dd, mm, yyyy] = dateBr.split('/');
  if (!dd || !mm || !yyyy) return null;

  const day = Number.parseInt(dd, 10);
  const month = Number.parseInt(mm, 10);
  const year = Number.parseInt(yyyy, 10);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function formatDateBr(date: Date) {
  return date.toLocaleDateString('pt-BR', { timeZone: APP_TIME_ZONE });
}

function formatDateIso(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTimeBr(date: Date) {
  return date.toLocaleString('pt-BR', { timeZone: APP_TIME_ZONE });
}

function startOfMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function getScheduleTime() {
  const hourRaw = Number.parseInt(process.env.WEEKLY_REPORT_HOUR || '', 10);
  const minuteRaw = Number.parseInt(process.env.WEEKLY_REPORT_MINUTE || '', 10);

  return {
    hour: Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : DEFAULT_SEND_HOUR,
    minute: Number.isInteger(minuteRaw) && minuteRaw >= 0 && minuteRaw <= 59 ? minuteRaw : DEFAULT_SEND_MINUTE,
  };
}

function getScheduledRunDate(now = new Date()) {
  const { hour, minute } = getScheduleTime();
  const monday = startOfMonday(now);
  const scheduled = new Date(monday);
  scheduled.setHours(hour, minute, 0, 0);
  return scheduled;
}

function buildReportWindow(referenceDate = new Date()) {
  const reportMonday = startOfMonday(referenceDate);
  const periodEnd = new Date(reportMonday);
  periodEnd.setDate(periodEnd.getDate() - 1);
  periodEnd.setHours(23, 59, 59, 999);

  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 6);
  periodStart.setHours(0, 0, 0, 0);

  return {
    reportKey: formatDateIso(reportMonday),
    periodStart,
    periodEnd,
    periodStartIso: formatDateIso(periodStart),
    periodEndIso: formatDateIso(periodEnd),
    periodLabel: `${formatDateBr(periodStart)} a ${formatDateBr(periodEnd)}`,
  };
}

function statusBucket(status: string) {
  const value = normalize(status);
  if (!value) return 'sem_status';
  if (value.includes('pend')) return 'pendente';
  if (value.includes('andament')) return 'andamento';
  if (value.includes('conclu')) return 'concluida';
  return 'outros';
}

function isConcludedStatus(status: string) {
  return statusBucket(status) === 'concluida';
}

function daysUntil(targetDate: Date) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const diffMs = targetEnd.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isInPeriod(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

async function buildCurrentSnapshot(periodStart: Date, periodEnd: Date) {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

  const snapshot = {
    total: 0,
    open: 0,
    pending: 0,
    andamento: 0,
    concluded: 0,
    semStatus: 0,
    outrosStatus: 0,
    overdue: 0,
    dueSoon: 0,
    dueToday: 0,
    noDeadline: 0,
    createdInPeriod: 0,
    concludedInPeriod: 0,
    overdueItems: [] as any[],
    dueSoonItems: [] as any[],
  };

  for (const linha of dados) {
    const demanda = sheetsService.mapRowToDemanda(linha);
    if (!demanda.demanda) continue;

    snapshot.total += 1;

    const bucket = statusBucket(demanda.status);
    if (bucket === 'pendente') snapshot.pending += 1;
    else if (bucket === 'andamento') snapshot.andamento += 1;
    else if (bucket === 'concluida') snapshot.concluded += 1;
    else if (bucket === 'sem_status') snapshot.semStatus += 1;
    else snapshot.outrosStatus += 1;

    const createdDate = parseDateBr(demanda.dataCriacao);
    if (createdDate && isInPeriod(createdDate, periodStart, periodEnd)) {
      snapshot.createdInPeriod += 1;
    }

    const concludedDate = parseDateBr(demanda.conclusao);
    if (isConcludedStatus(demanda.status) && concludedDate && isInPeriod(concludedDate, periodStart, periodEnd)) {
      snapshot.concludedInPeriod += 1;
    }

    const prazoDate = parseDateBr(demanda.prazo);
    if (!prazoDate) {
      snapshot.noDeadline += 1;
      continue;
    }

    if (isConcludedStatus(demanda.status)) continue;

    const diff = daysUntil(prazoDate);
    if (diff < 0) {
      snapshot.overdue += 1;
      snapshot.overdueItems.push({
        demanda: demanda.demanda,
        responsavel: demanda.responsavel || '-',
        prazo: demanda.prazo,
        diasAtraso: Math.abs(diff),
        prioridade: demanda.prioridade || '-',
      });
    } else if (diff <= 7) {
      snapshot.dueSoon += 1;
      if (diff === 0) snapshot.dueToday += 1;
      snapshot.dueSoonItems.push({
        demanda: demanda.demanda,
        responsavel: demanda.responsavel || '-',
        prazo: demanda.prazo,
        diasRestantes: diff,
        prioridade: demanda.prioridade || '-',
      });
    }
  }

  snapshot.open = snapshot.total - snapshot.concluded;

  return snapshot;
}

export async function gerarResumoSemanal(referenceDate = new Date()) {
  const window = buildReportWindow(referenceDate);
  const [currentSnapshot, previousReport] = await Promise.all([
    buildCurrentSnapshot(window.periodStart, window.periodEnd),
    weeklyReportRegistry.getPreviousSentReport(window.reportKey),
  ]);

  const summary = {
    reportKey: window.reportKey,
    periodStart: window.periodStartIso,
    periodEnd: window.periodEndIso,
    periodLabel: window.periodLabel,
    generatedAt: formatDateTimeBr(referenceDate),
    metrics: [
      { label: 'Total de demandas', value: currentSnapshot.total },
      { label: 'Demandas abertas', value: currentSnapshot.open },
      { label: 'Pendentes', value: currentSnapshot.pending },
      { label: 'Em andamento', value: currentSnapshot.andamento },
      { label: 'Concluídas', value: currentSnapshot.concluded },
      { label: 'Atrasadas', value: currentSnapshot.overdue },
      { label: 'Vencem em até 7 dias', value: currentSnapshot.dueSoon },
      { label: 'Novas na semana', value: currentSnapshot.createdInPeriod },
      { label: 'Concluídas na semana', value: currentSnapshot.concludedInPeriod },
    ],
    overdueItems: currentSnapshot.overdueItems.slice(0, 5),
    dueSoonItems: currentSnapshot.dueSoonItems.slice(0, 5),
    snapshot: currentSnapshot,
  };

  return { window, summary, previousReport };
}

export async function executarResumoSemanal({ referenceDate = new Date(), force = false } = {}) {
  const now = referenceDate;
  const window = buildReportWindow(now);
  const scheduledThisWeek = getScheduledRunDate(now);

  if (!force) {
    if (now.getDay() !== REPORT_WEEKDAY) {
      return {
        sent: false,
        skipped: true,
        reportKey: window.reportKey,
        reason: 'O resumo semanal só é enviado às segundas-feiras.',
      };
    }

    if (now.getTime() < scheduledThisWeek.getTime()) {
      return {
        sent: false,
        skipped: true,
        reportKey: window.reportKey,
        reason: `O envio automático ocorre a partir de ${formatDateTimeBr(scheduledThisWeek)}.`,
      };
    }
  }

  if (runningReportKeys.has(window.reportKey)) {
    return {
      sent: false,
      skipped: true,
      reportKey: window.reportKey,
      reason: 'Já existe um relatório semanal em execução.',
    };
  }

  if (await weeklyReportRegistry.reportAlreadySent(window.reportKey)) {
    return {
      sent: false,
      skipped: true,
      reportKey: window.reportKey,
      reason: 'O resumo semanal deste período já foi enviado.',
    };
  }

  runningReportKeys.add(window.reportKey);

  try {
    const { summary } = await gerarResumoSemanal(now);
    const destinatarios = await adminRecipientsService.listarDestinatariosRelatorioSemanal();

    if (!mailer.isEnabled()) {
      return {
        sent: false,
        reportKey: window.reportKey,
        recipients: destinatarios.length,
        reason: mailer.getDisabledReason(),
        summary,
      };
    }

    if (destinatarios.length === 0) {
      return {
        sent: false,
        reportKey: window.reportKey,
        recipients: 0,
        reason: 'Nenhum destinatário válido encontrado.',
        summary,
      };
    }

    const envio = await mailer.enviarResumoSemanalDemandas({
      destinatarios,
      report: summary,
    });

    if (!envio.sent) {
      return {
        sent: false,
        reportKey: window.reportKey,
        recipients: destinatarios.length,
        reason: envio.reason || 'Falha no envio do resumo semanal.',
        envio,
        summary,
      };
    }

    const registro = await weeklyReportRegistry.markReportSent({
      reportKey: window.reportKey,
      periodStart: window.periodStartIso,
      periodEnd: window.periodEndIso,
      summaryJson: summary,
    });

    return {
      sent: true,
      reportKey: window.reportKey,
      recipients: destinatarios.length,
      envio,
      registro,
      summary,
    };
  } catch (error: any) {
    return {
      sent: false,
      reportKey: window.reportKey,
      reason: error.message,
    };
  } finally {
    runningReportKeys.delete(window.reportKey);
  }
}
