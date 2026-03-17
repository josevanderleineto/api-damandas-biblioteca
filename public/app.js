function safeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

const DEFAULT_DASHBOARD_FILTERS = Object.freeze({
  responsavel: '',
  status: '',
  prioridade: '',
  prazo: '',
  createdFrom: '',
  createdTo: '',
  onlyDone: false,
  onlyOverdue: false,
  query: '',
});

const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  activeView: 'demandas',
  demandas: [],
  demandasUpdatedAt: null,
  charts: {},
  dashboardFilters: { ...DEFAULT_DASHBOARD_FILTERS },
  teamMetric: localStorage.getItem('teamMetric') || 'total',
  teamTop: safeInt(localStorage.getItem('teamTop'), 10),
};

const els = {
  authView: document.getElementById('authView'),
  adminView: document.getElementById('adminView'),
  collabView: document.getElementById('collabView'),
  dashboardView: document.getElementById('dashboardView'),
  mainNav: document.getElementById('mainNav'),
  tabButtons: Array.from(document.querySelectorAll('[data-view]')),
  userBadge: document.getElementById('userBadge'),
  logoutBtn: document.getElementById('logoutBtn'),
  alerts: document.getElementById('alerts'),
  statTotal: document.getElementById('statTotal'),
  statDone: document.getElementById('statDone'),
  statLate: document.getElementById('statLate'),
  statSoon: document.getElementById('statSoon'),
  statStatusLabel: document.getElementById('statStatusLabel'),
  dashboardTable: document.getElementById('dashboardTable'),
  dashboardUpdatedAt: document.getElementById('dashboardUpdatedAt'),
  teamTable: document.getElementById('teamTable'),
  teamMetricSelect: document.getElementById('teamMetricSelect'),
  teamTopSelect: document.getElementById('teamTopSelect'),
  dashboardFilterResponsavel: document.getElementById('dashboardFilterResponsavel'),
  dashboardFilterStatus: document.getElementById('dashboardFilterStatus'),
  dashboardFilterPrioridade: document.getElementById('dashboardFilterPrioridade'),
  dashboardFilterPrazo: document.getElementById('dashboardFilterPrazo'),
  dashboardFilterCreatedFrom: document.getElementById('dashboardFilterCreatedFrom'),
  dashboardFilterCreatedTo: document.getElementById('dashboardFilterCreatedTo'),
  dashboardFilterOnlyDone: document.getElementById('dashboardFilterOnlyDone'),
  dashboardFilterOnlyOverdue: document.getElementById('dashboardFilterOnlyOverdue'),
  dashboardFilterQuery: document.getElementById('dashboardFilterQuery'),
  dashboardFilterSummary: document.getElementById('dashboardFilterSummary'),
  dashboardClearFiltersBtn: document.getElementById('dashboardClearFiltersBtn'),
  dashboardReloadBtn: document.getElementById('dashboardReloadBtn'),
};

function showAlert(type, message) {
  const div = document.createElement('div');
  div.className = `alert ${type}`;
  div.textContent = message;
  els.alerts.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function normalizeErr(err) {
  if (!err) return 'Erro inesperado.';
  return err.erro || err.message || 'Erro inesperado.';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

function parseDateBr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const [d, m, y] = dateStr.split('/');
  const day = Number.parseInt(d, 10);
  const month = Number.parseInt(m, 10);
  const year = Number.parseInt(y, 10);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(dateStr) {
  const date = parseDateBr(dateStr);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / 86400000);
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function statusBucket(status) {
  const s = normalizeStatus(status);
  if (s.includes('andament')) return 'andamento';
  if (s.includes('conclu') || s.includes('finaliz')) return 'concluida';
  if (s.includes('pend')) return 'pendente';
  return 'outros';
}

function isDoneStatus(status) {
  return statusBucket(status) === 'concluida';
}

function parseDateInput(value) {
  if (!value || typeof value !== 'string') return null;
  const [yyyy, mm, dd] = value.split('-');
  if (!yyyy || !mm || !dd) return null;
  const year = Number.parseInt(yyyy, 10);
  const month = Number.parseInt(mm, 10);
  const day = Number.parseInt(dd, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function prazoBucket(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === null) return '';
  if (diff < 0) return 'atrasada';
  if (diff === 0) return 'hoje';
  if (diff <= 7) return 'ate7';
  if (diff <= 14) return 'ate14';
  return 'futuro';
}

function isLateDemand(demanda) {
  if (!demanda) return false;

  const done = isDoneStatus(demanda.status);
  const prazo = parseDateBr(demanda.prazo);
  if (!prazo) return false;

  if (!done) {
    return daysUntil(demanda.prazo) < 0;
  }

  const conclusao = parseDateBr(demanda.conclusao);
  if (!conclusao) return false;

  return conclusao.getTime() > prazo.getTime();
}

function isAdminRole(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'root';
}

function setDemandasCache(list = []) {
  state.demandas = Array.isArray(list) ? list : [];
  state.demandasUpdatedAt = new Date();
}

function setSession(token, user) {
  state.token = token || '';
  state.user = user || null;
  state.activeView = 'demandas';
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
  renderLayout();
}

function renderLayout() {
  const user = state.user;
  const isLogged = !!(state.token && user);

  document.body.classList.toggle('auth-mode', !isLogged);

  els.authView.classList.toggle('hidden', isLogged);
  els.mainNav.classList.toggle('hidden', !isLogged);
  els.adminView.classList.add('hidden');
  els.collabView.classList.add('hidden');
  els.dashboardView.classList.add('hidden');

  els.userBadge.classList.toggle('hidden', !isLogged);
  els.logoutBtn.classList.toggle('hidden', !isLogged);

  if (!isLogged) {
    els.userBadge.textContent = '';
    els.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === 'demandas'));
    return;
  }

  els.userBadge.textContent = `${user.nome} (${user.role})`;
  els.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.activeView));

  if (state.activeView === 'dados') {
    els.dashboardView.classList.remove('hidden');
    return;
  }

  if (isAdminRole(user)) els.adminView.classList.remove('hidden');
  else els.collabView.classList.remove('hidden');
}

