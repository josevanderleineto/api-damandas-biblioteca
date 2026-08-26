import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import * as mailer from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const verify = await mailer.testarConexaoSMTP();
    if (!verify.ok) {
      return NextResponse.json({ ok: false, erro: verify.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mensagem: 'Conexão SMTP validada com sucesso.' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: `Falha na conexão SMTP: ${error.message}` }, { status: 500 });
  }
}
