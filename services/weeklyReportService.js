const sheetsService = require('./sheetsService');
const notificationService = require('./notificationService');
const adminRecipientsService = require('./adminRecipientsService');
const weeklyReportRegistry = require('./weeklyReportRegistryService');

const APP_TIME_ZONE = process.env.TZ || 'America/Bahia';
const REPORT_WEEKDAY = 1;
const DEFAULT_SEND_HOUR = 9;
const DEFAULT_SEND_MINUTE = 0;
const runningReportKeys = new Set();

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function parseDateBr(dateBr) {
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

function formatDateBr(date) {
  return date.toLocaleDateString('pt-BR', { timeZone: APP_TIME_ZONE });
}

function formatDateIso(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTimeBr(date) {
  return date.toLocaleString('pt-BR', { timeZone: APP_TIME_ZONE });
}

function startOfMonday(date) {
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

function getNextRunDate(now = new Date()) {
  const scheduledThisWeek = getScheduledRunDate(now);
  if (now.getDay() === REPORT_WEEKDAY && now.getTime() < scheduledThisWeek.getTime()) {
    return scheduledThisWeek;
  }

  const next = new Date(scheduledThisWeek);
  next.setDate(next.getDate() + 7);
  return next;
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

function mapLinhaParaDemanda(linha = []) {
  return {
    demanda: linha[0] || '',
    responsavel: linha[1] || '',
    descricao: linha[2] || '',
    matricula: linha[3] || '',
    email: linha[4] || '',
    dataCriacao: linha[5] || '',
    prazo: linha[6] || '',
    status: linha[7] || '',
    prioridade: linha[8] || '',
    conclusao: linha[9] || '',
    tempoExecucao: linha[10] || '',
    alerta: linha[11] || '',
  };
}

function statusBucket(status) {
  const value = normalize(status);
  if (!value) return 'sem_status';
  if (value.includes('pend')) return 'pendente';
  if (value.includes('andament')) return 'andamento';
  if (value.includes('conclu')) return 'concluida';
  return 'outros';
}

function isConcludedStatus(status) {
  return statusBucket(status) === 'concluida';
}

function daysUntil(targetDate) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const diffMs = targetEnd.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isInPeriod(date, start, end) {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function formatDelta(delta) {
  if (!Number.isFinite(delta)) return null;
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : String(delta);
}

function sortDemandas(items, fieldName) {
  items.sort((a, b) => {
    const left = a[fieldName];
    const right = b[fieldName];
    if (left === right) return String(a.demanda || '').localeCompare(String(b.demanda || ''));
    return left - right;
  });
}

async function buildCurrentSnapshot(periodStart, periodEnd) {
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
    overdueItems: [],
    dueSoonItems: [],
  };

  for (const linha of dados) {
    const demanda = mapLinhaParaDemanda(linha);
    if (!demanda.demanda) {
      continue;
    }

    snapshot.total += 1;

    const bucket = statusBucket(demanda.status);
    if (bucket === 'pendente') {
      snapshot.pending += 1;
    } else if (bucket === 'andamento') {
      snapshot.andamento += 1;
    } else if (bucket === 'concluida') {
      snapshot.concluded += 1;
    } else if (bucket === 'sem_status') {
      snapshot.semStatus += 1;
    } else {
      snapshot.outrosStatus += 1;
    }

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

    if (isConcludedStatus(demanda.status)) {
      continue;
    }

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
      if (diff === 0) {
        snapshot.dueToday += 1;
      }
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
  sortDemandas(snapshot.overdueItems, 'diasAtraso');
  sortDemandas(snapshot.dueSoonItems, 'diasRestantes');

  return snapshot;
}

function buildHighlights(currentSnapshot, previousSnapshot) {
  const highlights = [];

  if (currentSnapshot.createdInPeriod > 0) {
    highlights.push(`${currentSnapshot.createdInPeriod} demanda(s) foram criadas no periodo.`);
  }

  if (currentSnapshot.concludedInPeriod > 0) {
    highlights.push(`${currentSnapshot.concludedInPeriod} demanda(s) foram concluidas no periodo.`);
  }

  if (currentSnapshot.overdue > 0) {
    highlights.push(`${currentSnapshot.overdue} demanda(s) continuam atrasadas no momento.`);
  }

  if (currentSnapshot.dueSoon > 0) {
    highlights.push(`${currentSnapshot.dueSoon} demanda(s) vencem nos proximos 7 dias.`);
  }

  if (currentSnapshot.noDeadline > 0) {
    highlights.push(`${currentSnapshot.noDeadline} demanda(s) estao sem prazo preenchido.`);
  }

  if (previousSnapshot) {
    const totalDelta = currentSnapshot.total - previousSnapshot.total;
    if (totalDelta !== 0) {
      highlights.push(`O total de demandas variou ${formatDelta(totalDelta)} em relacao ao relatorio anterior.`);
    }
  }

  return highlights.slice(0, 5);
}

function buildMetrics(currentSnapshot, previousSnapshot) {
  const prev = previousSnapshot || {};

  return [
    { label: 'Total de demandas', value: currentSnapshot.total, delta: Number.isFinite(prev.total) ? currentSnapshot.total - prev.total : null },
    { label: 'Demandas abertas', value: currentSnapshot.open, delta: Number.isFinite(prev.open) ? currentSnapshot.open - prev.open : null },
    { label: 'Pendentes', value: currentSnapshot.pending, delta: Number.isFinite(prev.pending) ? currentSnapshot.pending - prev.pending : null },
    { label: 'Em andamento', value: currentSnapshot.andamento, delta: Number.isFinite(prev.andamento) ? currentSnapshot.andamento - prev.andamento : null },
    { label: 'Concluidas', value: currentSnapshot.concluded, delta: Number.isFinite(prev.concluded) ? currentSnapshot.concluded - prev.concluded : null },
    { label: 'Atrasadas', value: currentSnapshot.overdue, delta: Number.isFinite(prev.overdue) ? currentSnapshot.overdue - prev.overdue : null },
    { label: 'Vencem em ate 7 dias', value: currentSnapshot.dueSoon, delta: Number.isFinite(prev.dueSoon) ? currentSnapshot.dueSoon - prev.dueSoon : null },
    { label: 'Novas na semana', value: currentSnapshot.createdInPeriod, delta: Number.isFinite(prev.createdInPeriod) ? currentSnapshot.createdInPeriod - prev.createdInPeriod : null },
    { label: 'Concluidas na semana', value: currentSnapshot.concludedInPeriod, delta: Number.isFinite(prev.concludedInPeriod) ? currentSnapshot.concludedInPeriod - prev.concludedInPeriod : null },
  ];
}

function buildSummary({ window, currentSnapshot, previousReport, generatedAt = new Date() }) {
  const previousSnapshot = previousReport?.summary_json?.snapshot || null;

  return {
    reportKey: window.reportKey,
    periodStart: window.periodStartIso,
    periodEnd: window.periodEndIso,
    periodLabel: window.periodLabel,
    generatedAt: formatDateTimeBr(generatedAt),
    metrics: buildMetrics(currentSnapshot, previousSnapshot),
    highlights: buildHighlights(currentSnapshot, previousSnapshot),
    overdueItems: currentSnapshot.overdueItems.slice(0, 5),
    dueSoonItems: currentSnapshot.dueSoonItems.slice(0, 5),
    snapshot: {
      total: currentSnapshot.total,
      open: currentSnapshot.open,
      pending: currentSnapshot.pending,
      andamento: currentSnapshot.andamento,
      concluded: currentSnapshot.concluded,
      semStatus: currentSnapshot.semStatus,
      outrosStatus: currentSnapshot.outrosStatus,
      overdue: currentSnapshot.overdue,
      dueSoon: currentSnapshot.dueSoon,
      dueToday: currentSnapshot.dueToday,
      noDeadline: currentSnapshot.noDeadline,
      createdInPeriod: currentSnapshot.createdInPeriod,
      concludedInPeriod: currentSnapshot.concludedInPeriod,
    },
  };
}

async function gerarResumoSemanal(referenceDate = new Date()) {
  const window = buildReportWindow(referenceDate);
  const [currentSnapshot, previousReport] = await Promise.all([
    buildCurrentSnapshot(window.periodStart, window.periodEnd),
    weeklyReportRegistry.getPreviousSentReport(window.reportKey),
  ]);

  return {
    window,
    summary: buildSummary({
      window,
      currentSnapshot,
      previousReport,
      generatedAt: referenceDate,
    }),
    previousReport,
  };
}

async function executarResumoSemanal({ referenceDate = new Date(), force = false } = {}) {
  const now = referenceDate;
  const window = buildReportWindow(now);
  const scheduledThisWeek = getScheduledRunDate(now);

  if (!force) {
    if (now.getDay() !== REPORT_WEEKDAY) {
      return {
        sent: false,
        skipped: true,
        reportKey: window.reportKey,
        reason: 'O resumo semanal so e enviado as segundas-feiras.',
      };
    }

    if (now.getTime() < scheduledThisWeek.getTime()) {
      return {
        sent: false,
        skipped: true,
        reportKey: window.reportKey,
        reason: `O envio automatico ocorre a partir de ${formatDateTimeBr(scheduledThisWeek)}.`,
      };
    }
  }

  if (runningReportKeys.has(window.reportKey)) {
    return {
      sent: false,
      skipped: true,
      reportKey: window.reportKey,
      reason: 'Ja existe um relatorio semanal em execucao.',
    };
  }

  if (await weeklyReportRegistry.reportAlreadySent(window.reportKey)) {
    return {
      sent: false,
      skipped: true,
      reportKey: window.reportKey,
      reason: 'O resumo semanal deste periodo ja foi enviado.',
    };
  }

  runningReportKeys.add(window.reportKey);

  try {
    const { summary } = await gerarResumoSemanal(now);
    const destinatarios = await adminRecipientsService.listarDestinatariosRelatorioSemanal();

    if (!notificationService.isEnabled()) {
      return {
        sent: false,
        reportKey: window.reportKey,
        recipients: destinatarios.length,
        reason: notificationService.getDisabledReason(),
        summary,
      };
    }

    if (destinatarios.length === 0) {
      return {
        sent: false,
        reportKey: window.reportKey,
        recipients: 0,
        reason: 'Nenhum destinatario valido encontrado.',
        summary,
      };
    }

    const envio = await notificationService.enviarResumoSemanalDemandas({
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
  } catch (error) {
    return {
      sent: false,
      reportKey: window.reportKey,
      reason: error.message,
    };
  } finally {
    runningReportKeys.delete(window.reportKey);
  }
}

function iniciarAgendadorResumoSemanal() {
  const scheduleNext = () => {
    const nextRun = getNextRunDate();
    const delay = Math.max(1_000, nextRun.getTime() - Date.now());
    const { hour, minute } = getScheduleTime();

    console.log(`[relatorio] proximo ciclo: ${formatDateTimeBr(nextRun)} (semanal as ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')})`);

    setTimeout(async () => {
      try {
        const result = await executarResumoSemanal({ referenceDate: new Date(), force: false });
        if (result.sent) {
          console.log(
            `[relatorio] resumo enviado: total=${result.summary.snapshot.total}, atrasadas=${result.summary.snapshot.overdue}, destinatarios=${result.recipients}`
          );
        } else if (result.skipped) {
          console.log(`[relatorio] ciclo ignorado: ${result.reason}`);
        } else {
          console.log(`[relatorio] ciclo executado sem envio: ${result.reason || 'motivo nao informado'}`);
        }
      } catch (error) {
        console.error(`[relatorio] falha no ciclo: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  executarResumoSemanal({ referenceDate: new Date(), force: false })
    .then((result) => {
      if (result.sent) {
        console.log(
          `[relatorio] execucao inicial: total=${result.summary.snapshot.total}, atrasadas=${result.summary.snapshot.overdue}, destinatarios=${result.recipients}`
        );
      } else if (result.skipped) {
        console.log(`[relatorio] execucao inicial ignorada: ${result.reason}`);
      } else {
        console.log(`[relatorio] execucao inicial sem envio: ${result.reason || 'motivo nao informado'}`);
      }
    })
    .catch((error) => {
      console.error(`[relatorio] falha na execucao inicial: ${error.message}`);
    })
    .finally(() => {
      scheduleNext();
    });
}

module.exports = {
  executarResumoSemanal,
  gerarResumoSemanal,
  iniciarAgendadorResumoSemanal,
};
