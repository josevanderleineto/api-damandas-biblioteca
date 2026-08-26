import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import * as assignmentWatcherService from '@/lib/services/assignmentWatcherService';
import * as mailer from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const result = await assignmentWatcherService.verificarAtribuicoesPendentes();
    return NextResponse.json({
      ok: true,
      emailAtivo: mailer.isEnabled(),
      motivoEmailInativo: mailer.isEnabled() ? '' : mailer.getDisabledReason(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
