const jwt = require('jsonwebtoken');

function normalize(value) {
  return String(value || '').trim();
}

function getJwtSecret() {
  const secret = normalize(process.env.JWT_SECRET);
  if (!secret) {
    throw new Error('JWT_SECRET não configurado no ambiente.');
  }
  return secret;
}

function authenticateToken(req, res, next) {
  try {
    const authHeader = normalize(req.headers.authorization);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, erro: 'Token ausente.' });
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, getJwtSecret());

    req.user = {
      id: payload.sub,
      nome: payload.nome,
      email: payload.email,
      matricula: payload.matricula,
      role: payload.role,
    };

    return next();
  } catch (error) {
    const expired = error && error.name === 'TokenExpiredError';
    const msg = expired ? 'Token expirado. Faça login novamente.' : 'Token inválido ou expirado.';
    return res.status(401).json({ ok: false, erro: msg });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = normalize(req.user?.role).toLowerCase();
    const allowed = roles.map((r) => normalize(r).toLowerCase());

    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, erro: 'Acesso negado para este perfil.' });
    }
    return next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
};
