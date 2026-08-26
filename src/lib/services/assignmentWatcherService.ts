import * as sheetsService from '../googleSheets';
import * as mailer from '../mailer';
import * as notificationRegistry from './notificationRegistryService';

function normalize(value: any) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function shouldSkipStatus(status: string) {
  const s = normalize(status);
  return s.includes('conclu') || s.includes('finaliz');
}

export async function verificarAtribuicoesPendentes() {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

  let avaliadas = 0;
  let enviadas = 0;
  let ignoradas = 0;
  let falhas = 0;
  let semEmail = 0;

  const emailAtivo = mailer.isEnabled();
  const motivoEmailInativo = emailAtivo ? '' : mailer.getDisabledReason();

  for (const linha of dados) {
    const demanda = sheetsService.mapRowToDemanda(linha);

    if (!demanda.demanda || shouldSkipStatus(demanda.status)) {
      continue;
    }

    avaliadas += 1;

    if (!demanda.email) {
      semEmail += 1;
      continue;
    }

    const assignmentHash = notificationRegistry.buildAssignmentHash(demanda);
    const jaEnviada = await notificationRegistry.assignmentAlreadySent(demanda.demanda, assignmentHash);

    if (jaEnviada) {
      ignoradas += 1;
      continue;
    }

    if (!emailAtivo) {
      falhas += 1;
      continue;
    }

    try {
      const result = await mailer.enviarNovaDemanda(demanda);
      if (result.sent) {
        enviadas += 1;
        await notificationRegistry.markAssignmentSent(demanda.demanda, assignmentHash);
      } else {
        falhas += 1;
      }
    } catch (error) {
      falhas += 1;
    }
  }

  return { avaliadas, enviadas, ignoradas, falhas, semEmail, emailAtivo, motivoEmailInativo };
}
