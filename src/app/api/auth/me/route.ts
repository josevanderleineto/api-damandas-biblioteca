import { NextResponse } from 'next/server';
import { getUserFromRequest, findUserById, sanitizeUser } from '@/lib/auth';

export async function GET(req: Request) {
  const userToken = await getUserFromRequest(req);
  if (!userToken) {
    return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
  }

  const dbUser = await findUserById(userToken.id);
  if (dbUser) {
    return NextResponse.json({ ok: true, user: sanitizeUser(dbUser) });
  }

  return NextResponse.json({ ok: true, user: userToken });
}
