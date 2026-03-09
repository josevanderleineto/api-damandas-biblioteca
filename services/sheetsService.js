const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function loadGoogleCredentials() {
  const rawEnv = process.env.GOOGLE_CREDENTIALS_JSON;

  if (rawEnv && rawEnv.trim()) {
    try {
      return JSON.parse(rawEnv);
    } catch (error) {
      // suporte opcional: valor em base64
      try {
        const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (error2) {
        throw new Error('GOOGLE_CREDENTIALS_JSON inválido. Informe um JSON válido (ou base64 de JSON).');
      }
    }
  }

  const localPath = path.resolve(__dirname, '../credentials.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }

  throw new Error('Credenciais do Google Sheets não encontradas. Configure GOOGLE_CREDENTIALS_JSON no ambiente.');
}

const credentials = loadGoogleCredentials();

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const spreadsheetId = String(process.env.SPREADSHEET_ID || '').trim();
const SHEET_NAME = String(process.env.SHEET_NAME || 'DEMANDAS').trim();

if (!spreadsheetId) {
  throw new Error('SPREADSHEET_ID não configurado no .env');
}

function quoteSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function toIsoDateBr(dateBr) {
  if (!dateBr || typeof dateBr !== 'string') return null;
  const [dd, mm, yyyy] = dateBr.split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function mapRowToDemanda(row) {
  return {
    demanda: row[0] || '',
    responsavel: row[1] || '',
    descricao: row[2] || '',
    matricula: row[3] || '',
    email: row[4] || '',
    dataCriacao: row[5] || '',
    prazo: row[6] || '',
    status: row[7] || '',
    prioridade: row[8] || '',
    conclusao: row[9] || '',
    tempoExecucao: row[10] || '',
    alerta: row[11] || '',
  };
}

async function getSheetTitleOrThrow() {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const titles = (meta.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);

  const found = titles.find((t) => normalize(t) === normalize(SHEET_NAME));
  if (!found) {
    throw new Error(`Aba "${SHEET_NAME}" não encontrada. Abas disponíveis: ${titles.join(', ')}`);
  }

  return found;
}

async function listar() {
  const sheetTitle = await getSheetTitleOrThrow();
  const range = `${quoteSheetName(sheetTitle)}!A1:L1000`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

async function findFirstEmptyRowNumber(sheetTitle) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetName(sheetTitle)}!A2:A1000`,
  });

  const ids = response.data.values || [];

  for (let i = 0; i < 999; i += 1) {
    const value = ids[i]?.[0] || '';
    if (normalize(value) === '') {
      return i + 2;
    }
  }

  return 1001;
}

async function writeFullRow(sheetTitle, rowNumber, values) {
  const range = `${quoteSheetName(sheetTitle)}!A${rowNumber}:L${rowNumber}`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [values],
    },
  });
}

async function inserir(linha) {
  const sheetTitle = await getSheetTitleOrThrow();
  const targetRowNumber = await findFirstEmptyRowNumber(sheetTitle);

  await writeFullRow(sheetTitle, targetRowNumber, linha);

  return { rowNumber: targetRowNumber };
}

async function findRowByDemandaId(demandaId) {
  const rows = await listar();

  if (rows.length <= 1) {
    return null;
  }

  for (let i = 1; i < rows.length; i += 1) {
    const id = rows[i][0];
    if (normalize(id) === normalize(demandaId)) {
      return {
        rowNumber: i + 1,
        row: rows[i],
      };
    }
  }

  return null;
}

async function buscarPorId(demandaId) {
  const found = await findRowByDemandaId(demandaId);
  if (!found) return null;
  return mapRowToDemanda(found.row);
}

async function atualizar(demandaId, dados) {
  const found = await findRowByDemandaId(demandaId);
  if (!found) {
    throw new Error(`Demanda "${demandaId}" não encontrada.`);
  }

  const atual = mapRowToDemanda(found.row);

  const novoPrazo = dados.prazo ?? atual.prazo;
  const prazoIso = toIsoDateBr(novoPrazo);

  let alerta = dados.alerta;
  if (typeof alerta === 'undefined') {
    if (prazoIso && new Date() > new Date(prazoIso)) {
      alerta = '🔴ATRASADO';
    } else {
      alerta = atual.alerta;
    }
  }

  const linhaAtualizada = [
    demandaId,
    dados.responsavel ?? atual.responsavel,
    dados.descricao ?? atual.descricao,
    dados.matricula ?? atual.matricula,
    dados.email ?? atual.email,
    dados.dataCriacao ?? atual.dataCriacao,
    novoPrazo,
    dados.status ?? atual.status,
    dados.prioridade ?? atual.prioridade,
    dados.conclusao ?? atual.conclusao,
    dados.tempoExecucao ?? atual.tempoExecucao,
    alerta ?? '',
  ];

  const sheetTitle = await getSheetTitleOrThrow();
  await writeFullRow(sheetTitle, found.rowNumber, linhaAtualizada);

  return { demandaId, rowNumber: found.rowNumber };
}

async function remover(demandaId) {
  const found = await findRowByDemandaId(demandaId);
  if (!found) {
    throw new Error(`Demanda "${demandaId}" não encontrada.`);
  }

  const sheetTitle = await getSheetTitleOrThrow();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });

  const targetSheet = (meta.data.sheets || []).find(
    (s) => normalize(s.properties?.title) === normalize(sheetTitle)
  );

  if (!targetSheet || typeof targetSheet.properties?.sheetId !== 'number') {
    throw new Error('Não foi possível identificar o sheetId da aba.');
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: targetSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: found.rowNumber - 1,
              endIndex: found.rowNumber,
            },
          },
        },
      ],
    },
  });

  return { demandaId, rowNumber: found.rowNumber };
}

module.exports = {
  listar,
  inserir,
  buscarPorId,
  atualizar,
  remover,
};
