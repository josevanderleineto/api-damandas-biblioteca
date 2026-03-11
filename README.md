# Sistema de Demandas da Biblioteca

Aplicativo desktop em Electron + API Express para registrar e acompanhar demandas ligadas ao Google Sheets e envio de e-mails via SMTP.

## Uso em localhost (Windows e macOS)
- A equipe continua usando em `http://localhost:3000`. Scripts rápidos: `Iniciar-Sistema.command` (macOS) ou `npm run desktop:dev`.
- Documentos: `GUIA-RAPIDO-LOCAL.md` (uso sem terminal) e `GUIA-APP-DESKTOP.md` (build e execução do app desktop).
- Requisitos: Node.js LTS instalado, `.env` preenchido e `npm install` antes da primeira execução.

## Variáveis de ambiente
1. Copie `.env.example` para `.env` e edite **antes** de rodar localmente ou no servidor.
2. Campos essenciais:
   - Banco/Postgres: `DATABASE_URL`, `DATABASE_SSL` (true/false).
   - Autenticação: `JWT_SECRET`, `JWT_EXPIRES_IN`, `ROOT_LOGIN`, `ROOT_PASSWORD`.
   - Google Sheets: `SPREADSHEET_ID`, `SHEET_NAME`, `GOOGLE_CREDENTIALS_JSON` (JSON ou base64). Alternativa: arquivo `credentials.json` na raiz.
   - SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (+ URLs/caminhos de logos opcionais).
   - Lembretes: `REMINDER_INTERVAL_MINUTES` (opcional). Vazio = roda dias úteis às 10:00 (TZ do servidor). Ex.: `720` para lembretes a cada 12h.
3. Nunca versionar `.env` ou `credentials.json`. Quem clonar pelo GitHub deve criar o próprio `.env` com dados reais da sua planilha, banco e e-mail.

## Lembretes automáticos
- O agendador fica em `services/reminderService.js`.
- Padrão: executa em dias úteis às 10:00 (fuso definido por `TZ`, padrão `America/Bahia` no `ecosystem.config.js`).
- Novo: se `REMINDER_INTERVAL_MINUTES` estiver definido (>0), o ciclo roda a cada N minutos (pula fins de semana) — útil para lembretes a cada 12h.
- Evita disparos duplicados no mesmo dia com cache interno. Endpoint manual para admins: `POST /demandas/notificacoes/lembretes`.

## Deploy 24/7 (Google Cloud VM)
- Recomendo uma VM Linux no Compute Engine para manter os lembretes ativos mesmo quando ninguém estiver com o app aberto.
- Passo a passo detalhado em `DEPLOY-GCP.md`: instalar Node 20 LTS, configurar `.env`, `npm install --omit=dev`, `npm run db:migrate` e subir com `pm2 start ecosystem.config.js && pm2 save`.
- Restrinja o acesso à porta 3000 (ou use Nginx/HTTPS) e mantenha `TZ=America/Bahia` para horários corretos.

## Empacotar app desktop
- Desenvolvimento: `npm run desktop:dev`.
- Build Windows: `npm run build:win` (gera `.exe` em `dist/`).
- Build macOS: `npm run build:mac` (gera `.dmg` em `dist/`).
- Build rápido para o SO atual: `npm run build:all`.

## Licença
MIT License.