function setActiveView(view) {
  const next = view === 'dados' ? 'dados' : 'demandas';
  state.activeView = next;
  renderLayout();
  if (next === 'dados') {
    refreshDashboard();
  }
}

async function loadMe() {
  if (!state.token) {
    renderLayout();
    return;
  }

  try {
    const res = await api('/auth/me');
    state.user = res.user;
    renderLayout();
    await afterLoginRefresh();
  } catch (error) {
    setSession('', null);
  }
}

function tableHTML(headers, rows) {
  const th = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const td = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('');
  return th + td;
}

async function refreshDemandsAdmin() {
  const table = document.getElementById('demandsAdminTable');
  const res = await api('/demandas');
  setDemandasCache(res.dados || []);
  if (state.activeView === 'dados') renderDashboard(state.demandas);
  const rows = (res.dados || []).map((d) => [
    d.demanda,
    d.responsavel,
    d.email,
    d.descricao,
    d.prazo,
    d.status,
    d.prioridade,
    `<button class="btn danger" onclick="deleteDemand('${String(d.demanda || '').replace(/'/g, "\\'")}')">Remover</button>`,
  ]);
  table.innerHTML = tableHTML(['ID', 'Responsável', 'Email', 'Descrição', 'Prazo', 'Status', 'Prioridade', 'Ação'], rows);
}

async function refreshDemandsCollab() {
  const table = document.getElementById('demandsCollabTable');
  const res = await api('/demandas');
  setDemandasCache(res.dados || []);
  if (state.activeView === 'dados') renderDashboard(state.demandas);
  const rows = (res.dados || []).map((d) => [d.demanda, d.descricao, d.prazo, d.status, d.prioridade, d.alerta]);
  table.innerHTML = tableHTML(['ID', 'Descrição', 'Prazo', 'Status', 'Prioridade', 'Alerta'], rows);
}

async function refreshUsers() {
  const table = document.getElementById('usersTable');
  const res = await api('/auth/users');
  const rows = (res.dados || []).map((u) => [
    u.nome,
    u.email,
    u.role,
    u.ativo ? 'Ativo' : 'Inativo',
    `<button class="btn ghost" onclick="toggleUser('${u.id}', ${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>`,
  ]);
  table.innerHTML = tableHTML(['Nome', 'Email', 'Perfil', 'Status', 'Ação'], rows);
}

async function refreshRequests() {
  const table = document.getElementById('requestsTable');
  const res = await api('/demandas/prazo-solicitacoes?pending=true');
  const rows = (res.dados || []).map((r) => [
    r.id,
    r.demanda_id,
    r.requester_email,
    r.prazo_atual,
    r.prazo_solicitado,
    r.motivo,
    `<div style="display:flex;gap:6px"><button class="btn accent" onclick="decideRequest(${r.id}, 'approved')">Aprovar</button><button class="btn danger" onclick="decideRequest(${r.id}, 'rejected')">Reprovar</button></div>`,
  ]);
  table.innerHTML = tableHTML(['Req', 'Demanda', 'Solicitante', 'Prazo Atual', 'Novo Prazo', 'Motivo', 'Ação'], rows);
}

