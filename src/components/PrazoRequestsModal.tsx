'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Calendar, Check, Ban, Loader2, Clock } from 'lucide-react';

interface PrazoRequest {
  id: number;
  demanda_id: string;
  requester_email: string;
  prazo_atual: string;
  prazo_solicitado: string;
  motivo: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  created_at: string;
}

export const PrazoRequestsModal = ({
  isOpen,
  onClose,
  onDecided,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDecided: () => void;
}) => {
  const { token } = useAuth();
  const [requests, setRequests] = useState<PrazoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [adminNoteMap, setAdminNoteMap] = useState<{ [key: number]: string }>({});

  const fetchRequests = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/demandas/prazo-solicitacoes?pending=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setRequests(data.dados);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [isOpen, token]);

  const handleDecide = async (requestId: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    setDecidingId(requestId);

    try {
      const adminNote = adminNoteMap[requestId] || '';
      const res = await fetch(`/api/demandas/prazo-solicitacoes/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, adminNote }),
      });

      const data = await res.json();
      if (data.ok) {
        fetchRequests();
        onDecided();
      } else {
        alert(data.erro || 'Falha ao processar solicitação.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDecidingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Solicitações de Prorrogação de Prazo</h3>
              <p className="text-xs text-slate-400">Analise e decida os pedidos de extensão solicitados pelos colaboradores</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span>Carregando solicitações...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Nenhuma solicitação de prorrogação pendente no momento.
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">Demanda #{req.demanda_id}</span>
                    <span className="text-xs text-slate-400">({req.requester_email})</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Atual: <strong className="text-slate-300">{req.prazo_atual}</strong></span>
                    <span className="text-amber-400 font-bold">➔ Novo: {req.prazo_solicitado}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Motivo informado:</p>
                  <p className="text-xs text-slate-200 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed">
                    {req.motivo}
                  </p>
                </div>

                <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    placeholder="Nota administrativa (opcional)..."
                    value={adminNoteMap[req.id] || ''}
                    onChange={(e) => setAdminNoteMap({ ...adminNoteMap, [req.id]: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => handleDecide(req.id, 'rejected')}
                      disabled={decidingId === req.id}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Rejeitar</span>
                    </button>
                    <button
                      onClick={() => handleDecide(req.id, 'approved')}
                      disabled={decidingId === req.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {decidingId === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Aprovar</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
