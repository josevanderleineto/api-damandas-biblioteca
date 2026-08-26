import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { normalize, normalizeEmail } from '@/lib/utils';
import { isRootCredentials, getRootLogin, generateToken, findUserByEmail, sanitizeUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const login = normalize(body?.email || body?.login);
    const senha = String(body?.senha || '');

    if (!login || !senha) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: login/email, senha.' }, { status: 400 });
    }

    if (isRootCredentials(login, senha)) {
      const rootUser = {
        id: 'root',
        nome: 'Root Sistema',
        email: getRootLogin(),
        matricula: '',
        role: 'root',
        ativo: true,
      };
      const token = generateToken(rootUser);
      return NextResponse.json({ ok: true, user: rootUser, token });
    }

    const user = await findUserByEmail(login);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Credenciais inválidas.' }, { status: 401 });
    }

    if (!user.ativo) {
      return NextResponse.json({ ok: false, erro: 'Usuário inativo. Contate o administrador.' }, { status: 403 });
    }

    const valid = await bcrypt.compare(senha, user.senha_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, erro: 'Credenciais inválidas.' }, { status: 401 });
    }

    const token = generateToken(user);
    return NextResponse.json({ ok: true, user: sanitizeUser(user), token });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