function renderChart(id, config) {
  if (typeof Chart === 'undefined') return null;
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(canvas, config);
  return state.charts[id];
}

function buildStatusDataset(demandas) {
  const buckets = { pendente: 0, andamento: 0, concluida: 0, outros: 0 };
  demandas.forEach((d) => {
    const bucket = statusBucket(d.status);
    buckets[bucket] += 1;
  });
  return {
    labels: ['Pendente', 'Em andamento', 'Concluída', 'Outros'],
    data: [buckets.pendente, buckets.andamento, buckets.concluida, buckets.outros],
  };
}

function formatNumberPt(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function setSelectOptions(selectEl, items, { allLabel = 'Todos' } = {}) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.replaceChildren();

  const add = (value, label) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  };

  add('', allLabel);
  (items || []).forEach((it) => add(it.value, it.label));

  const values = new Set(Array.from(selectEl.options).map((o) => o.value));
  selectEl.value = values.has(current) ? current : '';
}

function populateDashboardFilterOptions(allDemandas) {
  const demandas = Array.isArray(allDemandas) ? allDemandas : [];

  if (els.dashboardFilterResponsavel) {
    const set = new Set();
    let hasNone = false;

    demandas.forEach((d) => {
      const r = String(d.responsavel || '').trim();
      if (r) set.add(r);
      else hasNone = true;
    });

    const items = Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((r) => ({ value: r, label: r }));

    if (hasNone) {
      items.unshift({ value: '__none__', label: 'Sem responsável' });
    }

    setSelectOptions(els.dashboardFilterResponsavel, items, { allLabel: 'Todos' });
  }

  if (els.dashboardFilterPrioridade) {
    const set = new Set();
    let hasNone = false;

    demandas.forEach((d) => {
      const p = String(d.prioridade || '').trim();
      if (p) set.add(p);
      else hasNone = true;
    });

    const items = Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((p) => ({ value: p, label: p }));

    if (hasNone) {
      items.unshift({ value: '__none__', label: 'Sem prioridade' });
    }

    setSelectOptions(els.dashboardFilterPrioridade, items, { allLabel: 'Todas' });
  }
}

function buildPrazoDataset(demandas) {
  const buckets = { atrasada: 0, hoje: 0, ate7: 0, ate14: 0, futuro: 0 };
  demandas.forEach((d) => {
    const bucket = prazoBucket(d.prazo);
    if (!bucket) return;
    buckets[bucket] += 1;
  });
  return {
    labels: ['Atrasadas', 'Hoje', '1-7 dias', '8-14 dias', '>14 dias'],
    data: [buckets.atrasada, buckets.hoje, buckets.ate7, buckets.ate14, buckets.futuro],
  };
}

function readDashboardFiltersFromUI() {
  return {
    responsavel: els.dashboardFilterResponsavel?.value || '',
    status: els.dashboardFilterStatus?.value || '',
    prioridade: els.dashboardFilterPrioridade?.value || '',
    prazo: els.dashboardFilterPrazo?.value || '',
    createdFrom: els.dashboardFilterCreatedFrom?.value || '',
    createdTo: els.dashboardFilterCreatedTo?.value || '',
    onlyDone: !!els.dashboardFilterOnlyDone?.checked,
    onlyOverdue: !!els.dashboardFilterOnlyOverdue?.checked,
    query: String(els.dashboardFilterQuery?.value || ''),
  };
}

function syncDashboardFiltersToUI() {
  if (els.dashboardFilterResponsavel) els.dashboardFilterResponsavel.value = state.dashboardFilters.responsavel || '';
  if (els.dashboardFilterStatus) els.dashboardFilterStatus.value = state.dashboardFilters.status || '';
  if (els.dashboardFilterPrioridade) els.dashboardFilterPrioridade.value = state.dashboardFilters.prioridade || '';
  if (els.dashboardFilterPrazo) els.dashboardFilterPrazo.value = state.dashboardFilters.prazo || '';
  if (els.dashboardFilterCreatedFrom) els.dashboardFilterCreatedFrom.value = state.dashboardFilters.createdFrom || '';
  if (els.dashboardFilterCreatedTo) els.dashboardFilterCreatedTo.value = state.dashboardFilters.createdTo || '';
  if (els.dashboardFilterOnlyDone) els.dashboardFilterOnlyDone.checked = !!state.dashboardFilters.onlyDone;
  if (els.dashboardFilterOnlyOverdue) els.dashboardFilterOnlyOverdue.checked = !!state.dashboardFilters.onlyOverdue;
  if (els.dashboardFilterQuery) els.dashboardFilterQuery.value = state.dashboardFilters.query || '';
}

