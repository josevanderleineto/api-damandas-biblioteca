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

export function sanitizeUser(user: any): UserSanitized {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    matricula: user.matricula || '',
    role: user.role,
    ativo: user.ativo ?? true,
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
    `SELECT id, nome, email, matricula, senha_hash, role, ativo, created_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

export async function findUserById(id: string) {
  const result = await query(
    `SELECT id, nome, email, matricula, senha_hash, role, ativo, created_at
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
