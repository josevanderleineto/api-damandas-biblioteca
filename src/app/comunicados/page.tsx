'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { NovoComunicadoModal } from '@/components/NovoComunicadoModal';
import { useAuth } from '@/context/AuthContext';
import {
  Megaphone, Plus, Info, AlertTriangle, CalendarClock, CheckCheck,
  Loader2, Trash2, Bell,
} from 'lucide-react';

interface Comunicado {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'info' | 'aviso' | 'urgente' | 'reuniao';
  autor_nome: string;
  criado_em: string;
  lido: boolean;
}

const tipoConfig = {
  info:    { label: 'Informativo', icon: Info,          color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  aviso:   { label: 'Aviso',       icon: AlertTriangle,  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  urgente: { label: 'Urgente',     icon: AlertTriangle,  color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
  reuniao: { label: 'Reunião',     icon: CalendarClock,  color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
};

function formatDate(str: string) {
  return new Date(str).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ComunicadosPage() {
  const { user, isAdmin, authFetch } = useAuth();
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchComunicados = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/comunicados');
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) setComunicados(data.dados || []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchComunicados(); }, [user]);

  const marcarLido = async (id: string) => {
    setComunicados((prev) => prev.map((c) => c.id === id ? { ...c, lido: true } : c));
    try {
      await authFetch('/api/comunicados/marcar-lida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comunicadoId: id }),
      });
    } catch {}
  };

  const marcarTodos = async () => {
    setComunicados((prev) => prev.map((c) => ({ ...c, lido: true })));
    try { await authFetch('/api/comunicados/marcar-lida', { method: 'PUT' }); } catch {}
  };

  const deletar = async (id: string) => {
    if (!confirm('Remover este comunicado para todos?')) return;
    setDeleting(id);
    try {
      await authFetch(`/api/comunicados?id=${id}`, { method: 'DELETE' });
      setComunicados((prev) => prev.filter((c) => c.id !== id));
    } catch {}
    finally { setDeleting(null); }
  };

  const naoLidos = comunicados.filter((c) => !c.lido).length;

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
              <Megaphone className="w-3.5 h-3.5" />
              <span>Mural de Avisos</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Comunicados</h1>
            <p className="text-sm text-slate-400 mt-1">Avisos gerais, chamadas de reunião e comunicações da gestão.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {naoLidos > 0 && (
              <button
                onClick={marcarTodos}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-sky-400 border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todos lidos ({naoLidos})
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-sky-600 hover:from-indigo-400 hover:to-sky-500 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-lg shadow-sky-500/20 transition"
              >
                <Plus className="w-4 h-4" />
                Novo Comunicado
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : comunicados.length === 0 ? (
          <div className="text-center py-20">
            <Bell className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <h3 className="text-slate-400 font-semibold mb-1">Nenhum comunicado disponível</h3>
            <p className="text-slate-600 text-sm">Comunicados e avisos gerais aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comunicados.map((c) => {
              const cfg = tipoConfig[c.tipo] || tipoConfig.info;
              const Icon = cfg.icon;
              return (
                <div
                  key={c.id}
                  onClick={() => !c.lido && marcarLido(c.id)}
                  className={`glass-panel rounded-2xl border p-5 transition cursor-pointer hover:border-slate-700 ${
                    !c.lido ? 'border-sky-500/20 ring-1 ring-sky-500/10' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            {cfg.label}
                          </span>
                          {!c.lido && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/20">
                              Novo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.lido && (
                            <span className="text-[10px] text-slate-600 flex items-center gap-1">
                              <CheckCheck className="w-3 h-3 text-emerald-500" /> Lido
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deletar(c.id); }}
                              disabled={deleting === c.id}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Remover comunicado"
                            >
                              {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <h3 className="text-base font-bold text-slate-100 mt-2">{c.titulo}</h3>
                      <p className="text-sm text-slate-300 mt-1.5 leading-relaxed whitespace-pre-wrap">{c.mensagem}</p>
                      <p className="text-[11px] text-slate-500 mt-3">
                        Publicado por <span className="text-slate-400 font-semibold">{c.autor_nome}</span> • {formatDate(c.criado_em)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <NovoComunicadoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={fetchComunicados}
      />
    </div>
  );
}

