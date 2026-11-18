'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { DiarioModal } from '@/components/DiarioModal';
import {
  BookMarked,
  Plus,
  Search,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Loader2,
  X,
  FileText,
  Filter,
  Sparkles,
  Tag,
} from 'lucide-react';

interface DiarioEntry {
  id: string;
  user_id: string;
  user_nome: string;
  user_email: string;
  data: string;
  titulo?: string | null;
  conteudo: string;
  demandas_relacionadas?: string | null;
  horas_trabalhadas?: number | null;
  created_at: string;
  updated_at: string;
}

interface UserOption {
  id: string;
  nome: string;
  email: string;
  role: string;
}

function formatDateExtenso(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(m, 10) - 1;
  const day = Number.parseInt(d, 10);
  const date = new Date(year, month, day);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  let prefixo = '';
  if (target.getTime() === hoje.getTime()) {
    prefixo = 'Hoje, ';
  } else if (target.getTime() === ontem.getTime()) {
    prefixo = 'Ontem, ';
  }

  const formatado = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `${prefixo}${formatado.charAt(0).toUpperCase() + formatado.slice(1)}`;
}

export default function DiarioPage() {
  const { user, token, isAdmin, authFetch } = useAuth();

  const [entries, setEntries] = useState<DiarioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatouHoje, setRelatouHoje] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [filterData, setFilterData] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [usersList, setUsersList] = useState<UserOption[]>([]);

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiarioEntry | null>(null);
  const hojeString = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchEntries = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterData) params.append('data', filterData);
      if (filterUser && isAdmin) params.append('userId', filterUser);

      const res = await authFetch(`/api/diario?${params.toString()}`);
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) {
        setEntries(data.dados || []);
        setRelatouHoje(!!data.relatouHoje);
      }
    } catch (err) {
      console.error('Erro ao carregar diário:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await authFetch('/api/usuarios');
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) {
        setUsersList(data.dados || []);
      }
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [token, filterData, filterUser]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [token, isAdmin]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEntries();
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: DiarioEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este relato do diário de bordo?')) return;
    try {
      const res = await authFetch(`/api/diario/${id}`, { method: 'DELETE' });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.ok) {
        setEntries((prev) => prev.filter((item) => item.id !== id));
      } else {
        alert(data.erro || 'Falha ao excluir relato.');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterData('');
    setFilterUser('');
    fetchEntries();
  };

  // Contagem para o resumo de hoje de admins
  const autoresHojeCount = useMemo(() => {
    const hojeEntries = entries.filter((e) => e.data === hojeString);
    const autoresUnicos = new Set(hojeEntries.map((e) => e.user_id));
    return autoresUnicos.size;
  }, [entries, hojeString]);

  return (
    <div className="min-h-screen pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Registro de Rotina e Produtividade</span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-3">
              <BookMarked className="w-8 h-8 text-sky-400" />
              Diário de Bordo
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isAdmin
                ? 'Acompanhe os relatos diários de atividades e tarefas de toda a equipe da biblioteca.'
                : 'Registre suas atividades realizadas, desafios e acompanhe seu histórico diário de trabalho.'}
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold px-5 py-3 rounded-xl shadow-lg shadow-sky-500/25 transition-all text-sm shrink-0"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Relato</span>
          </button>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Status do Colaborador Hoje */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                Seu Relato de Hoje
              </span>
              <div className="mt-2 flex items-center gap-2">
                {relatouHoje ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-base font-bold text-emerald-400">Preenchido com sucesso!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <span className="text-base font-bold text-amber-300">Ainda não registrado</span>
                  </>
                )}
              </div>
            </div>
            {!relatouHoje && (
              <button
                onClick={openCreateModal}
                className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg font-medium transition"
              >
                Preencher
              </button>
            )}
          </div>

          {/* Total de Relatos no Painel */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800">
            <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
              {isAdmin ? 'Relatos Encontrados' : 'Seus Relatos Cadastrados'}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-100">{entries.length}</span>
              <span className="text-xs text-slate-400">registro(s) listados</span>
            </div>
          </div>

          {/* Estatística exclusiva de Admin */}
          {isAdmin ? (
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                Colaboradores Ativos Hoje
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-400">{autoresHojeCount}</span>
                <span className="text-xs text-slate-400">relataram hoje</span>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-5 border border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-sky-400" />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Manter o diário atualizado ajuda a equipe a acompanhar o progresso das demandas e a registrar o histórico de rotinas da biblioteca.
              </p>
            </div>
          )}
        </div>

        {/* Filtros e Busca */}
        <div className="glass-panel rounded-2xl p-4 border border-slate-800 mb-8">
          <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar no título, conteúdo ou demandas relacionadas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500/50 transition-colors"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative">
                <input
                  type="date"
                  value={filterData}
                  onChange={(e) => setFilterData(e.target.value)}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-sky-500/50"
                  title="Filtrar por data específica"
                />
              </div>

              {isAdmin && usersList.length > 0 && (
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-sky-500/50 max-w-[200px]"
                >
                  <option value="">Todos os colaboradores</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="submit"
                className="px-4 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-sm font-medium transition"
              >
                Filtrar
              </button>

              {(search || filterData || filterUser) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-2.5 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 rounded-xl text-sm font-medium transition flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Lista de Registros */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400 mb-3" />
            <p className="text-sm">Carregando relatos do diário de bordo...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800/80 max-w-xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4 text-slate-500">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">Nenhum relato encontrado</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">
              {search || filterData || filterUser
                ? 'Tente remover os filtros para visualizar outros registros.'
                : 'Ainda não há registros no diário de bordo. Seja o primeiro a relatar as atividades de hoje!'}
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primeiro Relato</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const canEdit = entry.user_id === user?.id || isAdmin;

              return (
                <article
                  key={entry.id}
                  className="glass-card rounded-2xl p-6 border border-slate-800 hover:border-slate-700/80 transition-all shadow-sm"
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/60 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-300 font-bold text-sm shrink-0">
                        {entry.user_nome ? entry.user_nome.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-100 text-sm">{entry.user_nome}</h4>
                          {entry.user_id === user?.id && (
                            <span className="text-[10px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-medium">
                              Você
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{entry.user_email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800/80 text-sky-300 border border-slate-700/50">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>{formatDateExtenso(entry.data)}</span>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(entry)}
                            title="Editar relato"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            title="Excluir relato"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Título opcional */}
                  {entry.titulo && (
                    <h3 className="text-base font-bold text-slate-100 mb-2">{entry.titulo}</h3>
                  )}

                  {/* Conteúdo com quebras de linha preservadas */}
                  <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {entry.conteudo}
                  </p>

                  {/* Metadados: Horas e Demandas Relacionadas */}
                  {(entry.horas_trabalhadas || entry.demandas_relacionadas) && (
                    <div className="mt-4 pt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/40 text-xs">
                      {entry.horas_trabalhadas && (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{entry.horas_trabalhadas}h dedicadas</span>
                        </span>
                      )}

                      {entry.demandas_relacionadas && (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg">
                          <Tag className="w-3.5 h-3.5 text-sky-400" />
                          <span>Demandas: {entry.demandas_relacionadas}</span>
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal de Criação / Edição */}
      <DiarioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={fetchEntries}
        editingEntry={editingEntry}
      />
    </div>
  );
}
