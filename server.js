try {
  // opcional: só carrega .env se dotenv estiver instalado
  // para instalar: npm i dotenv
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (error) {
  // segue sem dotenv
}

const express = require('express');
const cors = require('cors');

const demandasRoutes = require('./routes/demandas');
const reminderService = require('./services/reminderService');
const notificationService = require('./services/notificationService');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/demandas', demandasRoutes);

app.listen(3000, () => {
  console.log('API rodando na porta 3000');

  reminderService.iniciarAgendadorLembretes();

  if (notificationService.isEnabled()) {
    console.log('Notificações por e-mail ativas.');
  } else {
    console.log(`Notificações por e-mail inativas: ${notificationService.getDisabledReason()}`);
  }
});
