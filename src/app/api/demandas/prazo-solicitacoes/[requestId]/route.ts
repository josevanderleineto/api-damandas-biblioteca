import { NextResponse } from 'next/server';
import * as sheetsService from '@/lib/googleSheets';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { normalize } from '@/lib/utils';

export async function PATCH(req: Request, { params }: { params: { requestId: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const requestId = Number.parseInt(params?.requestId, 10);
    const body = await req.json().catch(() => ({}));
    const status = normalize(body?.status).toLowerCase();
    const adminNote = normalize(body?.adminNote);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ ok: false, erro: 'requestId inválido.' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ ok: false, erro: 'status inválido. Use approved ou rejected.' }, { status: 400 });
    }

    const find = await query(
      `SELECT id, demanda_id, prazo_solicitado, status
         FROM prazo_requests
        WHERE id = $1`,
      [requestId]
    );

    const reqRow = find.rows[0];
    if (!reqRow) {
      return NextResponse.json({ ok: false, erro: 'Solicitação não encontrada.' }, { status: 404 });
    }

    if (reqRow.status !== 'pending') {
      return NextResponse.json({ ok: false, erro: 'Solicitação já foi decidida.' }, { status: 409 });
    }

    if (status === 'approved') {
      await sheetsService.atualizar(reqRow.demanda_id, {
        prazo: reqRow.prazo_solicitado,
      });
    }

    const updated = await query(
      `UPDATE prazo_requests
          SET status = $1,
              admin_note = $2,
              decided_by = $3,
              decided_at = NOW()
        WHERE id = $4
      RETURNING id, demanda_id, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at`,
      [status, adminNote || null, user.id, requestId]
    );

    return NextResponse.json({ ok: true, solicitacao: updated.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
