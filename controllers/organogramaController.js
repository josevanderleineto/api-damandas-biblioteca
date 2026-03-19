const sheetsService = require('../services/sheetsService');

function normalize(value) {
  return String(value || '').normalize('NFKC').trim();
}

function normalizeKey(value) {
  return normalize(value).toLowerCase();
}

function findIndex(headers, keys) {
  const normalized = headers.map((h) => normalizeKey(h));
  for (const key of keys) {
    const idx = normalized.indexOf(key);
    if (idx !== -1) return idx;
  }
  return -1;
}

function mapRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headers = rows[0] || [];

  const idxNome = findIndex(headers, ['nome', 'colaborador']);
  const idxCargo = findIndex(headers, ['cargo', 'função', 'funcao', 'posição', 'posicao']);
  const idxSuperior = findIndex(headers, ['superior', 'gestor', 'chefe', 'chefia', 'reporta a', 'responde a', 'pai']);

  return rows.slice(1).map((row) => ({
    nome: idxNome >= 0 ? normalize(row[idxNome]) : normalize(row[0]),
    cargo: idxCargo >= 0 ? normalize(row[idxCargo]) : normalize(row[1]),
    superior: idxSuperior >= 0 ? normalize(row[idxSuperior]) : normalize(row[2]),
  }));
}

function buildTree(items) {
  const nodes = new Map();

  items
    .filter((i) => i.nome)
    .forEach((item) => {
      const key = normalizeKey(item.nome);
      nodes.set(key, { ...item, filhos: [] });
    });

  const roots = [];

  nodes.forEach((node) => {
    const supKey = normalizeKey(node.superior);
    const parent = supKey && nodes.get(supKey);
    if (parent && parent !== node) {
      parent.filhos.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

exports.listar = async (req, res) => {
  try {
    const rows = await sheetsService.listarOrganograma();
    const items = mapRows(rows).filter((i) => i.nome);
    const roots = buildTree(items);
    return res.json({ ok: true, dados: { roots } });
  } catch (error) {
    return res.status(500).json({ ok: false, erro: error.message });
  }
};
