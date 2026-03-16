const sheetsService = require('./sheetsService');
const notificationService = require('./notificationService');
const notificationRegistry = require('./notificationRegistryService');

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function shouldSkipStatus(status) {
  const s = normalize(status);
  return s.includes('conclu') || s.includes('finaliz');
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

function formatDateTimeLocal(date) {
  return date.toLocaleString('pt-BR');
}

function getIntervalMinutes() {
  const raw = Number.parseInt(process.env.ASSIGNMENT_SYNC_INTERVAL_MINUTES || '1', 10);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return 1;
}

async function verificarAtribuicoesPendentes() {
  const linhas = await sheetsService.listar();
  const dados = linhas.length > 1 ? linhas.slice(1) : [];

  let avaliadas = 0;
  let enviadas = 0;
  let ignoradas = 0;
  let falhas = 0;
  let semEmail = 0;

  const emailAtivo = notificationService.isEnabled();
  const motivoEmailInativo = emailAtivo ? '' : notificationService.getDisabledReason();

  for (const linha of dados) {
    const demanda = mapLinhaParaDemanda(linha);

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
      // Mantém pendente para a próxima execução quando o SMTP estiver configurado.
      falhas += 1;
      continue;
    }

    try {
      const result = await notificationService.enviarNovaDemanda(demanda);
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

function iniciarMonitorAtribuicoes() {
  const intervalMinutes = getIntervalMinutes();

  const agendarProxima = () => {
    const delay = Math.max(30_000, intervalMinutes * 60 * 1000);
    const proximaExecucao = new Date(Date.now() + delay);
    console.log(`[atribuições] próximo ciclo: ${formatDateTimeLocal(proximaExecucao)} (a cada ${intervalMinutes} min)`);

    setTimeout(async () => {
      try {
        const r = await verificarAtribuicoesPendentes();
        console.log(`[atribuições] ciclo executado: avaliadas=${r.avaliadas}, enviadas=${r.enviadas}, ignoradas=${r.ignoradas}, falhas=${r.falhas}, semEmail=${r.semEmail}${r.emailAtivo ? '' : `, emailInativo=${r.motivoEmailInativo}`}`);
      } catch (error) {
        console.error(`[atribuições] falha no ciclo: ${error.message}`);
      } finally {
        agendarProxima();
      }
    }, delay);
  };

  // Executa imediatamente para cobrir novas linhas inseridas diretamente na planilha.
  verificarAtribuicoesPendentes()
    .then((r) => {
      console.log(`[atribuições] execução inicial: avaliadas=${r.avaliadas}, enviadas=${r.enviadas}, ignoradas=${r.ignoradas}, falhas=${r.falhas}, semEmail=${r.semEmail}${r.emailAtivo ? '' : `, emailInativo=${r.motivoEmailInativo}`}`);
    })
    .catch((error) => {
      console.error(`[atribuições] falha na execução inicial: ${error.message}`);
    })
    .finally(() => {
      agendarProxima();
    });
}

module.exports = {
  iniciarMonitorAtribuicoes,
  verificarAtribuicoesPendentes,
};