function filtersActive(filters) {
  const f = filters || {};
  return !!(
    f.responsavel ||
    f.status ||
    f.prioridade ||
    f.prazo ||
    f.createdFrom ||
    f.createdTo ||
    f.onlyDone ||
    f.onlyOverdue ||
    (f.query && String(f.query).trim())
  );
}

function applyDashboardFilters(demandas, filters) {
  const f = filters || DEFAULT_DASHBOARD_FILTERS;

  const respNorm = normalizeText(f.responsavel);
  const prioNorm = normalizeText(f.prioridade);
  const query = normalizeText(f.query);

  const createdFrom = parseDateInput(f.createdFrom);
  const createdTo = parseDateInput(f.createdTo);
  const createdToEnd = createdTo ? endOfDay(createdTo) : null;

  return (Array.isArray(demandas) ? demandas : []).filter((d) => {
    if (f.responsavel) {
      if (f.responsavel === '__none__') {
        if (String(d.responsavel || '').trim()) return false;
      } else if (normalizeText(d.responsavel) !== respNorm) {
        return false;
      }
    }

    if (f.status) {
      if (statusBucket(d.status) !== f.status) return false;
    }

    if (f.prioridade) {
      if (f.prioridade === '__none__') {
        if (String(d.prioridade || '').trim()) return false;
      } else if (normalizeText(d.prioridade) !== prioNorm) {
        return false;
      }
    }

    if (f.prazo) {
      if (prazoBucket(d.prazo) !== f.prazo) return false;
    }

    if (f.onlyDone && !isDoneStatus(d.status)) return false;
    if (f.onlyOverdue && !isLateDemand(d)) return false;

    if (createdFrom || createdToEnd) {
      const created = parseDateBr(d.dataCriacao);
      if (!created) return false;
      if (createdFrom && created.getTime() < createdFrom.getTime()) return false;
      if (createdToEnd && created.getTime() > createdToEnd.getTime()) return false;
    }

    if (query) {
      const hay = [
        d.demanda,
        d.responsavel,
        d.email,
        d.descricao,
        d.status,
        d.prioridade,
        d.prazo,
        d.alerta,
      ]
        .map((v) => normalizeText(v))
        .join(' ');

      if (!hay.includes(query)) return false;
    }

    return true;
  });
}

function buildDashboardFilterSummary(allCount, filteredCount, filters) {
  const f = filters || DEFAULT_DASHBOARD_FILTERS;
  const parts = [];

  if (f.responsavel) {
    parts.push(`Responsável: ${f.responsavel === '__none__' ? 'Sem responsável' : f.responsavel}`);
  }

  if (f.status) {
    const label =
      f.status === 'pendente'
        ? 'Pendente'
        : f.status === 'andamento'
          ? 'Em andamento'
          : f.status === 'concluida'
            ? 'Concluída'
            : 'Outros';
    parts.push(`Status: ${label}`);
  }

  if (f.prioridade) {
    parts.push(`Prioridade: ${f.prioridade === '__none__' ? 'Sem prioridade' : f.prioridade}`);
  }

  if (f.prazo) {
    const label =
      f.prazo === 'atrasada'
        ? 'Atrasadas'
        : f.prazo === 'hoje'
          ? 'Vence hoje'
          : f.prazo === 'ate7'
            ? '1–7 dias'
            : f.prazo === 'ate14'
              ? '8–14 dias'
              : '> 14 dias';
    parts.push(`Prazo: ${label}`);
  }

  if (f.createdFrom) {
    const d = parseDateInput(f.createdFrom);
    parts.push(`Criação ≥ ${d ? d.toLocaleDateString('pt-BR') : f.createdFrom}`);
  }

  if (f.createdTo) {
    const d = parseDateInput(f.createdTo);
    parts.push(`Criação ≤ ${d ? d.toLocaleDateString('pt-BR') : f.createdTo}`);
  }
  if (f.onlyDone) parts.push('Somente concluídas');
  if (f.onlyOverdue) parts.push('Somente atrasadas');
  if (f.query && String(f.query).trim()) parts.push(`Busca: "${String(f.query).trim()}"`);

  const base = filtersActive(f)
    ? `Mostrando ${filteredCount} de ${allCount} demandas.`
    : `Mostrando ${filteredCount} demandas.`;

  return parts.length ? `${base} Filtros: ${parts.join(' • ')}` : base;
}

