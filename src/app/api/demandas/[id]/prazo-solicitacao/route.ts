import { NextResponse } from 'next/server';
import * as sheetsService from '@/lib/googleSheets';
import { query } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { normalize, normalizeEmail, isValidEmail } from '@/lib/utils';

function isValidPrazo(dateBr: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(dateBr || '').trim());
}

function demandEmails(demandaEmail: string) {
  return (demandaEmail || '')
    .split(/[;,|\n\r]/g)
    .map((v) => normalizeEmail(v))
    .filter((v) => v && isValidEmail(v));
}

function isResponsavelPelaDemanda(user: any, demanda: any) {
  if (!user || !demanda) return false;
  const userEmail = normalizeEmail(user.email);
  const emails = demandEmails(demanda.email);
  return emails.includes(userEmail);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 });
    }

    const demandaId = normalize(params?.id);
    const body = await req.json().catch(() => ({}));
    const prazoSolicitado = normalize(body?.prazoSolicitado);
    const motivo = normalize(body?.motivo);

    if (!demandaId || !prazoSolicitado || !motivo) {
      return NextResponse.json({ ok: false, erro: 'Campos obrigatórios: prazoSolicitado, motivo.' }, { status: 400 });
    }

    if (!isValidPrazo(prazoSolicitado)) {
      return NextResponse.json({ ok: false, erro: 'prazoSolicitado inválido. Use dd/mm/aaaa.' }, { status: 400 });
    }

    const demanda = await sheetsService.buscarPorId(demandaId);
    if (!demanda) {
      return NextResponse.json({ ok: false, erro: 'Demanda não encontrada.' }, { status: 404 });
    }

    const isAdmin = ['admin', 'root'].includes(user.role);
    const isResponsavel = isResponsavelPelaDemanda(user, demanda);

    if (!isResponsavel && !isAdmin) {
      return NextResponse.json({ ok: false, erro: 'Você só pode solicitar prorrogação para demandas que você é responsável.' }, { status: 403 });
    }

    const result = await query(
      `INSERT INTO prazo_requests (
         demanda_id, requester_user_id, requester_email,
         prazo_atual, prazo_solicitado, motivo
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, demanda_id, prazo_atual, prazo_solicitado, motivo, status, created_at`,
      [demandaId, user.id, normalizeEmail(user.email), demanda.prazo || '', prazoSolicitado, motivo]
    );

    return NextResponse.json({ ok: true, solicitacao: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}
