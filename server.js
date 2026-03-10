try {
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (error) {
  // segue sem dotenv
}

const path = require('path');
const express = require('express');
const cors = require('cors');

const demandasRoutes = require('./routes/demandas');
const authRoutes = require('./routes/auth');
const reminderService = require('./services/reminderService');
const notificationService = require('./services/notificationService');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

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

  reminderService.iniciarAgendadorLembretes();

  if (notificationService.isEnabled()) {
    console.log('Notificações por e-mail ativas.');
  } else {
    console.log(`Notificações por e-mail inativas: ${notificationService.getDisabledReason()}`);
  }
});