function computeTeamStats(demandas) {
  const map = new Map();
  const list = Array.isArray(demandas) ? demandas : [];

  for (const d of list) {
    const raw = String(d.responsavel || '').trim();
    const key = raw || 'Sem responsável';

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
        onTimeRate: null,
        avgCycleDays: null,
      });
    }

    const row = map.get(key);
    row.total += 1;

    const done = isDoneStatus(d.status);
    if (done) row.done += 1;
    else row.open += 1;

    const diffPrazo = daysUntil(d.prazo);
    if (!done && diffPrazo !== null && diffPrazo < 0) {
      row.overdueOpen += 1;
    }

    const prazo = parseDateBr(d.prazo);
    const conclusao = parseDateBr(d.conclusao);

    if (done && prazo && conclusao) {
      row.doneWithDeadline += 1;
      if (conclusao.getTime() <= prazo.getTime()) {
        row.doneOnTime += 1;
      }
    }

    if (done) {
      const created = parseDateBr(d.dataCriacao);
      if (created && conclusao) {
        const diffDays = Math.round((conclusao.getTime() - created.getTime()) / 86400000);
        if (Number.isFinite(diffDays) && diffDays >= 0) {
          row.cycleCount += 1;
          row.cycleDaysSum += diffDays;
        }
      }
    }
  }

  const rows = Array.from(map.values());
  rows.forEach((r) => {
    r.onTimeRate = r.doneWithDeadline ? r.doneOnTime / r.doneWithDeadline : null;
    r.avgCycleDays = r.cycleCount ? r.cycleDaysSum / r.cycleCount : null;
  });

  return rows;
}

function teamMetricLabel(metric) {
  if (metric === 'open') return 'Abertas';
  if (metric === 'done') return 'Concluídas';
  if (metric === 'overdueOpen') return 'Atrasadas (abertas)';
  if (metric === 'onTimeRate') return 'No prazo (%)';
  if (metric === 'avgCycleDays') return 'Tempo médio (dias)';
  return 'Total';
}

function teamMetricColor(metric) {
  if (metric === 'done') return '#0f1b6d';
  if (metric === 'open') return '#00a7ff';
  if (metric === 'overdueOpen') return '#c3322d';
  if (metric === 'onTimeRate') return '#00a7ff';
  if (metric === 'avgCycleDays') return '#5b6c86';
  return '#0f1b6d';
}

function getTeamMetricValue(row, metric) {
  if (!row) return null;
  if (metric === 'open') return row.open;
  if (metric === 'done') return row.done;
  if (metric === 'overdueOpen') return row.overdueOpen;
  if (metric === 'onTimeRate') return row.onTimeRate === null ? null : row.onTimeRate * 100;
  if (metric === 'avgCycleDays') return row.avgCycleDays === null ? null : row.avgCycleDays;
  return row.total;
}

function sortTeamRows(rows, metric) {
  const asc = metric === 'avgCycleDays';
  return [...(rows || [])].sort((a, b) => {
    const va = getTeamMetricValue(a, metric);
    const vb = getTeamMetricValue(b, metric);

    if (va === null && vb === null) return a.responsavel.localeCompare(b.responsavel, 'pt-BR');
    if (va === null) return 1;
    if (vb === null) return -1;

    if (va === vb) return a.responsavel.localeCompare(b.responsavel, 'pt-BR');
    return asc ? va - vb : vb - va;
  });
}

