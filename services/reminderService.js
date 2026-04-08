const sheetsService = require('./sheetsService');
const notificationService = require('./notificationService');
const notificationRegistry = require('./notificationRegistryService');
const adminRecipientsService = require('./adminRecipientsService');

const reminderSentCache = new Set();

const ALERTA_ATRASADO = '🔴ATRASADO';
const ALERTA_NO_PRAZO = '🟢NO PRAZO';
const APP_TIME_ZONE = process.env.TZ || 'America/Bahia';

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

function daysDiffFromToday(targetDate) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const diffMs = targetEnd.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function shouldSkipStatus(status) {
  const s = normalize(status);
  return s.includes('conclu') || s.includes('finaliz');
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildReminderKey(tipo) {
  return `${todayKey()}:${tipo}`;
}

function nextDailyRunDateFromNow() {
  const now = new Date();
  const next = new Date(now);

  next.setHours(10, 0, 0, 0);

  // Se já passou de 10h, agenda para o próximo dia.
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function getIntervalMinutes() {
  const raw = Number.parseInt(process.env.REMINDER_INTERVAL_MINUTES || '', 10);
  if (Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return null;
}

function nextRunDate(intervalMinutes) {
  if (intervalMinutes) {
    return new Date(Date.now() + intervalMinutes * 60 * 1000);
  }
  return nextDailyRunDateFromNow();
}

function formatDateTimeLocal(date) {
  return date.toLocaleString('pt-BR', { timeZone: APP_TIME_ZONE });
}

async function executarLembretesPrazo() {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

  let adminEmails = [];
  if (notificationService.isEnabled()) {
    try {
      adminEmails = await adminRecipientsService.listarDestinatariosAdmins();
    } catch (error) {
      console.error(`[lembretes] falha ao listar admins: ${error.message}`);
      adminEmails = [];
    }
  }

  let avaliadas = 0;
  let enviadas = 0;
  let ignoradas = 0;

  for (const linha of dados) {
    const demanda = {
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

    if (!demanda.demanda || !demanda.email || shouldSkipStatus(demanda.status)) {
      continue;
    }

    const prazoDate = parseDateBr(demanda.prazo);
    if (!prazoDate) {
      continue;
    }

    const diasRestantes = daysDiffFromToday(prazoDate);

    const alertaEsperado = diasRestantes < 0 ? ALERTA_ATRASADO : ALERTA_NO_PRAZO;
    if (demanda.alerta !== alertaEsperado) {
      try {
        await sheetsService.atualizar(demanda.demanda, { alerta: alertaEsperado });
        demanda.alerta = alertaEsperado;
      } catch (error) {
        // não bloqueia envio caso falhe ao atualizar alerta
      }
    }

    avaliadas += 1;

    const tipo =
      diasRestantes < 0
        ? 'atrasada'
        : diasRestantes === 0
          ? 'vence_hoje'
          : diasRestantes === 1
            ? 'vence_amanha'
            : 'em_aberto';
    const reminderKey = buildReminderKey(tipo);
    const cacheKey = `${demanda.demanda}:${reminderKey}`;

    if (reminderSentCache.has(cacheKey)) {
      ignoradas += 1;
      continue;
    }

    const alreadySent = await notificationRegistry.reminderAlreadySent(demanda.demanda, reminderKey);
    if (alreadySent) {
      reminderSentCache.add(cacheKey);
      ignoradas += 1;
      continue;
    }

    try {
      const result = await notificationService.enviarLembretePrazo(demanda, diasRestantes);
      if (result.sent) {
        reminderSentCache.add(cacheKey);
        await notificationRegistry.markReminderSent(demanda.demanda, reminderKey);
        enviadas += 1;

        if (adminEmails.length) {
          const destinatariosDemanda = adminRecipientsService.splitEmailRecipients(demanda.email);
          const adminsFiltrados = adminEmails.filter((email) => !destinatariosDemanda.includes(email));

          if (adminsFiltrados.length) {
            await Promise.allSettled(
              adminsFiltrados.map((email) => notificationService.enviarLembretePrazoAdmin(demanda, diasRestantes, email))
            );
          }
        }
      }
    } catch (error) {
      // segue para próximas demandas mesmo com erro em uma
    }
  }

  return { avaliadas, enviadas, ignoradas };
}

function iniciarAgendadorLembretes() {
  const intervalMinutes = getIntervalMinutes();

  const executarCicloAgendado = async () => {
    try {
      const result = await executarLembretesPrazo();
      console.log(`[lembretes] ciclo executado: avaliadas=${result.avaliadas}, enviadas=${result.enviadas}, ignoradas=${result.ignoradas}`);
    } catch (error) {
      console.error(`[lembretes] falha no ciclo: ${error.message}`);
    }
  };

  const scheduleNext = () => {
    const nextRun = nextRunDate(intervalMinutes);
    const delay = Math.max(1000, nextRun.getTime() - Date.now());

    const label = intervalMinutes
      ? `a cada ${intervalMinutes} minuto(s)`
      : 'diariamente às 10:00';

    console.log(`[lembretes] próximo ciclo: ${formatDateTimeLocal(nextRun)} (${label})`);

    setTimeout(async () => {
      await executarCicloAgendado();
      scheduleNext();
    }, delay);
  };

  // Executa imediatamente ao iniciar para cobrir atrasos por indisponibilidade do servidor
  // e enviar os lembretes assim que alguém abrir o sistema após o horário programado.
  executarCicloAgendado().then(() => {
    scheduleNext();
  }).catch((error) => {
    console.error(`[lembretes] falha na execução imediata: ${error.message}`);
    scheduleNext();
  });
}

module.exports = {
  executarLembretesPrazo,
  iniciarAgendadorLembretes,
};
