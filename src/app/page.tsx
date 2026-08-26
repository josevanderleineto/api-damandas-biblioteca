'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { DemandModal } from '@/components/DemandModal';
import { PrazoRequestsModal } from '@/components/PrazoRequestsModal';
import {
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Hourglass,
  Layers,
  Edit,
  Trash2,
  Loader2,
  Filter,
  Users,
  Award,
  Calendar,
  XCircle,
  Play,
  Check,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

function parseDateBr(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const [d, m, y] = dateStr.split('/');
  const day = Number.parseInt(d, 10);
  const month = Number.parseInt(m, 10);
  const year = Number.parseInt(y, 10);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(dateStr: string): number | null {
  const date = parseDateBr(dateStr);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / 86400000);
}

function statusBucket(status: string) {
  const s = String(status || '').trim().toLowerCase();
  if (s.includes('andament')) return 'andamento';
  if (s.includes('conclu') || s.includes('finaliz')) return 'concluida';
  if (s.includes('pend')) return 'pendente';
  return 'outros';
}

function isDoneStatus(status: string) {
  return statusBucket(status) === 'concluida';
}

function isLateDemand(demanda: any): boolean {
  if (!demanda) return false;
  const alerta = String(demanda.alerta || '').normalize('NFKC').trim().toLowerCase();
  if (alerta.includes('atras')) return true;
  if (alerta.includes('prazo')) return false;

  const done = isDoneStatus(demanda.status);
  const prazo = parseDateBr(demanda.prazo);
  if (!prazo) return false;

  if (!done) {
    const du = daysUntil(demanda.prazo);
    return du !== null && du < 0;
  }

  const conclusao = parseDateBr(demanda.conclusao);
  if (!conclusao) return false;
  return conclusao.getTime() > prazo.getTime();
}

function splitTextList(value: string) {
  return String(value || '')
    .split(/[;,|\n\r]/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

export default function DashboardPage() {
  const { token, isAdmin, user, isLoading } = useAuth();
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Filters state
  const [filterResponsavel, setFilterResponsavel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState('');
  const [filterPrazo, setFilterPrazo] = useState('');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
  const [onlyDone, setOnlyDone] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Team Metric & Top N
  const [teamMetric, setTeamMetric] = useState('total');
  const [teamTop, setTeamTop] = useState(10);

  // Modals
  const [isDemandModalOpen, setIsDemandModalOpen] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState<any | null>(null);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);

  const fetchDemandas = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/demandas', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setDemandas(data);
      } else if (data.dados) {
        setDemandas(data.dados);
      } else if (data.erro) {
        setErrorMessage(data.erro);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar demandas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && token) {
      fetchDemandas();
    }
  }, [token, isLoading]);

  const clearFilters = () => {
    setFilterResponsavel('');
    setFilterStatus('');
    setFilterPrioridade('');
    setFilterPrazo('');
    setFilterCreatedFrom('');
    setFilterCreatedTo('');
    setOnlyDone(false);
    setOnlyOverdue(false);
    setSearchQuery('');
  };

  const handleQuickStatus = async (demandaId: string, nextStatus: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/demandas/${demandaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchDemandas();
      } else {
        alert(data.erro || 'Falha ao alterar status.');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm(`Tem certeza que deseja excluir a demanda #${id}?`)) return;
    try {
      const res = await fetch(`/api/demandas/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        fetchDemandas();
      } else {
        alert(data.erro || 'Falha ao remover demanda.');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Distinct Responsáveis & Prioridades for dropdown filters
  const responsaveisOptions = useMemo(() => {
    const set = new Set<string>();
    demandas.forEach((d) => {
      splitTextList(d.responsavel).forEach((t) => set.add(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [demandas]);

  const prioridadesOptions = useMemo(() => {
    const set = new Set<string>();
    demandas.forEach((d) => {
      const p = String(d.prioridade || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [demandas]);

  // Filtered Demandas logic
  const filteredDemandas = useMemo(() => {
    return demandas.filter((d) => {
      if (filterResponsavel) {
        const tokens = splitTextList(d.responsavel).map((t) => t.toLowerCase());
        if (!tokens.includes(filterResponsavel.toLowerCase())) return false;
      }

      if (filterStatus) {
        if (statusBucket(d.status) !== filterStatus) return false;
      }

      if (filterPrioridade) {
        if (String(d.prioridade || '').toLowerCase() !== filterPrioridade.toLowerCase()) return false;
      }

      if (filterPrazo) {
        const diff = daysUntil(d.prazo);
        if (filterPrazo === 'atrasada' && (diff === null || diff >= 0)) return false;
        if (filterPrazo === 'hoje' && diff !== 0) return false;
        if (filterPrazo === 'ate7' && (diff === null || diff < 1 || diff > 7)) return false;
        if (filterPrazo === 'ate14' && (diff === null || diff < 8 || diff > 14)) return false;
        if (filterPrazo === 'futuro' && (diff === null || diff <= 14)) return false;
      }

      if (onlyDone && !isDoneStatus(d.status)) return false;
      if (onlyOverdue && !isLateDemand(d)) return false;

      if (filterCreatedFrom || filterCreatedTo) {
        const created = parseDateBr(d.dataCriacao);
        if (!created) return false;
        if (filterCreatedFrom) {
          const from = new Date(filterCreatedFrom);
          if (created.getTime() < from.getTime()) return false;
        }
        if (filterCreatedTo) {
          const to = new Date(filterCreatedTo);
          to.setHours(23, 59, 59, 999);
          if (created.getTime() > to.getTime()) return false;
        }
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = `${d.demanda} ${d.responsavel} ${d.email} ${d.matricula} ${d.descricao} ${d.status} ${d.prioridade}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    demandas,
    filterResponsavel,
    filterStatus,
    filterPrioridade,
    filterPrazo,
    filterCreatedFrom,
    filterCreatedTo,
    onlyDone,
    onlyOverdue,
    searchQuery,
  ]);

  // Overall Metrics
  const totalCount = demandas.length;
  const pendentesCount = demandas.filter((d) => statusBucket(d.status) === 'pendente').length;
  const andamentoCount = demandas.filter((d) => statusBucket(d.status) === 'andamento').length;
  const concluidasCount = demandas.filter((d) => statusBucket(d.status) === 'concluida').length;
  const abertasCount = totalCount - concluidasCount;
  const atrasadasCount = demandas.filter((d) => isLateDemand(d)).length;

  // On-time rate & average cycle days
  const doneWithDeadlineDemands = demandas.filter((d) => isDoneStatus(d.status) && parseDateBr(d.prazo) && parseDateBr(d.conclusao));
  const doneOnTimeDemands = doneWithDeadlineDemands.filter((d) => {
    const p = parseDateBr(d.prazo)!;
    const c = parseDateBr(d.conclusao)!;
    return c.getTime() <= p.getTime();
  });

  const onTimeRate = doneWithDeadlineDemands.length
    ? Math.round((doneOnTimeDemands.length / doneWithDeadlineDemands.length) * 100)
    : null;

  const cycleDaysArray = demandas
    .filter((d) => isDoneStatus(d.status) && parseDateBr(d.dataCriacao) && parseDateBr(d.conclusao))
    .map((d) => {
      const cr = parseDateBr(d.dataCriacao)!;
      const co = parseDateBr(d.conclusao)!;
      return Math.max(0, Math.round((co.getTime() - cr.getTime()) / 86400000));
    });

  const avgCycleDays = cycleDaysArray.length
    ? (cycleDaysArray.reduce((acc, curr) => acc + curr, 0) / cycleDaysArray.length).toFixed(1)
    : null;

  // Team Performance Computing
  const teamRows = useMemo(() => {
    const map = new Map<string, any>();

    for (const d of demandas) {
      const done = isDoneStatus(d.status);
      const tokens = splitTextList(d.responsavel);
      const keysToCount = tokens.length ? tokens : ['Sem responsável'];
      const isOverdueOpen = !done && isLateDemand(d);

      const prazo = parseDateBr(d.prazo);
      const conclusao = parseDateBr(d.conclusao);
      const hasDeadline = done && prazo && conclusao;
      const doneWithinDeadline = !!(hasDeadline && conclusao.getTime() <= prazo.getTime());

      const created = parseDateBr(d.dataCriacao);
      let cycleDiffDays: number | null = null;
      if (done && created && conclusao) {
        const diff = Math.round((conclusao.getTime() - created.getTime()) / 86400000);
        cycleDiffDays = diff >= 0 ? diff : null;
      }

      for (const key of keysToCount) {
        if (!map.has(key)) {
          map.set(key, {
            responsavel: key,
            total: 0,
            open: 0,
            done: 0,
            overdueOpen: 0,
            doneWithDeadline: 0,
            doneOnTime: 0,
            cycleCount: 0,
            cycleDaysSum: 0,
          });
        }

        const r = map.get(key);
        r.total += 1;
        if (done) r.done += 1;
        else r.open += 1;

        if (isOverdueOpen) r.overdueOpen += 1;

        if (hasDeadline) {
          r.doneWithDeadline += 1;
          if (doneWithinDeadline) r.doneOnTime += 1;
        }

        if (cycleDiffDays !== null) {
          r.cycleCount += 1;
          r.cycleDaysSum += cycleDiffDays;
        }
      }
    }

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      onTimeRate: r.doneWithDeadline ? (r.doneOnTime / r.doneWithDeadline) * 100 : null,
      avgCycleDays: r.cycleCount ? r.cycleDaysSum / r.cycleCount : null,
    }));

    // Sorting
    const sorted = rows.sort((a, b) => {
      let va = a[teamMetric];
      let vb = b[teamMetric];

      if (teamMetric === 'onTimeRate') {
        va = a.onTimeRate;
        vb = b.onTimeRate;
      } else if (teamMetric === 'avgCycleDays') {
        va = a.avgCycleDays;
        vb = b.avgCycleDays;
      }

      if (va === null && vb === null) return a.responsavel.localeCompare(b.responsavel, 'pt-BR');
      if (va === null) return 1;
      if (vb === null) return -1;

      if (va === vb) return a.responsavel.localeCompare(b.responsavel, 'pt-BR');
      return teamMetric === 'avgCycleDays' ? va - vb : vb - va;
    });

    return teamTop > 0 ? sorted.slice(0, teamTop) : sorted;
  }, [demandas, teamMetric, teamTop]);

  // Data for Charts
  const chartStatusData = useMemo(() => {
    return [
      { name: 'Concluídas', value: concluidasCount, color: '#34d399' },
      { name: 'Em Andamento', value: andamentoCount, color: '#38bdf8' },
      { name: 'Pendentes', value: pendentesCount, color: '#fbbf24' },
      { name: 'Atrasadas (Aberto)', value: atrasadasCount, color: '#fb7185' },
    ].filter((item) => item.value > 0);
  }, [concluidasCount, andamentoCount, pendentesCount, atrasadasCount]);

  const chartTeamData = useMemo(() => {
    return [...teamRows].sort((a, b) => b.total - a.total).slice(0, 5).map(r => ({
      name: r.responsavel,
      Concluídas: r.done,
      Abertas: r.open,
    }));
  }, [teamRows]);

  return (
    <div className="min-h-screen pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <LayoutDashboard className="w-7 h-7 text-sky-400" />
              Painel de Demandas
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Gestão de atividades sincronizadas em tempo real com o Google Sheets
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDemandas}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setIsRequestsModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <Clock className="w-4 h-4" />
                  <span>Prorrogações</span>
                </button>

                <button
                  onClick={() => { setSelectedDemanda(null); setIsDemandModalOpen(true); }}
                  className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Demanda</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Global Error Banner if spreadsheet ID missing or API error */}
        {errorMessage && (
          <div className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div className="text-xs">
              <strong className="font-semibold block text-sm">Erro de sincronização:</strong>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Stats Grid Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Total</span>
            <div className="text-xl font-bold text-slate-100 mt-1">{totalCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Abertas</span>
            <div className="text-xl font-bold text-sky-400 mt-1">{abertasCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Pendentes</span>
            <div className="text-xl font-bold text-amber-400 mt-1">{pendentesCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Em Andamento</span>
            <div className="text-xl font-bold text-indigo-400 mt-1">{andamentoCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Concluídas</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">{concluidasCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Atrasadas</span>
            <div className="text-xl font-bold text-rose-400 mt-1">{atrasadasCount}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">No Prazo</span>
            <div className="text-xl font-bold text-emerald-300 mt-1">{onTimeRate !== null ? `${onTimeRate}%` : '-'}</div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block uppercase">Tempo Médio</span>
            <div className="text-xl font-bold text-slate-200 mt-1">{avgCycleDays !== null ? `${avgCycleDays} d` : '-'}</div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Gráfico de Status */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-sky-400" />
              Distribuição por Status
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
              {chartStatusData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  {item.name}: {item.value}
                </div>
              ))}
            </div>
          </div>

          {/* Gráfico de Desempenho por Pessoa */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-800">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-indigo-400" />
              Top 5 Responsáveis (Volume)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartTeamData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    cursor={{ fill: '#1e293b' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f1f5f9' }}
                  />
                  <Bar dataKey="Concluídas" stackId="a" fill="#34d399" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Abertas" stackId="a" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Team Performance Ranking */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                Desempenho por Responsável (Ranking)
              </h2>
              <p className="text-xs text-slate-400">Clique em "Filtrar" para isolar as demandas de uma pessoa</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={teamMetric}
                onChange={(e) => setTeamMetric(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-200"
              >
                <option value="total">Ordenar por Total</option>
                <option value="open">Ordenar por Abertas</option>
                <option value="done">Ordenar por Concluídas</option>
                <option value="overdueOpen">Ordenar por Atrasadas</option>
                <option value="onTimeRate">Ordenar por No Prazo (%)</option>
                <option value="avgCycleDays">Ordenar por Tempo Médio</option>
              </select>

              <select
                value={teamTop}
                onChange={(e) => setTeamTop(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-200"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={20}>Top 20</option>
                <option value={0}>Todos</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Responsável</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Abertas</th>
                  <th className="py-2.5 px-3">Concluídas</th>
                  <th className="py-2.5 px-3">Atrasadas</th>
                  <th className="py-2.5 px-3">No Prazo (%)</th>
                  <th className="py-2.5 px-3">Tempo Médio</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teamRows.map((r) => (
                  <tr key={r.responsavel} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{r.responsavel}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-100">{r.total}</td>
                    <td className="py-2.5 px-3 text-sky-400 font-medium">{r.open}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-medium">{r.done}</td>
                    <td className="py-2.5 px-3 text-rose-400 font-medium">{r.overdueOpen}</td>
                    <td className="py-2.5 px-3 text-slate-300">{r.onTimeRate !== null ? `${Math.round(r.onTimeRate)}%` : '-'}</td>
                    <td className="py-2.5 px-3 text-slate-300">{r.avgCycleDays !== null ? `${r.avgCycleDays.toFixed(1)} dias` : '-'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setFilterResponsavel(r.responsavel)}
                        className="px-2.5 py-1 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[11px] font-semibold transition-colors"
                      >
                        Filtrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Demand Table */}
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
          <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">
              Demandas ({filteredDemandas.length} exibidas)
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
              <span>Puxando dados da planilha no Google Sheets...</span>
            </div>
          ) : filteredDemandas.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Nenhuma demanda encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">ID</th>
                    <th className="py-3.5 px-4">Responsável / E-mail</th>
                    <th className="py-3.5 px-4">Descrição</th>
                    <th className="py-3.5 px-4">Prazo</th>
                    <th className="py-3.5 px-4">Status & Ação Rápida</th>
                    <th className="py-3.5 px-4">Prioridade</th>
                    <th className="py-3.5 px-4">Alerta</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDemandas.map((d) => {
                    const statusNorm = (d.status || '').toLowerCase();
                    const isConcluido = statusNorm.includes('conclu');
                    const isAndamento = statusNorm.includes('andament');
                    const isPendente = statusNorm.includes('pend') || !statusNorm;
                    const isAtrasado = isLateDemand(d);

                    return (
                      <tr key={d.demanda} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-100 font-mono">
                          #{d.demanda}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">{d.responsavel || '-'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{d.email || '-'}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-300" title={d.descricao}>
                          {d.descricao}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                          {d.prazo || '-'}
                        </td>
                        <td className="py-3.5 px-4 space-y-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isConcluido
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isAndamento
                                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {d.status || 'Pendente'}
                          </span>

                          {/* Quick status transition buttons */}
                          <div className="flex items-center gap-1.5 pt-1">
                            {isPendente && (
                              <button
                                onClick={() => handleQuickStatus(d.demanda, 'Em andamento')}
                                className="px-2 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[10px] font-bold border border-sky-500/20 flex items-center gap-1"
                              >
                                <Play className="w-2.5 h-2.5" />
                                Iniciar
                              </button>
                            )}
                            {isAndamento && (
                              <button
                                onClick={() => handleQuickStatus(d.demanda, 'Concluído')}
                                className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1"
                              >
                                <Check className="w-2.5 h-2.5" />
                                Concluir
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-medium">
                          {d.prioridade || '-'}
                        </td>
                        <td className="py-3.5 px-4">
                          {isAtrasado ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                              🔴 ATRASADO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              🟢 NO PRAZO
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => { setSelectedDemanda(d); setIsDemandModalOpen(true); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                              title="Ver / Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(d.demanda)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Demand Modal */}
      <DemandModal
        isOpen={isDemandModalOpen}
        onClose={() => setIsDemandModalOpen(false)}
        demanda={selectedDemanda}
        onSaved={fetchDemandas}
      />

      {/* Deadline Extension Requests Modal */}
      <PrazoRequestsModal
        isOpen={isRequestsModalOpen}
        onClose={() => setIsRequestsModalOpen(false)}
        onDecided={fetchDemandas}
      />
    </div>
  );
}
