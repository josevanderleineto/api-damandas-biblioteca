import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { normalize } from '@/lib/utils';

function parseDateToIso(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const id = normalize(params?.id);
    if (!id) {
      return NextResponse.json({ ok: false, erro: 'ID obrigatório.' }, { status: 400 });
    }

    const res = await query(
      `SELECT id, user_id, user_nome, user_email,
              TO_CHAR(data, 'YYYY-MM-DD') AS data,
              titulo, conteudo, demandas_relacionadas, horas_trabalhadas,
              created_at, updated_at
         FROM diario_bordo
        WHERE id = $1`,
      [id]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Registro não encontrado.' }, { status: 404 });
    }

    const item = res.rows[0];
    const isAdmin = ['admin', 'root'].includes(user.role);
    if (!isAdmin && item.user_id !== user.id) {
      return NextResponse.json({ ok: false, erro: 'Acesso negado a este relato.' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, item });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const id = normalize(params?.id);
    if (!id) {
      return NextResponse.json({ ok: false, erro: 'ID obrigatório.' }, { status: 400 });
    }

    const find = await query('SELECT id, user_id FROM diario_bordo WHERE id = $1', [id]);
    if (find.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Registro não encontrado.' }, { status: 404 });
    }

    const existing = find.rows[0];
    const isAdmin = ['admin', 'root'].includes(user.role);
    if (!isAdmin && existing.user_id !== user.id) {
      return NextResponse.json({ ok: false, erro: 'Apenas o autor ou administradores podem editar este relato.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const conteudo = String(body?.conteudo || '').trim();
    const titulo = String(body?.titulo || '').trim() || null;
    const demandasRelacionadas = String(body?.demandas_relacionadas || body?.demandasRelacionadas || '').trim() || null;
    const horasTrabalhadas = body?.horas_trabalhadas !== undefined && body?.horas_trabalhadas !== '' 
      ? Number.parseFloat(body.horas_trabalhadas) 
      : null;

    if (!conteudo) {
      return NextResponse.json({ ok: false, erro: 'O conteúdo do diário é obrigatório.' }, { status: 400 });
    }

    let dataIso = parseDateToIso(body?.data);
    if (!dataIso) {
      dataIso = new Date().toISOString().split('T')[0];
    }

    const updateSql = `
      UPDATE diario_bordo
         SET data = $1,
             titulo = $2,
             conteudo = $3,
             demandas_relacionadas = $4,
             horas_trabalhadas = $5,
             updated_at = NOW()
       WHERE id = $6
      RETURNING id, user_id, user_nome, user_email,
                TO_CHAR(data, 'YYYY-MM-DD') AS data,
                titulo, conteudo, demandas_relacionadas, horas_trabalhadas,
                created_at, updated_at
    `;

    const result = await query(updateSql, [
      dataIso,
      titulo,
      conteudo,
      demandasRelacionadas,
      Number.isNaN(horasTrabalhadas) ? null : horasTrabalhadas,
      id,
    ]);

    return NextResponse.json({ ok: true, item: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const id = normalize(params?.id);
    if (!id) {
      return NextResponse.json({ ok: false, erro: 'ID obrigatório.' }, { status: 400 });
    }

    const find = await query('SELECT id, user_id FROM diario_bordo WHERE id = $1', [id]);
    if (find.rowCount === 0) {
      return NextResponse.json({ ok: false, erro: 'Registro não encontrado.' }, { status: 404 });
    }

    const existing = find.rows[0];
    const isAdmin = ['admin', 'root'].includes(user.role);
    if (!isAdmin && existing.user_id !== user.id) {
      return NextResponse.json({ ok: false, erro: 'Apenas o autor ou administradores podem excluir este relato.' }, { status: 403 });
    }

    await query('DELETE FROM diario_bordo WHERE id = $1', [id]);
    return NextResponse.json({ ok: true, id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

