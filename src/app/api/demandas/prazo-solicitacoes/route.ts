import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || !['admin', 'root'].includes(user.role)) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const onlyPending = searchParams.get('pending') === 'true';

    const sqlQuery = onlyPending
      ? `SELECT id, demanda_id, requester_email, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at
           FROM prazo_requests
          WHERE status = 'pending'
          ORDER BY created_at DESC`
      : `SELECT id, demanda_id, requester_email, prazo_atual, prazo_solicitado, motivo, status, admin_note, created_at, decided_at
           FROM prazo_requests
          ORDER BY created_at DESC`;

    const result = await query(sqlQuery);
    return NextResponse.json({ ok: true, total: result.rows.length, dados: result.rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
