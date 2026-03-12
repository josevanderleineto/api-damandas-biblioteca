const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  activeView: 'demandas',
  demandas: [],
  demandasUpdatedAt: null,
  charts: {},
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
  const diff = date.getTime() - Date.now();
  return Math.floor(diff / 86400000);
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isAdminRole(user) {
  const role = user?.role;
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
  const rows = (res.dados || []).map((d) => [d.demanda, d.responsavel, d.email, d.descricao, d.prazo, d.status, d.prioridade]);
  table.innerHTML = tableHTML(['ID', 'Responsável', 'Email', 'Descrição', 'Prazo', 'Status', 'Prioridade'], rows);
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
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(canvas, config);
}

function buildStatusDataset(demandas) {
  const buckets = { pendente: 0, andamento: 0, concluida: 0, outros: 0 };
  demandas.forEach((d) => {
    const status = normalizeStatus(d.status);
    if (status.includes('andament')) buckets.andamento += 1;
    else if (status.includes('conclu')) buckets.concluida += 1;
    else if (status.includes('pend')) buckets.pendente += 1;
    else buckets.outros += 1;
  });
  return {
    labels: ['Pendente', 'Em andamento', 'Concluída', 'Outros'],
    data: [buckets.pendente, buckets.andamento, buckets.concluida, buckets.outros],
  };
}

function buildResponsavelDataset(demandas) {
  const counts = {};
  demandas.forEach((d) => {
    const key = d.responsavel?.trim() || 'Sem responsável';
    counts[key] = (counts[key] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    labels: sorted.map((s) => s[0]),
    data: sorted.map((s) => s[1]),
  };
}

function buildPrazoDataset(demandas) {
  const buckets = { atrasada: 0, hoje: 0, ate7: 0, ate14: 0, futuro: 0 };
  demandas.forEach((d) => {
    const diff = daysUntil(d.prazo);
    if (diff === null) return;
    if (diff < 0) buckets.atrasada += 1;
    else if (diff === 0) buckets.hoje += 1;
    else if (diff <= 7) buckets.ate7 += 1;
    else if (diff <= 14) buckets.ate14 += 1;
    else buckets.futuro += 1;
  });
  return {
    labels: ['Atrasadas', 'Hoje', '1-7 dias', '8-14 dias', '>14 dias'],
    data: [buckets.atrasada, buckets.hoje, buckets.ate7, buckets.ate14, buckets.futuro],
  };
}

function updateStatCards(demandas) {
  const total = demandas.length;
  const done = demandas.filter((d) => normalizeStatus(d.status).includes('conclu')).length;
  const late = demandas.filter((d) => {
    const diff = daysUntil(d.prazo);
    return diff !== null && diff < 0;
  }).length;
  const soon = demandas.filter((d) => {
    const diff = daysUntil(d.prazo);
    return diff !== null && diff >= 0 && diff <= 14;
  }).length;

  if (els.statTotal) els.statTotal.textContent = total;
  if (els.statDone) els.statDone.textContent = done;
  if (els.statLate) els.statLate.textContent = late;
  if (els.statSoon) els.statSoon.textContent = soon;
  if (els.statStatusLabel) els.statStatusLabel.textContent = `${total} itens`;
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

function renderDashboard(demandas) {
  updateStatCards(demandas);

  const status = buildStatusDataset(demandas);
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
    options: { plugins: { legend: { position: 'bottom' } } },
  });

  const resp = buildResponsavelDataset(demandas);
  renderChart('chartResponsaveis', {
    type: 'bar',
    data: {
      labels: resp.labels,
      datasets: [
        {
          data: resp.data,
          backgroundColor: '#0f1b6d',
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  const prazo = buildPrazoDataset(demandas);
  renderChart('chartPrazo', {
    type: 'bar',
    data: {
      labels: prazo.labels,
      datasets: [
        {
          data: prazo.data,
          backgroundColor: ['#c3322d', '#ffc857', '#00a7ff', '#6dd3ff', '#d7e4fb'],
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  renderDashboardTable(demandas);

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
  if (['admin', 'root'].includes(state.user.role)) {
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
