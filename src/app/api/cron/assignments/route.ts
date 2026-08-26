import { NextResponse } from 'next/server';
import * as assignmentWatcherService from '@/lib/services/assignmentWatcherService';

export async function GET(req: Request) {
  try {
    const result = await assignmentWatcherService.verificarAtribuicoesPendentes();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