function renderTeamTable(teamRows) {
  if (!els.teamTable) return;
  const table = els.teamTable;
  const sorted = sortTeamRows(teamRows, state.teamMetric);

  table.replaceChildren();

  const headers = ['Responsável', 'Total', 'Abertas', 'Concluídas', 'Atrasadas (abertas)', 'No prazo', 'Tempo médio', 'Ação'];

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  headers.forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  const tbody = document.createElement('tbody');
  sorted.forEach((r) => {
    const tr = document.createElement('tr');

    const onTime =
      r.onTimeRate === null
        ? '-'
        : `${formatNumberPt(r.onTimeRate * 100, 0)}% (${r.doneOnTime}/${r.doneWithDeadline})`;

    const avg = r.avgCycleDays === null ? '-' : formatNumberPt(r.avgCycleDays, 1);
    const respValue = r.responsavel === 'Sem responsável' ? '__none__' : r.responsavel;

    const values = [r.responsavel, r.total, r.open, r.done, r.overdueOpen, onTime, avg];
    values.forEach((v) => {
      const td = document.createElement('td');
      td.textContent = String(v ?? '');
      tr.appendChild(td);
    });

    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost';
    btn.textContent = 'Ver';
    btn.addEventListener('click', () => window.filterByResponsavel(respValue));
    tdAction.appendChild(btn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
}

function updateStatCards(demandas) {
  const total = demandas.length;
  const done = demandas.filter((d) => isDoneStatus(d.status)).length;
  const late = demandas.filter((d) => isLateDemand(d)).length;
  const soon = demandas.filter((d) => {
    if (isDoneStatus(d.status)) return false;
    const diff = daysUntil(d.prazo);
    return diff !== null && diff >= 0 && diff <= 14;
  }).length;

  if (els.statTotal) els.statTotal.textContent = total;
  if (els.statDone) els.statDone.textContent = done;
  if (els.statLate) els.statLate.textContent = late;
  if (els.statSoon) els.statSoon.textContent = soon;
  if (els.statStatusLabel) {
    els.statStatusLabel.textContent = filtersActive(state.dashboardFilters) ? `${total} itens (filtrado)` : `${total} itens`;
  }
}

function renderDashboardTable(demandas) {
  if (!els.dashboardTable) return;
  const sorted = [...demandas].sort((a, b) => {
    const da = parseDateBr(a.dataCriacao);
    const db = parseDateBr(b.dataCriacao);
    if (da && db) return db - da;
    return String(b.demanda || '').localeCompare(String(a.demanda || ''));
  });
  const rows = sorted.slice(0, 12).map((d) => [
    d.demanda,
    d.responsavel || '-',
    d.prazo || '-',
    d.status || '-',
    d.prioridade || '',
    d.alerta || '',
  ]);
  els.dashboardTable.innerHTML = tableHTML(['ID', 'Responsável', 'Prazo', 'Status', 'Prioridade', 'Alerta'], rows);
}

function renderDashboard(demandas = state.demandas) {
  const all = Array.isArray(demandas) ? demandas : [];

  populateDashboardFilterOptions(all);

  const allowedMetrics = ['total', 'open', 'done', 'overdueOpen', 'onTimeRate', 'avgCycleDays'];
  if (!allowedMetrics.includes(state.teamMetric)) state.teamMetric = 'total';
  if (!Number.isInteger(state.teamTop) || state.teamTop < 0) state.teamTop = 10;

  if (els.teamMetricSelect) els.teamMetricSelect.value = state.teamMetric;
  if (els.teamTopSelect) els.teamTopSelect.value = String(state.teamTop);

  syncDashboardFiltersToUI();

  const filtered = applyDashboardFilters(all, state.dashboardFilters);

  if (els.dashboardFilterSummary) {
    els.dashboardFilterSummary.textContent = buildDashboardFilterSummary(all.length, filtered.length, state.dashboardFilters);
  }

  updateStatCards(filtered);

  const status = buildStatusDataset(filtered);
  renderChart('chartStatus', {
    type: 'doughnut',
    data: {
      labels: status.labels,
      datasets: [
        {
          data: status.data,
          backgroundColor: ['#ffc857', '#00a7ff', '#0f1b6d', '#5b6c86'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      onHover: (_evt, elements, chart) => {
        chart.canvas.style.cursor = elements?.length ? 'pointer' : 'default';
      },
      onClick: (_evt, elements) => {
        const el = elements?.[0];
        if (!el) return;
        const idx = el.index;
        const buckets = ['pendente', 'andamento', 'concluida', 'outros'];
        const clicked = buckets[idx] || '';
        state.dashboardFilters.status = state.dashboardFilters.status === clicked ? '' : clicked;
        syncDashboardFiltersToUI();
        renderDashboard();
      },
    },
  });

  const teamRows = computeTeamStats(filtered);
  renderTeamTable(teamRows);

  const teamSorted = sortTeamRows(teamRows, state.teamMetric);
  const teamForChart = state.teamTop > 0 ? teamSorted.slice(0, state.teamTop) : teamSorted;
  const teamLabels = teamForChart.map((r) => r.responsavel);
  const teamValues = teamForChart.map((r) => getTeamMetricValue(r, state.teamMetric));

  const teamCanvas = document.getElementById('chartResponsaveis');
  if (teamCanvas) {
    teamCanvas.height = Math.max(240, teamLabels.length * 28);
  }

  renderChart('chartResponsaveis', {
    type: 'bar',
    data: {
      labels: teamLabels,
      datasets: [
        {
          label: teamMetricLabel(state.teamMetric),
          data: teamValues,
          backgroundColor: teamMetricColor(state.teamMetric),
          borderWidth: 0,
          borderRadius: 8,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items?.[0]?.label || '',
            label: (ctx) => {
              const r = teamForChart[ctx.dataIndex];
              if (!r) return '';
              const onTime =
                r.onTimeRate === null
                  ? '—'
                  : `${formatNumberPt(r.onTimeRate * 100, 0)}% (${r.doneOnTime}/${r.doneWithDeadline})`;
              const avg = r.avgCycleDays === null ? '—' : `${formatNumberPt(r.avgCycleDays, 1)} dia(s)`;
              return [
                `Total: ${r.total}`,
                `Abertas: ${r.open}`,
                `Concluídas: ${r.done}`,
                `Atrasadas (abertas): ${r.overdueOpen}`,
                `No prazo: ${onTime}`,
                `Tempo médio: ${avg}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: state.teamMetric === 'onTimeRate' ? 100 : undefined,
          ticks: {
            precision: 0,
            callback: (value) => (state.teamMetric === 'onTimeRate' ? `${value}%` : value),
          },
        },
      },
      onHover: (_evt, elements, chart) => {
        chart.canvas.style.cursor = elements?.length ? 'pointer' : 'default';
      },
      onClick: (_evt, elements, chart) => {
        const el = elements?.[0];
        if (!el) return;
        const idx = el.index;
        const label = String(chart.data.labels?.[idx] || '').trim();
        const value = label === 'Sem responsável' ? '__none__' : label;
        state.dashboardFilters.responsavel = state.dashboardFilters.responsavel === value ? '' : value;
        syncDashboardFiltersToUI();
        renderDashboard();
      },
    },
  });

  const prazo = buildPrazoDataset(filtered);
  renderChart('chartPrazo', {
    type: 'bar',
    data: {
      labels: prazo.labels,
      datasets: [
        {
          data: prazo.data,
          backgroundColor: ['#c3322d', '#ffc857', '#00a7ff', '#6dd3ff', '#d7e4fb'],
          borderWidth: 0,
          borderRadius: 8,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      onHover: (_evt, elements, chart) => {
        chart.canvas.style.cursor = elements?.length ? 'pointer' : 'default';
      },
      onClick: (_evt, elements) => {
        const el = elements?.[0];
        if (!el) return;
        const idx = el.index;
        const buckets = ['atrasada', 'hoje', 'ate7', 'ate14', 'futuro'];
        const clicked = buckets[idx] || '';
        state.dashboardFilters.prazo = state.dashboardFilters.prazo === clicked ? '' : clicked;
        syncDashboardFiltersToUI();
        renderDashboard();
      },
    },
  });

  renderDashboardTable(filtered);

  if (els.dashboardUpdatedAt && state.demandasUpdatedAt) {
    els.dashboardUpdatedAt.textContent = state.demandasUpdatedAt.toLocaleString('pt-BR');
  }
}

async function refreshDashboard(forceReload = false) {
  if (!state.user) return;
  try {
    if (forceReload || state.demandas.length === 0) {
      const res = await api('/demandas');
      setDemandasCache(res.dados || []);
    }
    renderDashboard(state.demandas);
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
}

async function afterLoginRefresh() {
  if (!state.user) return;
  if (isAdminRole(state.user)) {
    await Promise.all([refreshDemandsAdmin(), refreshUsers(), refreshRequests()]);
  } else {
    await refreshDemandsCollab();
  }
  if (state.activeView === 'dados') {
    await refreshDashboard();
  }
}

window.toggleUser = async (id, ativo) => {
  try {
    await api(`/auth/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ ativo }) });
    showAlert('ok', 'Status do usuário atualizado.');
    await refreshUsers();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
};

window.decideRequest = async (id, status) => {
  try {
    await api(`/demandas/prazo-solicitacoes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    showAlert('ok', `Solicitação ${status === 'approved' ? 'aprovada' : 'reprovada'}.`);
    await Promise.all([refreshRequests(), refreshDemandsAdmin()]);
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
};

window.deleteDemand = async (demandaId) => {
  const id = String(demandaId || '').trim();
  if (!id) return;

  const typed = prompt(
    `Remover a demanda #${id}?\n\n` +
      `Essa ação remove pelo sistema (sem precisar apagar manualmente na planilha) e não pode ser desfeita.\n\n` +
      `Digite o ID (${id}) para confirmar:`
  );
  if (String(typed || '').trim() !== id) return;

  try {
    await api(`/demandas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showAlert('ok', `Demanda #${id} removida.`);
    await refreshDemandsAdmin();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
};

window.filterByResponsavel = (responsavel) => {
  const value = String(responsavel || '').trim();
  state.dashboardFilters.responsavel = value;
  syncDashboardFiltersToUI();
  renderDashboard();
};

function initDashboardControls() {
  const filtersForm = document.getElementById('dashboardFiltersForm');
  if (filtersForm) {
    filtersForm.addEventListener('submit', (e) => e.preventDefault());
  }

  if (els.teamMetricSelect) {
    els.teamMetricSelect.value = state.teamMetric;
    els.teamMetricSelect.addEventListener('change', () => {
      state.teamMetric = els.teamMetricSelect.value;
      localStorage.setItem('teamMetric', state.teamMetric);
      renderDashboard();
    });
  }

  if (els.teamTopSelect) {
    els.teamTopSelect.value = String(state.teamTop);
    els.teamTopSelect.addEventListener('change', () => {
      state.teamTop = safeInt(els.teamTopSelect.value, 10);
      localStorage.setItem('teamTop', String(state.teamTop));
      renderDashboard();
    });
  }

  const applyFromUI = () => {
    state.dashboardFilters = readDashboardFiltersFromUI();
    renderDashboard();
  };

  const debouncedQuery = (() => {
    let timeoutId = null;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(applyFromUI, 250);
    };
  })();

  const bind = (el, eventName, handler) => {
    if (!el) return;
    el.addEventListener(eventName, handler);
  };

  bind(els.dashboardFilterResponsavel, 'change', applyFromUI);
  bind(els.dashboardFilterStatus, 'change', applyFromUI);
  bind(els.dashboardFilterPrioridade, 'change', applyFromUI);
  bind(els.dashboardFilterPrazo, 'change', applyFromUI);
  bind(els.dashboardFilterCreatedFrom, 'change', applyFromUI);
  bind(els.dashboardFilterCreatedTo, 'change', applyFromUI);
  bind(els.dashboardFilterOnlyDone, 'change', applyFromUI);
  bind(els.dashboardFilterOnlyOverdue, 'change', applyFromUI);
  bind(els.dashboardFilterQuery, 'input', debouncedQuery);

  bind(els.dashboardClearFiltersBtn, 'click', () => {
    state.dashboardFilters = { ...DEFAULT_DASHBOARD_FILTERS };
    syncDashboardFiltersToUI();
    renderDashboard();
  });

  bind(els.dashboardReloadBtn, 'click', () => {
    refreshDashboard(true);
  });
}

initDashboardControls();

els.tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActiveView(btn.dataset.view));
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: fd.get('email'), senha: fd.get('senha') }),
    });
    setSession(res.token, res.user);
    await afterLoginRefresh();
    showAlert('ok', 'Login realizado com sucesso.');
    e.target.reset();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
});

document.getElementById('createDemandForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api('/demandas', {
      method: 'POST',
      body: JSON.stringify({
        responsavel: fd.get('responsavel'),
        email: fd.get('email'),
        descricao: fd.get('descricao'),
        matricula: fd.get('matricula'),
        prazo: fd.get('prazo'),
        prioridade: fd.get('prioridade'),
      }),
    });
    showAlert('ok', `Demanda #${res.id} criada.`);
    e.target.reset();
    await refreshDemandsAdmin();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
});

document.getElementById('createUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/auth/users', {
      method: 'POST',
      body: JSON.stringify({
        nome: fd.get('nome'),
        email: fd.get('email'),
        senha: fd.get('senha'),
        role: fd.get('role'),
      }),
    });
    showAlert('ok', 'Usuário criado.');
    e.target.reset();
    await refreshUsers();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
});

