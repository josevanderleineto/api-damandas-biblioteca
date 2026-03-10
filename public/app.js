const state = {
  token: localStorage.getItem('token') || '',
  user: null,
};

const els = {
  authView: document.getElementById('authView'),
  adminView: document.getElementById('adminView'),
  collabView: document.getElementById('collabView'),
  userBadge: document.getElementById('userBadge'),
  logoutBtn: document.getElementById('logoutBtn'),
  alerts: document.getElementById('alerts'),
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

function setSession(token, user) {
  state.token = token || '';
  state.user = user || null;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
  renderLayout();
}

function renderLayout() {
  const user = state.user;
  const isLogged = !!(state.token && user);

  els.authView.classList.toggle('hidden', isLogged);
  els.adminView.classList.add('hidden');
  els.collabView.classList.add('hidden');

  els.userBadge.classList.toggle('hidden', !isLogged);
  els.logoutBtn.classList.toggle('hidden', !isLogged);

  if (!isLogged) {
    els.userBadge.textContent = '';
    return;
  }

  els.userBadge.textContent = `${user.nome} (${user.role})`;
  if (['admin', 'root'].includes(user.role)) {
    els.adminView.classList.remove('hidden');
  } else {
    els.collabView.classList.remove('hidden');
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
  const rows = (res.dados || []).map((d) => [d.demanda, d.responsavel, d.email, d.descricao, d.prazo, d.status, d.prioridade]);
  table.innerHTML = tableHTML(['ID', 'Responsável', 'Email', 'Descrição', 'Prazo', 'Status', 'Prioridade'], rows);
}

async function refreshDemandsCollab() {
  const table = document.getElementById('demandsCollabTable');
  const res = await api('/demandas');
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

async function afterLoginRefresh() {
  if (!state.user) return;
  if (['admin', 'root'].includes(state.user.role)) {
    await Promise.all([refreshDemandsAdmin(), refreshUsers(), refreshRequests()]);
  } else {
    await refreshDemandsCollab();
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
