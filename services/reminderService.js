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
  const intervalMinutes = Number.parseInt(process.env.REMINDER_INTERVAL_MINUTES || '60', 10);
  const intervalMs = Number.isNaN(intervalMinutes) || intervalMinutes <= 0
    ? 60 * 60 * 1000
    : intervalMinutes * 60 * 1000;

  setInterval(async () => {
    try {
      await executarLembretesPrazo();
    } catch (error) {
      // evita derrubar servidor por erro de agendamento
    }
  }, intervalMs);
}

module.exports = {
  executarLembretesPrazo,
  iniciarAgendadorLembretes,
};