document.getElementById('updateStatusForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api(`/demandas/${fd.get('demandaId')}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: fd.get('status'),
        conclusao: fd.get('conclusao'),
        tempoExecucao: fd.get('tempoExecucao'),
      }),
    });
    showAlert('ok', 'Status atualizado.');
    await refreshDemandsCollab();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
});

document.getElementById('requestDeadlineForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api(`/demandas/${fd.get('demandaId')}/prazo-solicitacao`, {
      method: 'POST',
      body: JSON.stringify({
        prazoSolicitado: fd.get('prazoSolicitado'),
        motivo: fd.get('motivo'),
      }),
    });
    showAlert('ok', 'Solicitação enviada ao admin.');
    e.target.reset();
  } catch (error) {
    showAlert('err', normalizeErr(error));
  }
});

document.getElementById('refreshUsersBtn').addEventListener('click', refreshUsers);
document.getElementById('refreshRequestsBtn').addEventListener('click', refreshRequests);
document.getElementById('refreshDemandsAdminBtn').addEventListener('click', refreshDemandsAdmin);
document.getElementById('refreshDemandsCollabBtn').addEventListener('click', refreshDemandsCollab);

document.getElementById('logoutBtn').addEventListener('click', async () => {
  setSession('', null);
  showAlert('ok', 'Sessão finalizada.');
});

loadMe();
