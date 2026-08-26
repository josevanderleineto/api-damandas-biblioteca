import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getUserFromRequest, findUserById, sanitizeUser, generateToken } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const userPayload = await getUserFromRequest(req);
    if (!userPayload) {
      return NextResponse.json({ ok: false, erro: 'Usuário não autenticado.' }, { status: 401 });
    }

    if (userPayload.id === 'root') {
      return NextResponse.json({ ok: false, erro: 'Altere a senha do usuário root nas variáveis de ambiente.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const senhaAtual = String(body?.senhaAtual || body?.senha || '').trim();
    const novaSenha = String(body?.novaSenha || body?.senhaNova || '').trim();

    if (!senhaAtual || !novaSenha) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: senhaAtual e novaSenha.' }, { status: 400 });
    }

    if (novaSenha.length < 6) {
      return NextResponse.json({ ok: false, erro: 'Nova senha deve ter ao menos 6 caracteres.' }, { status: 400 });
    }

    const user = await findUserById(userPayload.id);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Usuário não encontrado.' }, { status: 404 });
    }

    const valid = await bcrypt.compare(senhaAtual, user.senha_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, erro: 'Senha atual incorreta.' }, { status: 400 });
    }

    if (await bcrypt.compare(novaSenha, user.senha_hash)) {
      return NextResponse.json({ ok: false, erro: 'A nova senha não pode ser igual à atual.' }, { status: 400 });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    const updated = await query(
      `UPDATE users
          SET senha_hash = $1,
              updated_at = NOW()
        WHERE id = $2
      RETURNING id, nome, email, matricula, role, ativo, created_at`,
      [senhaHash, userPayload.id]
    );

    const userSanitized = sanitizeUser(updated.rows[0]);
    const token = generateToken(userSanitized);

    return NextResponse.json({ ok: true, mensagem: 'Senha alterada com sucesso.', token, user: userSanitized });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
