import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export interface Demanda {
  demanda: string;
  responsavel: string;
  descricao: string;
  matricula: string;
  email: string;
  dataCriacao: string;
  prazo: string;
  status: string;
  prioridade: string;
  conclusao: string;
  tempoExecucao: string;
  alerta: string;
}

function loadGoogleCredentials() {
  const rawEnv = process.env.GOOGLE_CREDENTIALS_JSON;

  if (rawEnv && rawEnv.trim()) {
    try {
      return JSON.parse(rawEnv);
    } catch (error) {
      try {
        const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (error2) {
        throw new Error('GOOGLE_CREDENTIALS_JSON inválido. Informe um JSON válido (ou base64 de JSON).');
      }
    }
  }

  const candidateDirs = [
    process.env.APP_ENV_DIR,
    process.env.APP_USER_DATA_DIR,
    process.env.APP_EXE_DIR,
    process.env.APP_RESOURCES_DIR,
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ].filter(Boolean) as string[];

  for (const dir of candidateDirs) {
    const candidatePath = path.join(dir, 'credentials.json');
    if (!fs.existsSync(candidatePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    } catch (error) {
      throw new Error(`credentials.json inválido em: ${candidatePath}`);
    }
  }

  throw new Error('Credenciais do Google Sheets não encontradas. Configure GOOGLE_CREDENTIALS_JSON no ambiente.');
}

let sheetsClientInstance: any = null;

function getSheetsClient() {
  if (sheetsClientInstance) return sheetsClientInstance;

  const credentials = loadGoogleCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClientInstance = google.sheets({ version: 'v4', auth });
  return sheetsClientInstance;
}

function getSpreadsheetId(): string {
  const id = String(process.env.SPREADSHEET_ID || '').trim();
  if (!id) {
    throw new Error('SPREADSHEET_ID não configurado no ambiente.');
  }
  return id;
}

function getSheetName(): string {
  return String(process.env.SHEET_NAME || 'DEMANDAS').trim();
}

function quoteSheetName(name: string): string {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function normalize(value: any): string {
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

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

const ALERTA_ATRASADO = '🔴ATRASADO';
const ALERTA_NO_PRAZO = '🟢NO PRAZO';

export function mapRowToDemanda(row: any[]): Demanda {
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

async function getSheetTitleByName(name: string): Promise<string> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  const titles = (meta.data.sheets || [])
    .map((s: any) => s.properties?.title)
    .filter(Boolean);

  const target = titles.find((t: string) => normalize(t) === normalize(name));
  if (!target) {
    throw new Error(`Aba "${name}" não encontrada. Abas disponíveis: ${titles.join(', ')}`);
  }

  return target;
}

async function getSheetTitleOrThrow(name = getSheetName()): Promise<string> {
  return getSheetTitleByName(name);
}

export async function listar(): Promise<string[][]> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetTitle = await getSheetTitleOrThrow();
  const range = `${quoteSheetName(sheetTitle)}!A1:L1000`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

async function findFirstEmptyRowNumber(sheetTitle: string): Promise<number> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

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

async function writeFullRow(sheetTitle: string, rowNumber: number, values: any[]) {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
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

export async function inserir(linha: any[]) {
  const sheetTitle = await getSheetTitleOrThrow();
  const targetRowNumber = await findFirstEmptyRowNumber(sheetTitle);

  await writeFullRow(sheetTitle, targetRowNumber, linha);

  return { rowNumber: targetRowNumber };
}

export async function findRowByDemandaId(demandaId: string) {
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

export async function buscarPorId(demandaId: string): Promise<Demanda | null> {
  const found = await findRowByDemandaId(demandaId);
  if (!found) return null;
  return mapRowToDemanda(found.row);
}

export async function atualizar(demandaId: string, dados: Partial<Demanda>) {
  const found = await findRowByDemandaId(demandaId);
  if (!found) {
    throw new Error(`Demanda "${demandaId}" não encontrada.`);
  }

  const atual = mapRowToDemanda(found.row);

  const novoPrazo = dados.prazo ?? atual.prazo;
  const prazoDate = parseDateBr(novoPrazo);

  let alerta = dados.alerta;
  if (typeof alerta === 'undefined') {
    if (prazoDate) {
      const prazoLimite = endOfDay(prazoDate);
      if (new Date() > prazoLimite) {
        alerta = ALERTA_ATRASADO;
      } else {
        alerta = atual.alerta || ALERTA_NO_PRAZO;
      }
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

export async function remover(demandaId: string) {
  const found = await findRowByDemandaId(demandaId);
  if (!found) {
    throw new Error(`Demanda "${demandaId}" não encontrada.`);
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetTitle = await getSheetTitleOrThrow();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });

  const targetSheet = (meta.data.sheets || []).find(
    (s: any) => normalize(s.properties?.title) === normalize(sheetTitle)
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
