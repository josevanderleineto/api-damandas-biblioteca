'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { Bell, Mail, Clock, FileSpreadsheet, Calendar, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function NotificationsPage() {
  const { token } = useAuth();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<{ action: string; type: 'success' | 'error'; text: string; details?: any } | null>(null);

  const runAction = async (actionName: string, endpoint: string) => {
    if (!token) return;
    setLoadingAction(actionName);
    setResultMessage(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.erro || data.reason || 'Falha ao executar ação.');
      }

      setResultMessage({
        action: actionName,
        type: 'success',
        text: data.mensagem || 'Ação executada com sucesso!',
        details: data,
      });
    } catch (err: any) {
      setResultMessage({
        action: actionName,
        type: 'error',
        text: err.message,
      });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Bell className="w-7 h-7 text-sky-400" />
            Disparador & Notificações
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Validação de configurações SMTP e disparos manuais de lembretes, atribuições e relatórios.
          </p>
        </div>

        {/* Global Result Alert */}
        {resultMessage && (
          <div className={`mb-8 p-4 rounded-2xl border flex items-start gap-3 transition-all ${
            resultMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}>
            {resultMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">{resultMessage.action}</h4>
              <p className="text-xs opacity-90">{resultMessage.text}</p>
              {resultMessage.details && (
                <pre className="mt-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40">
                  {JSON.stringify(resultMessage.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Teste SMTP */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4 text-sky-400">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-1">Testar Conexão SMTP</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Valida as credenciais SMTP (Host, Porta, Usuário, Senha) configuradas no ambiente.
              </p>
            </div>
            <button
              onClick={() => runAction('Teste de Conexão SMTP', '/api/notificacoes/test-smtp')}
              disabled={loadingAction === 'Teste de Conexão SMTP'}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-2.5 px-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loadingAction === 'Teste de Conexão SMTP' ? (
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Validar Servidor SMTP</span>
            </button>
          </div>

          {/* Card 2: Lembretes de Prazo */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-1">Executar Lembretes de Prazo</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Dispara o ciclo de verificação de prazos para demandas pendentes e atrasadas, notificando os responsáveis.
              </p>
            </div>
            <button
              onClick={() => runAction('Disparo de Lembretes de Prazo', '/api/notificacoes/reminders')}
              disabled={loadingAction === 'Disparo de Lembretes de Prazo'}
              className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs py-2.5 px-4 rounded-xl border border-amber-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loadingAction === 'Disparo de Lembretes de Prazo' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Disparar Lembretes Agora</span>
            </button>
          </div>

          {/* Card 3: Sincronizar Atribuições */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-1">Monitor de Planilha (Atribuições)</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Verifica novas demandas inseridas diretamente no Google Sheets e dispara os e-mails de atribuição pendentes.
              </p>
            </div>
            <button
              onClick={() => runAction('Sincronização de Atribuições', '/api/notificacoes/assignments')}
              disabled={loadingAction === 'Sincronização de Atribuições'}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs py-2.5 px-4 rounded-xl border border-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loadingAction === 'Sincronização de Atribuições' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Sincronizar Atribuições</span>
            </button>
          </div>

          {/* Card 4: Relatório Semanal */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-1">Forçar Relatório Semanal</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Gera e envia o relatório semanal consolidado contendo as métricas da última semana para todos os usuários ativos.
              </p>
            </div>
            <button
              onClick={() => runAction('Envio de Relatório Semanal', '/api/notificacoes/weekly-report')}
              disabled={loadingAction === 'Envio de Relatório Semanal'}
              className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold text-xs py-2.5 px-4 rounded-xl border border-indigo-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loadingAction === 'Envio de Relatório Semanal' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Enviar Relatório Agora</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
