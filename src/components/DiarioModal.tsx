'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BookMarked, X, AlertCircle, Loader2, Clock, Tag, Calendar, Sparkles } from 'lucide-react';

export interface DiarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editingEntry?: any | null;
  initialData?: {
    data?: string;
    titulo?: string;
    conteudo?: string;
    demandas_relacionadas?: string;
    horas_trabalhadas?: string | number;
  };
  contextInfo?: {
    demandaId?: string;
    novoStatus?: string;
    descricao?: string;
  };
}

export const DiarioModal: React.FC<DiarioModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingEntry,
  initialData,
  contextInfo,
}) => {
  const { authFetch } = useAuth();
  const hojeString = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    data: hojeString,
    titulo: '',
    conteudo: '',
    demandas_relacionadas: '',
    horas_trabalhadas: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (editingEntry) {
      setFormData({
        data: editingEntry.data || hojeString,
        titulo: editingEntry.titulo || '',
        conteudo: editingEntry.conteudo || '',
        demandas_relacionadas: editingEntry.demandas_relacionadas || '',
        horas_trabalhadas: editingEntry.horas_trabalhadas ? String(editingEntry.horas_trabalhadas) : '',
      });
    } else if (contextInfo) {
      const isConcluido = String(contextInfo.novoStatus || '').toLowerCase().includes('conclu');
      const prefixo = isConcluido ? 'Conclusão da Demanda' : 'Em andamento: Demanda';
      const demandaId = contextInfo.demandaId || '';

      setFormData({
        data: hojeString,
        titulo: `${prefixo} #${demandaId}${contextInfo.descricao ? ` - ${contextInfo.descricao.slice(0, 40)}...` : ''}`,
        conteudo: '',
        demandas_relacionadas: `Demanda #${demandaId}`,
        horas_trabalhadas: '',
      });
    } else if (initialData) {
      setFormData({
        data: initialData.data || hojeString,
        titulo: initialData.titulo || '',
        conteudo: initialData.conteudo || '',
        demandas_relacionadas: initialData.demandas_relacionadas || '',
        horas_trabalhadas: initialData.horas_trabalhadas ? String(initialData.horas_trabalhadas) : '',
      });
    } else {
      setFormData({
        data: hojeString,
        titulo: '',
        conteudo: '',
        demandas_relacionadas: '',
        horas_trabalhadas: '',
      });
    }

    setFormError('');
  }, [isOpen, editingEntry, initialData, contextInfo, hojeString]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.conteudo.trim()) {
      setFormError('Por favor, descreva as atividades realizadas.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const url = editingEntry ? `/api/diario/${editingEntry.id}` : '/api/diario';
      const method = editingEntry ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) return;
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao salvar relato no diário.');
      }

      onClose();
      if (onSaved) onSaved();
    } catch (err: any) {
      setFormError(err.message || 'Erro inesperado ao salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl glass-panel rounded-2xl border border-slate-800 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <BookMarked className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>{editingEntry ? 'Editar Relato' : 'Registrar no Diário de Bordo'}</span>
              {contextInfo && (
                <span className="text-[10px] bg-sky-500/10 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-full font-medium">
                  {contextInfo.novoStatus}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {contextInfo
                ? `Relate o que foi executado na Demanda #${contextInfo.demandaId}.`
                : 'Registre as rotinas e atividades realizadas no dia.'}
            </p>
          </div>
        </div>

        {contextInfo && (
          <div className="mb-4 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              Status alterado para <strong>{contextInfo.novoStatus}</strong>! Registre o que você fez para manter o histórico da biblioteca atualizado.
            </span>
          </div>
        )}

        {formError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Data do Relato *</span>
              </label>
              <input
                type="date"
                required
                value={formData.data}
                onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Horas Dedicadas (opcional)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                placeholder="Ex: 2 ou 3.5"
                value={formData.horas_trabalhadas}
                onChange={(e) => setFormData({ ...formData, horas_trabalhadas: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Título ou Resumo Breve (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Triagem e organização dos livros do setor B"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              O que você realizou nesta etapa? *
            </label>
            <textarea
              required
              rows={5}
              placeholder={
                contextInfo
                  ? `Descreva as etapas realizadas na demanda #${contextInfo.demandaId}, tarefas concluídas, orientações prestadas ou pendências...`
                  : 'Descreva com detalhes as atividades executadas no dia, rotinas da biblioteca, ocorrências...'
              }
              value={formData.conteudo}
              onChange={(e) => setFormData({ ...formData, conteudo: e.target.value })}
              className="w-full px-3.5 py-3 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50 resize-y leading-relaxed"
            />
            <span className="text-[11px] text-slate-500 block text-right mt-1">
              {formData.conteudo.length} caracteres
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              <span>Demandas Relacionadas ou Tags (opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Demanda #004, Reparo estante B"
              value={formData.demandas_relacionadas}
              onChange={(e) => setFormData({ ...formData, demandas_relacionadas: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
            {contextInfo ? (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Pular / Registrar mais tarde
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-lg shadow-sky-500/20 transition disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingEntry ? 'Salvar Alterações' : 'Salvar no Diário'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

