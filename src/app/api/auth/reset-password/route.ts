import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { normalize } from '@/lib/utils';
import { findUserById, sanitizeUser, generateToken } from '@/lib/auth';
import * as passwordResetService from '@/lib/services/passwordResetService';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = normalize(body?.token);
    const novaSenha = String(body?.senha || body?.novaSenha || '').trim();

    if (!token || !novaSenha) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: token e novaSenha.' }, { status: 400 });
    }

    if (novaSenha.length < 6) {
      return NextResponse.json({ ok: false, erro: 'Nova senha deve ter ao menos 6 caracteres.' }, { status: 400 });
    }

    const userId = await passwordResetService.consumeToken(token);
    if (!userId) {
      return NextResponse.json({ ok: false, erro: 'Token inválido ou expirado.' }, { status: 400 });
    }

    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado.' }, { status: 404 });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    const updated = await query(
      `UPDATE users
          SET senha_hash = $1,
              updated_at = NOW()
        WHERE id = $2
      RETURNING id, nome, email, matricula, role, ativo, created_at`,
      [senhaHash, userId]
    );

    const userSanitized = sanitizeUser(updated.rows[0]);
    const jwtToken = generateToken(userSanitized);

    return NextResponse.json({ ok: true, mensagem: 'Senha redefinida com sucesso.', token: jwtToken, user: userSanitized });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
