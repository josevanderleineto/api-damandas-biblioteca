import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db';
import { normalize, normalizeEmail } from './utils';

export interface UserTokenPayload {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  role: 'admin' | 'colaborador' | 'root';
}

export interface UserSanitized {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  role: 'admin' | 'colaborador' | 'root';
  ativo: boolean;
  ausente: boolean;
  ausenteTipo?: string | null;
  ausenteInicio?: string | null;
  ausenteFim?: string | null;
  ausenteMotivo?: string | null;
  createdAt: string;
}

export function getJwtSecret(): string {
  const secret = normalize(process.env.JWT_SECRET);
  if (!secret) {
    throw new Error('JWT_SECRET não configurado no ambiente.');
  }
  return secret;
}

export function getJwtExpiresIn(): string {
  return normalize(process.env.JWT_EXPIRES_IN) || '8h';
}

export function getRootLogin(): string {
  return normalize(process.env.ROOT_LOGIN);
}

export function getRootPassword(): string {
  return normalize(process.env.ROOT_PASSWORD);
}

export function rootEnabled(): boolean {
  return !!(getRootLogin() && getRootPassword());
}

export function isRootCredentials(login: string, senha: string): boolean {
  return rootEnabled() && normalize(login) === getRootLogin() && normalize(senha) === getRootPassword();
}

function formatDateIsoOnly(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return str;
}

export function sanitizeUser(user: any): UserSanitized {
  return {
    id: String(user.id),
    nome: user.nome,
    email: user.email,
    matricula: user.matricula || '',
    role: user.role,
    ativo: user.ativo ?? true,
    ausente: !!user.ausente,
    ausenteTipo: user.ausente_tipo || user.ausenteTipo || null,
    ausenteInicio: formatDateIsoOnly(user.ausente_inicio || user.ausenteInicio),
    ausenteFim: formatDateIsoOnly(user.ausente_fim || user.ausenteFim),
    ausenteMotivo: user.ausente_motivo || user.ausenteMotivo || null,
    createdAt: user.created_at || user.createdAt || new Date().toISOString(),
  };
}

export function generateToken(user: { id: string; nome: string; email: string; matricula?: string; role: string }): string {
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
      expiresIn: getJwtExpiresIn() as any,
    }
  );
}

export function verifyToken(token: string): UserTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    return {
      id: decoded.sub || decoded.id,
      nome: decoded.nome,
      email: decoded.email,
      matricula: decoded.matricula || '',
      role: decoded.role,
    };
  } catch (err) {
    return null;
  }
}

export async function findUserByEmail(email: string) {
  const result = await query(
    `SELECT id, nome, email, matricula, senha_hash, role, ativo,
            ausente, ausente_tipo, ausente_inicio, ausente_fim, ausente_motivo, created_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

export async function findUserById(id: string) {
  const result = await query(
    `SELECT id, nome, email, matricula, senha_hash, role, ativo,
            ausente, ausente_tipo, ausente_inicio, ausente_fim, ausente_motivo, created_at
       FROM users
      WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getUserFromRequest(req: Request): Promise<UserTokenPayload | null> {
  const authHeader = req.headers.get('authorization') || '';
  let token = '';

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    // suporte opcional a cookie ou query param
    const url = new URL(req.url);
    token = url.searchParams.get('token') || '';
  }

  if (!token) return null;
  return verifyToken(token);
}
