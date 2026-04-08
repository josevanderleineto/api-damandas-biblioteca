try {
  require('dotenv').config();
} catch (error) {}

const path = require('path');
const express = require('express');
const cors = require('cors');

const demandasRoutes = require('./routes/demandas');
const authRoutes = require('./routes/auth');
const reminderService = require('./services/reminderService');
const notificationService = require('./services/notificationService');
const assignmentWatcherService = require('./services/assignmentWatcherService');
const weeklyReportService = require('./services/weeklyReportService');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

function parseBoolean(value, defaultValue = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on', 'y'].includes(raw);
}

const backgroundJobsEnabled = parseBoolean(process.env.BACKGROUND_JOBS_ENABLED, true);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, service: 'api-demandas', now: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/demandas', demandasRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);

  if (backgroundJobsEnabled) {
    reminderService.iniciarAgendadorLembretes();
    assignmentWatcherService.iniciarMonitorAtribuicoes();
    weeklyReportService.iniciarAgendadorResumoSemanal();
    console.log('Agendadores automáticos ativos.');
  } else {
    console.log('Agendadores automáticos desativados por BACKGROUND_JOBS_ENABLED=false.');
  }

  if (notificationService.isEnabled()) {
    console.log('Notificações por e-mail ativas.');
  } else {
    console.log(`Notificações por e-mail inativas: ${notificationService.getDisabledReason()}`);
  }
});
