import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { normalize, normalizeEmail } from '@/lib/utils';

function parseDateToIso(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  // Se for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // Se for DD/MM/YYYY
  const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isAdmin = ['admin', 'root'].includes(user.role);

    // Se não for admin, só pode ver seus próprios relatos
    const targetUserId = isAdmin ? searchParams.get('userId') : user.id;
    const filterData = parseDateToIso(searchParams.get('data') || '');
    const filterDe = parseDateToIso(searchParams.get('de') || '');
    const filterAte = parseDateToIso(searchParams.get('ate') || '');
    const searchQuery = normalize(searchParams.get('search') || '');

    const conditions: string[] = [];
    const values: any[] = [];

    if (targetUserId) {
      values.push(targetUserId);
      conditions.push(`user_id = $${values.length}`);
    }

    if (filterData) {
      values.push(filterData);
      conditions.push(`data = $${values.length}`);
    }

    if (filterDe) {
      values.push(filterDe);
      conditions.push(`data >= $${values.length}`);
    }

    if (filterAte) {
      values.push(filterAte);
      conditions.push(`data <= $${values.length}`);
    }

    if (searchQuery) {
      values.push(`%${searchQuery}%`);
      conditions.push(`(titulo ILIKE $${values.length} OR conteudo ILIKE $${values.length} OR demandas_relacionadas ILIKE $${values.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT id, user_id, user_nome, user_email,
             TO_CHAR(data, 'YYYY-MM-DD') AS data,
             titulo, conteudo, demandas_relacionadas, horas_trabalhadas,
             created_at, updated_at
        FROM diario_bordo
       ${whereClause}
       ORDER BY data DESC, created_at DESC
       LIMIT 200
    `;

    const result = await query(sql, values);

    // Estatísticas rápidas para o cabeçalho
    const hojeIso = new Date().toISOString().split('T')[0];
    const relatorHoje = result.rows.some((r) => r.data === hojeIso && r.user_id === user.id);

    return NextResponse.json({
      ok: true,
      total: result.rowCount,
      relatouHoje: relatorHoje,
      dados: result.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
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

    const sql = `
      INSERT INTO diario_bordo (
        user_id, user_nome, user_email, data, titulo, conteudo, demandas_relacionadas, horas_trabalhadas
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, user_nome, user_email,
                TO_CHAR(data, 'YYYY-MM-DD') AS data,
                titulo, conteudo, demandas_relacionadas, horas_trabalhadas,
                created_at, updated_at
    `;

    const result = await query(sql, [
      user.id,
      user.nome,
      normalizeEmail(user.email),
      dataIso,
      titulo,
      conteudo,
      demandasRelacionadas,
      Number.isNaN(horasTrabalhadas) ? null : horasTrabalhadas,
    ]);

    return NextResponse.json({ ok: true, item: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

