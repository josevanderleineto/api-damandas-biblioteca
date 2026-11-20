'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Bell, X, Megaphone, Info, AlertTriangle, CalendarClock, CheckCheck, Dot } from 'lucide-react';

interface Comunicado {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'info' | 'aviso' | 'urgente' | 'reuniao';
  autor_nome: string;
  criado_em: string;
  lido: boolean;
}

function formatRelativo(dateStr: string): string {
  const data = new Date(dateStr);
  const agora = new Date();
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (diff < 60) return 'Agora mesmo';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
  return data.toLocaleDateString('pt-BR');
}

const tipoConfig = {
  info: { label: 'Informativo', icon: Info, bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', badge: 'bg-sky-500' },
  aviso: { label: 'Aviso', icon: AlertTriangle, bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', badge: 'bg-amber-500' },
  urgente: { label: 'Urgente', icon: AlertTriangle, bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', badge: 'bg-rose-500' },
  reuniao: { label: 'Reunião', icon: CalendarClock, bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', badge: 'bg-violet-500' },
};

export const ComunicadosBell: React.FC = () => {
  const { authFetch, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [naoLido, setNaoLido] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchComunicados = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/comunicados');
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) {
        setComunicados(data.dados || []);
        setNaoLido(data.naoLido || 0);
      }
    } catch (err) {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComunicados();
    // Atualiza a cada 2 minutos
    const interval = setInterval(fetchComunicados, 120_000);
    return () => clearInterval(interval);
  }, [user]);

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const marcarLido = async (id: string) => {
    setComunicados((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lido: true } : c))
    );
    setNaoLido((prev) => Math.max(0, prev - 1));
    try {
      await authFetch('/api/comunicados/marcar-lida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicadoId: id }),
      });
    } catch {}
  };

  const marcarTodosLidos = async () => {
    setComunicados((prev) => prev.map((c) => ({ ...c, lido: true })));
    setNaoLido(0);
    try {
      await authFetch('/api/comunicados/marcar-lida', { method: 'PUT' });
    } catch {}
  };

  const togglePanel = () => {
    if (!isOpen) {
      fetchComunicados();
    }
    setIsOpen((prev) => !prev);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão Bell */}
      <button
        onClick={togglePanel}
        className="relative p-2 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors border border-transparent hover:border-sky-500/20"
        title="Comunicados"
      >
        <Bell className="w-5 h-5" />
        {naoLido > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse">
            {naoLido > 9 ? '9+' : naoLido}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-[22rem] sm:w-[26rem] glass-panel border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-bold text-slate-100">Comunicados</span>
              {naoLido > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/20">
                  {naoLido} novo{naoLido > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {naoLido > 0 && (
                <button
                  onClick={marcarTodosLidos}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
                >
                  <CheckCheck className="w-3 h-3" />
                  Marcar todos
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[22rem] overflow-y-auto divide-y divide-slate-800/60">
            {loading && comunicados.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">Carregando...</div>
            ) : comunicados.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Nenhum comunicado disponível.</p>
              </div>
            ) : (
              comunicados.map((c) => {
                const cfg = tipoConfig[c.tipo] || tipoConfig.info;
                const Icon = cfg.icon;
                return (
                  <button
                    key={c.id}
                    onClick={() => !c.lido && marcarLido(c.id)}
                    className={`w-full text-left px-4 py-3 transition hover:bg-slate-800/50 ${!c.lido ? 'bg-slate-900/40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-7 h-7 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>
                            {cfg.label}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {!c.lido && <Dot className="w-4 h-4 text-sky-400 -mr-1" />}
                            <span className="text-[10px] text-slate-500">{formatRelativo(c.criado_em)}</span>
                          </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-200 mt-0.5 truncate">{c.titulo}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{c.mensagem}</p>
                        <p className="text-[10px] text-slate-600 mt-1">Por {c.autor_nome}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-800 text-center">
            <a href="/comunicados" className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold transition">
              Ver todos os comunicados →
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

