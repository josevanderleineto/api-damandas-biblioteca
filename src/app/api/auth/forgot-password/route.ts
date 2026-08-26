import { NextResponse } from 'next/server';
import { normalize, normalizeEmail } from '@/lib/utils';
import { findUserByEmail } from '@/lib/auth';
import * as passwordResetService from '@/lib/services/passwordResetService';
import * as mailer from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!email) {
      return NextResponse.json({ ok: false, erro: 'Email obrigatório.' }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.ativo) {
      return NextResponse.json({ ok: true, mensagem: 'Se o email estiver cadastrado, enviaremos as instruções.' });
    }

    const { token, expiresAt } = await passwordResetService.createTokenForUser(user.id, 60);
    let resetUrlBase = normalize(process.env.PASSWORD_RESET_URL || process.env.APP_URL || '');
    if (resetUrlBase && !resetUrlBase.includes('/reset-password') && resetUrlBase === process.env.APP_URL) {
      resetUrlBase = `${resetUrlBase}/reset-password`;
    }

    let envio: any = { sent: false, reason: mailer.getDisabledReason() };
    try {
      envio = await mailer.enviarResetSenha({
        email: user.email,
        nome: user.nome,
        token,
        expiresAt,
        resetUrlBase,
      });
    } catch (error: any) {
      envio = { sent: false, reason: `Falha no envio: ${error.message}` };
    }

    return NextResponse.json({
      ok: true,
      mensagem: 'Se o email estiver cadastrado, enviaremos as instruções.',
      envio,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
