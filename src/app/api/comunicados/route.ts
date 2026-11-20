import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';
import { sendEmail, escapeHtml } from '@/lib/mailer';

// Garante que a tabela existe (migration automática)
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS comunicados (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'aviso', 'urgente', 'reuniao')),
      autor_id TEXT NOT NULL,
      autor_nome TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ativo BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS comunicados_leituras (
      comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      lido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (comunicado_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_comunicados_criado_em ON comunicados(criado_em DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_comunicados_ativo ON comunicados(ativo)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_comunicados_leituras_user ON comunicados_leituras(user_id)`);
}

/** GET /api/comunicados — lista comunicados ativos + status de leitura do usuário */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });

  try {
    await ensureTables();

    const { rows } = await query<any>(
      `SELECT c.id, c.titulo, c.mensagem, c.tipo, c.autor_nome, c.criado_em, c.ativo,
              (cl.user_id IS NOT NULL) AS lido
         FROM comunicados c
         LEFT JOIN comunicados_leituras cl
                ON cl.comunicado_id = c.id AND cl.user_id = $1
        WHERE c.ativo = TRUE
        ORDER BY c.criado_em DESC
        LIMIT 50`,
      [String(user.id)]
    );

    const naoLidoCount = rows.filter((r: any) => !r.lido).length;
    return NextResponse.json({ ok: true, dados: rows, naoLido: naoLidoCount });
  } catch (err: any) {
    console.error('[GET /api/comunicados]', err);
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 });
  }
}

/** POST /api/comunicados — cria comunicado e envia e-mail para todos colaboradores */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'root') {
    return NextResponse.json({ ok: false, erro: 'Acesso negado. Apenas administradores.' }, { status: 403 });
  }

  try {
    await ensureTables();

    const body = await req.json();
    const titulo = String(body.titulo || '').trim();
    const mensagem = String(body.mensagem || '').trim();
    const tipo = String(body.tipo || 'info').trim();

    if (!titulo || !mensagem) {
      return NextResponse.json({ ok: false, erro: 'Título e mensagem são obrigatórios.' }, { status: 400 });
    }

    const tiposValidos = ['info', 'aviso', 'urgente', 'reuniao'];
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json({ ok: false, erro: 'Tipo inválido.' }, { status: 400 });
    }

    // Insere no banco
    const insertRes = await query<any>(
      `INSERT INTO comunicados (titulo, mensagem, tipo, autor_id, autor_nome)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, titulo, mensagem, tipo, autor_nome, criado_em`,
      [titulo, mensagem, tipo, String(user.id), user.nome]
    );
    const comunicado = insertRes.rows[0];

    // Busca todos os colaboradores ativos com e-mail
    const usersRes = await query<any>(
      `SELECT nome, email FROM users WHERE ativo = TRUE AND email IS NOT NULL AND email <> ''`
    );
    const destinatarios = usersRes.rows;

    // Envia e-mail em background (não bloqueia a resposta)
    const tipoLabel: Record<string, string> = {
      info: 'INFORMATIVO',
      aviso: 'AVISO',
      urgente: '⚠️ URGENTE',
      reuniao: '📅 REUNIÃO',
    };
    const tipoColor: Record<string, string> = {
      info: '#00a7ff',
      aviso: '#f79009',
      urgente: '#d92d20',
      reuniao: '#7f56d9',
    };

    const emails = destinatarios.map((u: any) => u.email).filter(Boolean);

    if (emails.length > 0) {
      const dataFormatada = new Date(comunicado.criado_em).toLocaleString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      const html = `
      <div style="margin:0; padding:20px; background:#f3f6fb; font-family:Arial, Helvetica, sans-serif;">
        <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e6ebf2;">
          <div style="padding:24px; background:linear-gradient(135deg,#0f1b6d 0%,#1e2d9f 100%); color:#fff; text-align:center;">
            <div style="font-size:22px; font-weight:700; line-height:1.25;">Comunicado — Biblioteca UniFTC/UNEX</div>
            <div style="font-size:13px; opacity:0.9; margin-top:6px;">Sistema de Gestão de Demandas</div>
          </div>
          <div style="padding:24px; color:#10213d;">
            <div style="display:inline-block; padding:6px 14px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; background:${tipoColor[tipo] || '#0f1b6d'}; margin-bottom:12px;">
              ${tipoLabel[tipo] || tipo.toUpperCase()}
            </div>
            <h2 style="margin:0 0 12px; font-size:20px; color:#0f1b6d;">${escapeHtml(titulo)}</h2>
            <div style="color:#334155; font-size:14px; line-height:1.7; white-space:pre-wrap; padding:14px; background:#f8fbff; border-radius:10px; border:1px solid #edf1f7;">
              ${escapeHtml(mensagem).replace(/\n/g, '<br>')}
            </div>
            <p style="margin:16px 0 0; font-size:12px; color:#6d7f9b;">
              Enviado por <strong>${escapeHtml(user.nome)}</strong> em ${escapeHtml(dataFormatada)}.
              <br>Acesse o sistema para visualizar este comunicado diretamente.
            </p>
          </div>
        </div>
      </div>`;

      const text = `[${tipoLabel[tipo] || tipo.toUpperCase()}] ${titulo}\n\n${mensagem}\n\nEnviado por ${user.nome} em ${dataFormatada}.`;

      // BCC para todos — envia um único e-mail
      const [toFirst, ...restBcc] = emails;
      sendEmail({
        to: toFirst,
        bcc: restBcc,
        subject: `[Comunicado - ${tipoLabel[tipo]}] ${titulo}`,
        text,
        html,
      }).catch((err) => console.error('[comunicado email]', err));
    }

    return NextResponse.json({
      ok: true,
      comunicado,
      emailsEnviados: emails.length,
    });
  } catch (err: any) {
    console.error('[POST /api/comunicados]', err);
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 });
  }
}

/** DELETE /api/comunicados?id=... — desativa (soft delete) um comunicado */
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'root') {
    return NextResponse.json({ ok: false, erro: 'Acesso negado.' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, erro: 'ID não fornecido.' }, { status: 400 });

  try {
    await query(`UPDATE comunicados SET ativo = FALSE WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[DELETE /api/comunicados]', err);
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 });
  }
}

