'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Calendar, AlertCircle, Check, Loader2, Clock, CheckCircle2, UserCheck } from 'lucide-react';
import { formatToDateIso, formatToDateBr, parseDateFlexible } from '@/lib/ausencia';

interface AusenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  targetUser?: {
    id: string;
    nome: string;
    ausente?: boolean;
    ausenteTipo?: string | null;
    ausenteInicio?: string | null;
    ausenteFim?: string | null;
    ausenteMotivo?: string | null;
  } | null;
}

export const AusenciaModal = ({ isOpen, onClose, onSaved, targetUser }: AusenciaModalProps) => {
  const { token, user: currentUser } = useAuth();

  const isManagingOther = !!(targetUser && String(targetUser.id) !== String(currentUser?.id));
  const displayedUser = targetUser || currentUser;

  const [ausente, setAusente] = useState(false);
  const [ausenteTipo, setAusenteTipo] = useState('Férias');
  const [ausenteInicio, setAusenteInicio] = useState('');
  const [ausenteFim, setAusenteFim] = useState('');
  const [ausenteMotivo, setAusenteMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setFeedback(null);
    if (targetUser) {
      setAusente(!!targetUser.ausente);
      setAusenteTipo(targetUser.ausenteTipo || 'Férias');
      setAusenteInicio(targetUser.ausenteInicio ? formatToDateIso(targetUser.ausenteInicio) : '');
      setAusenteFim(targetUser.ausenteFim ? formatToDateIso(targetUser.ausenteFim) : '');
      setAusenteMotivo(targetUser.ausenteMotivo || '');
    } else {
      // Carregar dados de ausência do próprio usuário
      fetchMyAusencia();
    }
  }, [isOpen, targetUser]);

  const fetchMyAusencia = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/usuarios/me/ausencia', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.ausencia) {
        setAusente(!!data.ausencia.ausente);
        setAusenteTipo(data.ausencia.ausenteTipo || 'Férias');
        setAusenteInicio(data.ausencia.ausenteInicio || '');
        setAusenteFim(data.ausencia.ausenteFim || '');
        setAusenteMotivo(data.ausencia.ausenteMotivo || '');
      }
    } catch (err) {
      console.error('Erro ao buscar dados de ausência:', err);
    }
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setFeedback(null);

    // Validações
    if (ausente) {
      if (!ausenteInicio || !ausenteFim) {
        setFeedback({ type: 'error', message: 'Por favor, informe as datas de início e término do afastamento.' });
        setLoading(false);
        return;
      }

      const inicio = parseDateFlexible(ausenteInicio);
      const fim = parseDateFlexible(ausenteFim);

      if (inicio && fim && inicio.getTime() > fim.getTime()) {
        setFeedback({ type: 'error', message: 'A data de início não pode ser posterior à data de término.' });
        setLoading(false);
        return;
      }
    }

    try {
      const endpoint = isManagingOther && targetUser?.id
        ? `/api/usuarios/${targetUser.id}/ausencia`
        : '/api/usuarios/me/ausencia';

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ausente,
          ausenteTipo: ausente ? ausenteTipo : null,
          ausenteInicio: ausente ? ausenteInicio : null,
          ausenteFim: ausente ? ausenteFim : null,
          ausenteMotivo: ausente ? ausenteMotivo : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao salvar status de ausência.');
      }

      setFeedback({
        type: 'success',
        message: ausente
          ? 'Afastamento sinalizado com sucesso! Atribuições de demandas serão bloqueadas neste período.'
          : 'Status atualizado: colaborador disponível para novas demandas!',
      });

      setTimeout(() => {
        onClose();
        if (onSaved) onSaved();
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMarcarRetorno = () => {
    setAusente(false);
    setAusenteInicio('');
    setAusenteFim('');
    setAusenteMotivo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${ausente ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'}`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {isManagingOther ? `Afastamento de ${displayedUser?.nome}` : 'Sinalizar Afastamento / Licença / Férias'}
              </h3>
              <p className="text-xs text-slate-400">
                Bloqueia atribuições de demandas durante o período informado.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div className={`mb-5 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Toggle de Status */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold text-slate-200 block">
                Status de Disponibilidade
              </label>
              <span className="text-xs text-slate-400">
                {ausente ? 'Colaborador marcado como AUSENTE' : 'Colaborador ATIVO e DISPONÍVEL'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAusente(!ausente)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                ausente ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  ausente ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {ausente ? (
            <>
              {/* Tipo de Afastamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tipo de Afastamento / Ausência
                </label>
                <select
                  value={ausenteTipo}
                  onChange={(e) => setAusenteTipo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Férias">🏖️ Férias</option>
                  <option value="Atestado">🩺 Atestado Médico</option>
                  <option value="Licença Médica">🏥 Licença Médica / Saúde</option>
                  <option value="Licença Maternidade/Paternidade">👶 Licença Maternidade / Paternidade</option>
                  <option value="Afastamento">📋 Afastamento Geral</option>
                  <option value="Outro">📌 Outro Motivo</option>
                </select>
              </div>

              {/* Período */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    required
                    value={ausenteInicio}
                    onChange={(e) => setAusenteInicio(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Data de Término (Retorno)
                  </label>
                  <input
                    type="date"
                    required
                    value={ausenteFim}
                    onChange={(e) => setAusenteFim(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Motivo opcional */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Motivo ou Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={ausenteMotivo}
                  onChange={(e) => setAusenteMotivo(e.target.value)}
                  placeholder="Ex: Férias regulamentares do período 2025/2026..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Aviso explicativo */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Bloqueio Automático:</strong> Durante o período de{' '}
                  {ausenteInicio ? formatToDateBr(ausenteInicio) : '__/__/____'} até{' '}
                  {ausenteFim ? formatToDateBr(ausenteFim) : '__/__/____'}, o sistema impedirá que novas demandas sejam atribuídas a você.
                </span>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2.5">
              <UserCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Você está atualmente <strong>disponível</strong> no sistema para receber atribuições de demandas normalmente.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {ausente && (
              <button
                type="button"
                onClick={handleMarcarRetorno}
                className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
              >
                Cancelar Afastamento
              </button>
            )}

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 ${
                  ausente
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-amber-500/20'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20'
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{ausente ? 'Salvar Afastamento' : 'Confirmar Disponibilidade'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
