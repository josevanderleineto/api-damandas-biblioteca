import { NextResponse } from 'next/server';
import * as weeklyReportService from '@/lib/services/weeklyReportService';

export async function GET(req: Request) {
  try {
    const result = await weeklyReportService.executarResumoSemanal({ referenceDate: new Date(), force: false });
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
