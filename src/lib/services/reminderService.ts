import * as sheetsService from '../googleSheets';
import * as mailer from '../mailer';
import * as notificationRegistry from './notificationRegistryService';
import * as adminRecipientsService from './adminRecipientsService';

const reminderSentCache = new Set<string>();

const ALERTA_ATRASADO = '🔴ATRASADO';
const ALERTA_NO_PRAZO = '🟢NO PRAZO';
const APP_TIME_ZONE = process.env.TZ || 'America/Bahia';

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

function daysDiffFromToday(targetDate: Date): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  const diffMs = targetEnd.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function shouldSkipStatus(status: string): boolean {
  const s = normalize(status);
  return s.includes('conclu') || s.includes('finaliz');
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildReminderKey(tipo: string): string {
  return `${todayKey()}:${tipo}`;
}

export async function executarLembretesPrazo() {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

  let adminEmails: string[] = [];
  if (mailer.isEnabled()) {
    try {
      adminEmails = await adminRecipientsService.listarDestinatariosAdmins();
    } catch (error: any) {
      console.error(`[lembretes] falha ao listar admins: ${error.message}`);
      adminEmails = [];
    }
  }

  let avaliadas = 0;
  let enviadas = 0;
  let ignoradas = 0;

  for (const linha of dados) {
    const demanda = sheetsService.mapRowToDemanda(linha);

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
        // ignore update error
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
      const result = await mailer.enviarLembretePrazo(demanda, diasRestantes);
      if (result.sent) {
        reminderSentCache.add(cacheKey);
        await notificationRegistry.markReminderSent(demanda.demanda, reminderKey);
        enviadas += 1;

        if (adminEmails.length) {
          const destinatariosDemanda = adminRecipientsService.splitEmailRecipients(demanda.email);
          const adminsFiltrados = adminEmails.filter((email) => !destinatariosDemanda.includes(email));

          if (adminsFiltrados.length) {
            await Promise.allSettled(
              adminsFiltrados.map((email) => mailer.enviarLembretePrazoAdmin(demanda, diasRestantes, email))
            );
          }
        }
      }
    } catch (error) {
      // ignore
    }
  }

  return { avaliadas, enviadas, ignoradas };
}
