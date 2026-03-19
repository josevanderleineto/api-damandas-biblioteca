const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/pool');

function normalize(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function getJwtSecret() {
  const secret = normalize(process.env.JWT_SECRET);
  if (!secret) {
    throw new Error('JWT_SECRET não configurado no ambiente.');
  }
  return secret;
}

function getJwtExpiresIn() {
  return normalize(process.env.JWT_EXPIRES_IN) || '8h';
}

function getRootLogin() {
  return normalize(process.env.ROOT_LOGIN);
}

function getRootPassword() {
  return normalize(process.env.ROOT_PASSWORD);
}

function rootEnabled() {
  return !!(getRootLogin() && getRootPassword());
}

function isRootCredentials(login, senha) {
  return rootEnabled() && normalize(login) === getRootLogin() && normalize(senha) === getRootPassword();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    matricula: user.matricula,
    role: user.role,
    ativo: user.ativo,
    createdAt: user.created_at,
  };
}

async function findUserByEmail(email) {
  const result = await db.query(
    `SELECT id, nome, email, matricula, senha_hash, role, ativo, created_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

function generateToken(user) {
  return jwt.sign(
    {
      nome: user.nome,
      email: user.email,
      matricula: user.matricula || '',
      role: user.role,
    },
    getJwtSecret(),
    {
      subject: user.id,
      expiresIn: getJwtExpiresIn(),
    }
  );
}

exports.login = async (req, res) => {
  try {
    const login = normalize(req.body?.email || req.body?.login);
    const senha = String(req.body?.senha || '');

    if (!login || !senha) {
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: login/email, senha.' });
    }

    if (isRootCredentials(login, senha)) {
      const rootUser = {
        id: 'root',
        nome: 'Root Sistema',
        email: getRootLogin(),
        matricula: '',
        role: 'root',
      };
      const token = generateToken(rootUser);
      return res.json({ ok: true, user: rootUser, token });
    }

    const user = await findUserByEmail(login);
    if (!user) {
      return res.status(401).json({ ok: false, erro: 'Credenciais inválidas.' });
    }

    if (!user.ativo) {
      return res.status(403).json({ ok: false, erro: 'Usuário inativo. Contate o administrador.' });
    }

    const valid = await bcrypt.compare(senha, user.senha_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, erro: 'Credenciais inválidas.' });
    }

    const token = generateToken(user);

    return res.json({ ok: true, user: sanitizeUser(user), token });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.me = async (req, res) => {
  return res.json({ ok: true, user: req.user });
};

exports.listarUsuarios = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, nome, email, matricula, role, ativo, created_at
         FROM users
        ORDER BY created_at DESC`
    );

    return res.json({ ok: true, total: result.rows.length, dados: result.rows.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.criarUsuario = async (req, res) => {
  try {
    const nome = normalize(req.body?.nome);
    const email = normalizeEmail(req.body?.email);
    const matriculaRaw = req.body?.matricula;
    const matricula = typeof matriculaRaw === 'string' ? matriculaRaw : String(matriculaRaw || '');
    const senha = String(req.body?.senha || '');
    const role = normalize(req.body?.role || 'colaborador').toLowerCase();

    if (!nome || !email || !senha || !matricula || !matricula.trim()) {
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: nome, email, matricula, senha.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, erro: 'Email inválido.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ ok: false, erro: 'Senha deve ter ao menos 6 caracteres.' });
    }

    if (!['admin', 'colaborador'].includes(role)) {
      return res.status(400).json({ ok: false, erro: 'Role inválida. Use admin ou colaborador.' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ ok: false, erro: 'Já existe usuário com este email.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await db.query(
      `INSERT INTO users (nome, email, matricula, senha_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, matricula, role, ativo, created_at`,
      [nome, email, matricula, senhaHash, role]
    );

    return res.status(201).json({ ok: true, user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.alterarStatusUsuario = async (req, res) => {
  try {
    const userId = normalize(req.params?.id);
    const ativo = !!req.body?.ativo;

    if (!userId) {
      return res.status(400).json({ ok: false, erro: 'ID de usuário obrigatório.' });
    }

    const result = await db.query(
      `UPDATE users
          SET ativo = $1,
              updated_at = NOW()
        WHERE id = $2
      RETURNING id, nome, email, role, ativo, created_at`,
      [ativo, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, erro: 'Usuário não encontrado.' });
    }

    return res.json({ ok: true, user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.atualizarUsuario = async (req, res) => {
  try {
    const userId = normalize(req.params?.id);
    const nome = normalize(req.body?.nome);
    const email = normalizeEmail(req.body?.email);
    const matriculaRaw = req.body?.matricula;
    const matricula = typeof matriculaRaw === 'string' ? matriculaRaw : String(matriculaRaw || '');
    const role = normalize(req.body?.role || 'colaborador').toLowerCase();
    const senha = String(req.body?.senha || '').trim();

    if (!userId) {
      return res.status(400).json({ ok: false, erro: 'ID de usuário obrigatório.' });
    }

    if (!nome || !email || !matricula || !matricula.trim()) {
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: nome, email, matricula.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, erro: 'Email inválido.' });
    }

    if (!['admin', 'colaborador'].includes(role)) {
      return res.status(400).json({ ok: false, erro: 'Role inválida. Use admin ou colaborador.' });
    }

    if (senha && senha.length < 6) {
      return res.status(400).json({ ok: false, erro: 'Senha deve ter ao menos 6 caracteres.' });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail && existingEmail.id !== userId) {
      return res.status(409).json({ ok: false, erro: 'Já existe usuário com este email.' });
    }

    const senhaHash = senha ? await bcrypt.hash(senha, 10) : null;

    const result = await db.query(
      `UPDATE users
          SET nome = $1,
              email = $2,
              matricula = $3,
              role = $4,
              ${senhaHash ? 'senha_hash = $5,' : ''}
              updated_at = NOW()
        WHERE id = $6
      RETURNING id, nome, email, matricula, role, ativo, created_at`,
      senhaHash ? [nome, email, matricula, role, senhaHash, userId] : [nome, email, matricula, role, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, erro: 'Usuário não encontrado.' });
    }

    return res.json({ ok: true, user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};

exports.removerUsuario = async (req, res) => {
  try {
    const userId = normalize(req.params?.id);
    if (!userId) return res.status(400).json({ ok: false, erro: 'ID obrigatório.' });

    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, erro: 'Usuário não encontrado.' });
    }

    return res.json({ ok: true, removido: userId });
  } catch (error) {
    if (error.message && error.message.includes('prazo_requests')) {
      return res.status(409).json({ ok: false, erro: 'Usuário possui solicitações vinculadas. Desative-o em vez de excluir.' });
    }
    return res.status(500).json({ ok: false, erro: error.message });
  }
};
