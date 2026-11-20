'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Megaphone, Info, AlertTriangle, CalendarClock, Send, Loader2 } from 'lucide-react';

interface NovoComunicadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const tiposOpcoes = [
  { value: 'info', label: 'Informativo', icon: Info, desc: 'Aviso geral ou informação do sistema', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  { value: 'aviso', label: 'Aviso', icon: AlertTriangle, desc: 'Comunicado importante que requer atenção', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  { value: 'urgente', label: 'Urgente', icon: AlertTriangle, desc: 'Situação que exige ação imediata', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  { value: 'reuniao', label: 'Reunião', icon: CalendarClock, desc: 'Convocação ou aviso de reunião', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
];

export const NovoComunicadoModal: React.FC<NovoComunicadoModalProps> = ({ isOpen, onClose, onSaved }) => {
  const { authFetch } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [tipo, setTipo] = useState('info');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; count?: number } | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setTitulo('');
    setMensagem('');
    setTipo('info');
    setResult(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) return;

    setSending(true);
    setResult(null);
    try {
      const res = await authFetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), mensagem: mensagem.trim(), tipo }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({
          ok: true,
          msg: `Comunicado publicado e e-mail enviado para ${data.emailsEnviados} colaborador(es)!`,
          count: data.emailsEnviados,
        });
        if (onSaved) onSaved();
        setTimeout(() => handleClose(), 2200);
      } else {
        setResult({ ok: false, msg: data.erro || 'Erro ao publicar comunicado.' });
      }
    } catch (err: any) {
      setResult({ ok: false, msg: 'Erro de rede ao publicar.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-xl glass-panel rounded-2xl border border-slate-800 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Novo Comunicado</h3>
            <p className="text-xs text-slate-400">Envia mensagem e e-mail para todos os colaboradores</p>
          </div>
        </div>

        {result && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${result.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'}`}>
            {result.msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Tipo do Comunicado</label>
            <div className="grid grid-cols-2 gap-2">
              {tiposOpcoes.map((opt) => {
                const Icon = opt.icon;
                const isSelected = tipo === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipo(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? opt.bg + ' ' + opt.color
                        : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? opt.color : ''}`} />
                    <div>
                      <p className={`text-xs font-bold ${isSelected ? opt.color : 'text-slate-300'}`}>{opt.label}</p>
                      <p className="text-[9px] text-slate-500 leading-tight">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Assunto / Título *</label>
            <input
              type="text"
              required
              maxLength={120}
              placeholder="Ex: Reunião de equipe — Sexta-feira, 14h"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50"
            />
          </div>

          {/* Mensagem */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Mensagem *</label>
            <textarea
              required
              rows={5}
              maxLength={1500}
              placeholder="Descreva o comunicado. Todos os colaboradores receberão este aviso no sistema e por e-mail."
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50 resize-y leading-relaxed"
            />
            <span className="text-[11px] text-slate-500 block text-right mt-1">{mensagem.length}/1500</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={handleClose}
              disabled={sending}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending || !titulo.trim() || !mensagem.trim()}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-sky-600 hover:from-indigo-400 hover:to-sky-500 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-lg shadow-sky-500/20 transition disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sending ? 'Enviando...' : 'Publicar e Enviar E-mail'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

