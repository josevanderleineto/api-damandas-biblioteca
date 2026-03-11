const sheetsService = require('./sheetsService');
const notificationService = require('./notificationService');

const reminderSentCache = new Set();

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function shouldSkipStatus(status) {
  const s = normalize(status);
  return s.includes('conclu') || s.includes('finaliz');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nextBusinessRunDateFromNow() {
  const now = new Date();
  const next = new Date(now);

  next.setHours(10, 0, 0, 0);

  // Se já passou de 10h, agenda para o próximo dia.
  if (now.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  // Pula sábado/domingo.
  while (isWeekend(next)) {
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
  return nextBusinessRunDateFromNow();
}

function formatDateTimeLocal(date) {
  return date.toLocaleString('pt-BR');
}

async function executarLembretesPrazo() {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

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
    if (diasRestantes > 1) {
      continue;
    }

    avaliadas += 1;

    const tipo = diasRestantes < 0 ? 'atrasada' : diasRestantes === 0 ? 'vence_hoje' : 'vence_amanha';
    const key = `${demanda.demanda}:${todayKey()}:${tipo}`;

    if (reminderSentCache.has(key)) {
      ignoradas += 1;
      continue;
    }

    try {
      const result = await notificationService.enviarLembretePrazo(demanda, diasRestantes);
      if (result.sent) {
        reminderSentCache.add(key);
        enviadas += 1;
      }
    } catch (error) {
      // segue para próximas demandas mesmo com erro em uma
    }
  }

  return { avaliadas, enviadas, ignoradas };
}

function iniciarAgendadorLembretes() {
  const intervalMinutes = getIntervalMinutes();

  const scheduleNext = () => {
    const nextRun = nextRunDate(intervalMinutes);
    const delay = Math.max(1000, nextRun.getTime() - Date.now());

    const label = intervalMinutes
      ? `a cada ${intervalMinutes} minuto(s)`
      : 'dias úteis às 10:00';

    console.log(`[lembretes] próximo ciclo: ${formatDateTimeLocal(nextRun)} (${label})`);

    setTimeout(async () => {
      try {
        if (!isWeekend(new Date())) {
          const result = await executarLembretesPrazo();
          console.log(`[lembretes] ciclo executado: avaliadas=${result.avaliadas}, enviadas=${result.enviadas}, ignoradas=${result.ignoradas}`);
        } else {
          console.log('[lembretes] fim de semana: ciclo pulado');
        }
      } catch (error) {
        console.error(`[lembretes] falha no ciclo: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
}

module.exports = {
  executarLembretesPrazo,
  iniciarAgendadorLembretes,
};
