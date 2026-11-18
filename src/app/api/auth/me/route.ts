import { NextResponse } from 'next/server';
import { getUserFromRequest, findUserById, sanitizeUser, getRootLogin } from '@/lib/auth';

export async function GET(req: Request) {
  const userToken = await getUserFromRequest(req);
  if (!userToken) {
    return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
  }

  if (userToken.id === 'root') {
    return NextResponse.json({
      ok: true,
      user: {
        id: 'root',
        nome: userToken.nome || 'Root Sistema',
        email: userToken.email || getRootLogin(),
        matricula: '',
        role: 'root',
        ativo: true,
      },
    });
  }

  const dbUser = await findUserById(userToken.id);
  if (dbUser) {
    return NextResponse.json({ ok: true, user: sanitizeUser(dbUser) });
  }

  return NextResponse.json({ ok: true, user: userToken });
}
