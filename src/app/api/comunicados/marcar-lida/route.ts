import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

/** POST /api/comunicados/marcar-lida — marca um comunicado como lido */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });

  try {
    const body = await req.json();
    const comunicadoId = String(body.comunicadoId || '').trim();
    if (!comunicadoId) return NextResponse.json({ ok: false, erro: 'ID inválido.' }, { status: 400 });

    // Upsert — ignora se já marcado
    await query(
      `INSERT INTO comunicados_leituras (comunicado_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (comunicado_id, user_id) DO NOTHING`,
      [comunicadoId, String(user.id)]
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[POST /api/comunicados/marcar-lida]', err);
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 });
  }
}

/** POST /api/comunicados/marcar-lida com action=marcar_todos — marca todos como lidos */
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });

  try {
    // Busca todos os comunicados ativos não lidos por este usuário e marca todos
    await query(
      `INSERT INTO comunicados_leituras (comunicado_id, user_id)
       SELECT c.id, $1
         FROM comunicados c
         LEFT JOIN comunicados_leituras cl ON cl.comunicado_id = c.id AND cl.user_id = $1
        WHERE c.ativo = TRUE AND cl.user_id IS NULL
       ON CONFLICT DO NOTHING`,
      [String(user.id)]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[PUT /api/comunicados/marcar-lida]', err);
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 });
  }
}

