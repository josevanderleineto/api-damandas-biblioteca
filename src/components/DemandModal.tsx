'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Check, Loader2, Calendar, Clock, AlertTriangle, Send } from 'lucide-react';

interface DemandModalProps {
  isOpen: boolean;
  onClose: () => void;
  demanda: any | null;
  onSaved: () => void;
}

export const DemandModal = ({ isOpen, onClose, demanda, onSaved }: DemandModalProps) => {
  const { token, isAdmin, user } = useAuth();

  const isNew = !demanda;
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fields
  const [responsavel, setResponsavel] = useState('');
  const [descricao, setDescricao] = useState('');
  const [matricula, setMatricula] = useState('');
  const [email, setEmail] = useState('');
  const [prazo, setPrazo] = useState('');
  const [status, setStatus] = useState('Pendente');
  const [prioridade, setPrioridade] = useState('Média');
  const [conclusao, setConclusao] = useState('');
  const [tempoExecucao, setTempoExecucao] = useState('');

  // Extension request section
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [prazoSolicitado, setPrazoSolicitado] = useState('');
  const [motivoExtensao, setMotivoExtensao] = useState('');
  const [sendingExtension, setSendingExtension] = useState(false);

  // Users for auto-fill
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  useEffect(() => {
    if (isAdmin && isOpen) {
      fetchUsuarios();
    }
  }, [isAdmin, isOpen]);

  const fetchUsuarios = async () => {
    if (!token) return;
    setLoadingUsuarios(true);
    try {
      const res = await fetch('/api/usuarios', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setUsuarios(data.dados || []);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários', err);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleSelectUsuario = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId) return;
    
    const user = usuarios.find((u: any) => String(u.id) === selectedId);
    if (user) {
      setResponsavel(prev => prev ? `${prev}, ${user.nome}` : user.nome || '');
      if (user.matricula) {
        setMatricula(prev => prev ? `${prev}, ${user.matricula}` : user.matricula);
      }
      if (user.email) {
        setEmail(prev => prev ? `${prev}, ${user.email}` : user.email);
      }
    }
    
    // Reseta o select para permitir escolher outra pessoa logo em seguida
    e.target.value = "";
  };

  useEffect(() => {
    if (demanda) {
      setResponsavel(demanda.responsavel || '');
      setDescricao(demanda.descricao || '');
      setMatricula(demanda.matricula || '');
      setEmail(demanda.email || '');
      setPrazo(demanda.prazo || '');
      setStatus(demanda.status || 'Pendente');
      setPrioridade(demanda.prioridade || 'Média');
      setConclusao(demanda.conclusao || '');
      setTempoExecucao(demanda.tempoExecucao || '');
    } else {
      setResponsavel('');
      setDescricao('');
      setMatricula('');
      setEmail('');
      setPrazo('');
      setStatus('Pendente');
      setPrioridade('Média');
      setConclusao('');
      setTempoExecucao('');
    }
    setFeedback(null);
    setShowExtensionForm(false);
  }, [demanda, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setFeedback(null);

    try {
      const url = isNew ? '/api/demandas' : `/api/demandas/${demanda.demanda}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload = isNew
        ? { responsavel, descricao, matricula, email, prazo, status, prioridade, conclusao, tempoExecucao }
        : isAdmin
          ? { responsavel, descricao, matricula, email, prazo, status, prioridade, conclusao, tempoExecucao }
          : { status, conclusao, tempoExecucao };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao salvar demanda.');
      }

      setFeedback({ type: 'success', message: isNew ? 'Demanda criada com sucesso!' : 'Demanda atualizada com sucesso!' });
      setTimeout(() => {
        onClose();
        onSaved();
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !demanda) return;
    setSendingExtension(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/demandas/${demanda.demanda}/prazo-solicitacao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prazoSolicitado, motivo: motivoExtensao }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao solicitar prorrogação.');
      }

      setFeedback({ type: 'success', message: 'Solicitação de prorrogação enviada aos administradores!' });
      setShowExtensionForm(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSendingExtension(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            {isNew ? 'Nova Demanda' : `Demanda #${demanda?.demanda}`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-medium ${
            feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {feedback.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isAdmin && isNew && usuarios.length > 0 && (
            <div className="mb-4 p-3 bg-slate-900/50 border border-sky-500/20 rounded-xl">
              <label className="block text-xs font-semibold text-sky-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                Preencher com Usuário Cadastrado
                {loadingUsuarios && <Loader2 className="w-3 h-3 animate-spin" />}
              </label>
              <select
                onChange={handleSelectUsuario}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="">-- Selecione um usuário --</option>
                {usuarios.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} {u.matricula ? `(${u.matricula})` : ''} - {u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Responsável
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin && !isNew}
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Matrícula
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin && !isNew}
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Matrícula"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Descrição da Demanda
            </label>
            <textarea
              required
              rows={3}
              disabled={!isAdmin && !isNew}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva a atividade ou demanda em detalhes..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                E-mail de Notificação
              </label>
              <input
                type="text"
                disabled={!isAdmin && !isNew}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@uniftc.edu.br"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Prazo limite (dd/mm/aaaa)
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin && !isNew}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                placeholder="DD/MM/AAAA"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Pendente">Pendente</option>
                <option value="Em andamento">Em andamento</option>
                <option value="Concluído">Concluído</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Prioridade
              </label>
              <select
                disabled={!isAdmin && !isNew}
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Data de Conclusão
              </label>
              <input
                type="text"
                value={conclusao}
                onChange={(e) => setConclusao(e.target.value)}
                placeholder="DD/MM/AAAA"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {!isNew && (
              <button
                type="button"
                onClick={() => setShowExtensionForm(!showExtensionForm)}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4" />
                <span>Solicitar Prorrogação</span>
              </button>
            )}

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isNew ? 'Criar Demanda' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Extension Request Form Sub-Panel */}
        {showExtensionForm && !isNew && (
          <form onSubmit={handleRequestExtension} className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Solicitar Extensão de Prazo
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Novo Prazo Solicitado (dd/mm/aaaa)</label>
                <input
                  type="text"
                  required
                  value={prazoSolicitado}
                  onChange={(e) => setPrazoSolicitado(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-100 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Justificativa / Motivo</label>
                <textarea
                  required
                  rows={2}
                  value={motivoExtensao}
                  onChange={(e) => setMotivoExtensao(e.target.value)}
                  placeholder="Explique a necessidade da extensão de prazo..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sendingExtension}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {sendingExtension ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Enviar Solicitação aos Admins</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
