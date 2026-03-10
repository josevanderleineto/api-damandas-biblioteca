const sheetsService = require('../services/sheetsService');
const gerarId = require('../utils/gerarId');
const notificationService = require('../services/notificationService');
const reminderService = require('../services/reminderService');
const db = require('../db/pool');

function normalize(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function parseDateBrToDate(dateBr) {
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

function isValidPrazo(dateBr) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(dateBr || '').trim()) && !!parseDateBrToDate(dateBr);
}

function pick(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]).trim();
    }
  }
  return '';
}

function normalizarPayload(body = {}) {
  return {
    responsavel: pick(body, ['responsavel', 'Responsável', 'responsavelNome']),
    descricao: pick(body, ['descricao', 'descrição', 'Descrição da Demanda', 'descricaoDemanda']),
    matricula: pick(body, ['matricula', 'Matrícula']),
    email: pick(body, ['email', 'Email']),
    prazo: pick(body, ['prazo', 'Prazo']),
    status: pick(body, ['status', 'Status']),
    prioridade: pick(body, ['prioridade', 'Prioridade']),
    conclusao: pick(body, ['conclusao', 'Conclusão']),
    tempoExecucao: pick(body, ['tempoExecucao', 'Tempo de Execução', 'tempo_execucao']),
    alerta: pick(body, ['alerta', 'Alerta']),
  };
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapLinhaParaDemanda(linha) {
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

function isAdminRole(role) {
  return ['admin', 'root'].includes(normalize(role).toLowerCase());
}

function userCanAccessDemand(user, demanda) {
  if (!user || !demanda) return false;
  if (isAdminRole(user.role)) return true;
  return normalizeEmail(user.email) === normalizeEmail(demanda.email);
}

function collaboratorAllowedUpdate(dados) {
  return {
    status: dados.status,
    conclusao: dados.conclusao,
    tempoExecucao: dados.tempoExecucao,
  };
}

exports.listar = async (req, res) => {
  try {
    const linhas = await sheetsService.listar();

    if (!linhas || linhas.length === 0) {
      return res.json([]);
    }

    const [cabecalho, ...dados] = linhas;
    let resultado = dados.map(mapLinhaParaDemanda);

    if (!isAdminRole(req.user.role)) {
      const email = normalizeEmail(req.user.email);
      resultado = resultado.filter((d) => normalizeEmail(d.email) === email);
    }

    return res.json({ cabecalho, total: resultado.length, dados: resultado });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const demanda = await sheetsService.buscarPorId(id);

    if (!demanda) {
      return res.status(404).json({ ok: false, erro: `Demanda "${id}" não encontrada.` });
    }

    if (!userCanAccessDemand(req.user, demanda)) {
      return res.status(403).json({ ok: false, erro: 'Acesso negado a esta demanda.' });
    }

    return res.json({ ok: true, demanda });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.criar = async (req, res) => {
  try {
    const dados = normalizarPayload(req.body || {});

    if (!dados.responsavel || !dados.descricao || !dados.prazo) {
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: responsavel, descricao, prazo (dd/mm/aaaa).' });
    }

    if (!isValidPrazo(dados.prazo)) {
      return res.status(400).json({ ok: false, erro: 'Prazo inválido. Use formato dd/mm/aaaa.' });
    }

    if (!isValidEmail(dados.email)) {
      return res.status(400).json({ ok: false, erro: 'Email inválido.' });
    }

    const linhas = await sheetsService.listar();
    const dadosSemCabecalho = linhas.length > 0 ? linhas.slice(1) : [];

    const id = gerarId(dadosSemCabecalho);
    const dataCriacao = new Date().toLocaleDateString('pt-BR');

    const prazoDate = parseDateBrToDate(dados.prazo);
    const alerta = prazoDate && new Date() > prazoDate ? '🔴ATRASADO' : '';

    const linha = [
      id,
      dados.responsavel,
      dados.descricao,
      dados.matricula,
      dados.email,
      dataCriacao,
      dados.prazo,
      dados.status || 'Pendente',
      dados.prioridade,
      dados.conclusao,
      dados.tempoExecucao,
      dados.alerta || alerta,
    ];

    const insertResult = await sheetsService.inserir(linha);

    let notificacao = { sent: false, reason: 'Email não informado.' };
    if (dados.email) {
      try {
        notificacao = await notificationService.enviarNovaDemanda(mapLinhaParaDemanda(linha));
      } catch (error) {
        notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
      }
    }

    return res.status(201).json({ ok: true, id, rowNumber: insertResult.rowNumber, dataCriacao, notificacao });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const dadosRaw = normalizarPayload(req.body || {});

    const demandaAtual = await sheetsService.buscarPorId(id);
    if (!demandaAtual) {
      return res.status(404).json({ ok: false, erro: `Demanda "${id}" não encontrada.` });
    }

    if (!userCanAccessDemand(req.user, demandaAtual)) {
      return res.status(403).json({ ok: false, erro: 'Acesso negado a esta demanda.' });
    }

    const dados = !isAdminRole(req.user.role)
      ? collaboratorAllowedUpdate(dadosRaw)
      : dadosRaw;

    if (dados.prazo && !isValidPrazo(dados.prazo)) {
      return res.status(400).json({ ok: false, erro: 'Prazo inválido. Use formato dd/mm/aaaa.' });
    }

    if (dados.email && !isValidEmail(dados.email)) {
      return res.status(400).json({ ok: false, erro: 'Email inválido.' });
    }

    const result = await sheetsService.atualizar(id, dados);
    const demandaAtualizada = await sheetsService.buscarPorId(id);

    let notificacao = { sent: false, reason: 'Email não informado.' };
    if (demandaAtualizada?.email) {
      try {
        notificacao = await notificationService.enviarAtualizacaoDemanda(demandaAtualizada);
      } catch (error) {
        notificacao = { sent: false, reason: `Falha no envio: ${error.message}` };
      }
    }

    return res.status(200).json({ ok: true, ...result, notificacao });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.remover = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sheetsService.remover(id);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error.message.includes('não encontrada')) {
      return res.status(404).json({ ok: false, erro: error.message });
    }
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.executarLembretes = async (req, res) => {
  try {
    const result = await reminderService.executarLembretesPrazo();
    return res.status(200).json({
      ok: true,
      emailAtivo: notificationService.isEnabled(),
      motivoEmailInativo: notificationService.isEnabled() ? '' : notificationService.getDisabledReason(),
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.testarSMTP = async (req, res) => {
  try {
    const verify = await notificationService.testarConexaoSMTP();
    if (!verify.ok) return res.status(400).json({ ok: false, erro: verify.reason });
    return res.status(200).json({ ok: true, mensagem: 'Conexão SMTP validada com sucesso.' });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: `Falha na conexão SMTP: ${error.message}` });
  }
};

exports.testarEnvio = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ ok: false, erro: 'Informe o campo email no body.' });

    const result = await notificationService.enviarTesteDireto(email);
    return res.status(200).json({ ok: true, envio: result });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: `Falha no teste de envio: ${error.message}` });
  }
};

exports.solicitarProrrogacao = async (req, res) => {
  try {
    if (isAdminRole(req.user.role)) {
      return res.status(403).json({ ok: false, erro: 'Apenas colaboradores podem solicitar prorrogação.' });
    }

    const demandaId = normalize(req.params?.id);
    const prazoSolicitado = normalize(req.body?.prazoSolicitado);
    const motivo = normalize(req.body?.motivo);

    if (!demandaId || !prazoSolicitado || !motivo) {
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: prazoSolicitado, motivo.' });
    }

    if (!isValidPrazo(prazoSolicitado)) {
      return res.status(400).json({ ok: false, erro: 'prazoSolicitado inválido. Use dd/mm/aaaa.' });
    }

    const demanda = await sheetsService.buscarPorId(demandaId);
    if (!demanda) {
      return res.status(404).json({ ok: false, erro: 'Demanda não encontrada.' });
    }

    if (!userCanAccessDemand(req.user, demanda)) {
      return res.status(403).json({ ok: false, erro: 'Você só pode solicitar prorrogação para suas demandas.' });
    }

    const result = await db.query(
      `INSERT INTO prazo_requests (
         demanda_id, requester_user_id, requester_email,
         prazo_atual, prazo_solicitado, motivo
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, demanda_id, prazo_atual, prazo_solicitado, motivo, status, created_at`,
      [demandaId, req.user.id, normalizeEmail(req.user.email), demanda.prazo || '', prazoSolicitado, motivo]
    );

    return res.status(201).json({ ok: true, solicitacao: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.listarSolicitacoesProrrogacao = async (req, res) => {
  try {
    const onlyPending = String(req.query?.pending || '').toLowerCase() === 'true';

    const query = onlyPending
      ? `SELECT id, demanda_id, requester_email, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at
           FROM prazo_requests
          WHERE status = 'pending'
          ORDER BY created_at DESC`
      : `SELECT id, demanda_id, requester_email, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at
           FROM prazo_requests
          ORDER BY created_at DESC`;

    const result = await db.query(query);

    return res.json({ ok: true, total: result.rows.length, dados: result.rows });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.decidirSolicitacaoProrrogacao = async (req, res) => {
  try {
    const requestId = Number.parseInt(req.params?.requestId, 10);
    const status = normalize(req.body?.status).toLowerCase();
    const adminNote = normalize(req.body?.adminNote);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ ok: false, erro: 'requestId inválido.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, erro: 'status inválido. Use approved ou rejected.' });
    }

    const find = await db.query(
      `SELECT id, demanda_id, prazo_solicitado, status
         FROM prazo_requests
        WHERE id = $1`,
      [requestId]
    );

    const reqRow = find.rows[0];
    if (!reqRow) {
      return res.status(404).json({ ok: false, erro: 'Solicitação não encontrada.' });
    }

    if (reqRow.status !== 'pending') {
      return res.status(409).json({ ok: false, erro: 'Solicitação já foi decidida.' });
    }

    if (status === 'approved') {
      await sheetsService.atualizar(reqRow.demanda_id, {
        prazo: reqRow.prazo_solicitado,
      });
    }

    const updated = await db.query(
      `UPDATE prazo_requests
          SET status = $1,
              admin_note = $2,
              decided_by = $3,
              decided_at = NOW()
        WHERE id = $4
      RETURNING id, demanda_id, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at`,
      [status, adminNote || null, req.user.id, requestId]
    );

    return res.json({ ok: true, solicitacao: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};
