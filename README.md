# Sistema de Demandas da Biblioteca

Aplicativo desktop em Electron + API Express para registrar e acompanhar demandas ligadas ao Google Sheets e envio de e-mails via SMTP.

## Uso em localhost (Windows e macOS)
- A equipe continua usando em `http://localhost:3000`. Scripts rápidos: `Iniciar-Sistema.command` (macOS) ou `npm run desktop:dev`.
- Documentos: `GUIA-RAPIDO-LOCAL.md` (uso sem terminal) e `GUIA-APP-DESKTOP.md` (build e execução do app desktop).
- Deploy web no Render: `DEPLOY-RENDER.md`.
- Requisitos: Node.js LTS instalado, `.env` preenchido e `npm install` antes da primeira execução.

## Rodar com Docker
1. Copie `.env.example` para `.env` e preencha. Para usar o Postgres do `docker-compose.yml`, defina `DATABASE_URL=postgresql://api-demandas:api-demandas@db:5432/api-demandas` e `DATABASE_SSL=false`.
2. Suba tudo: `docker compose up --build -d`. O container aplica o schema do banco (`npm run db:migrate`) e inicia a API em `http://localhost:3000`.
3. Primeiro acesso: use as credenciais configuradas em `ROOT_LOGIN`/`ROOT_PASSWORD`.
4. Logs e manutenção:
   - `docker compose logs -f api` — logs da API.
   - `docker compose down` — encerra e remove containers (mantém dados no volume `db_data`).
5. Credenciais do Google: defina `GOOGLE_CREDENTIALS_JSON` no `.env` ou monte um `credentials.json` no caminho `/app/credentials.json` se preferir arquivo.

## Variáveis de ambiente
1. Copie `.env.example` para `.env` e edite **antes** de rodar localmente ou no servidor.
2. Campos essenciais:
   - Banco/Postgres: `DATABASE_URL`, `DATABASE_SSL` (true/false).
   - Autenticação: `JWT_SECRET`, `JWT_EXPIRES_IN`, `ROOT_LOGIN`, `ROOT_PASSWORD`.
   - URLs do sistema: `APP_URL` (base usada em links enviados por e-mail; padrão local `http://localhost:3000`) e `PASSWORD_RESET_URL` (opcional; se vazio, usa `APP_URL`).
   - Execução de agendadores: `BACKGROUND_JOBS_ENABLED` (padrão `true`; use `false` em instâncias secundárias como Render para evitar duplicidade de ciclos automáticos).
   - Google Sheets: `SPREADSHEET_ID`, `SHEET_NAME`, `GOOGLE_CREDENTIALS_JSON` (JSON ou base64). Alternativa: arquivo `credentials.json` na raiz.
   - SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (+ URLs/caminhos de logos opcionais).
   - Lembretes: `REMINDER_INTERVAL_MINUTES` (opcional). Vazio = roda todos os dias às 10:00 (TZ do servidor). Ex.: `720` para lembretes a cada 12h.
   - Monitor da planilha: `ASSIGNMENT_SYNC_INTERVAL_MINUTES` (opcional). Padrão 1 minuto para verificar linhas novas/alteradas direto no Google Sheets e disparar o e-mail de atribuição se ainda não foi enviado.
   - Relatório semanal: `WEEKLY_REPORT_HOUR`, `WEEKLY_REPORT_MINUTE`, `WEEKLY_REPORT_EMAILS` (opcional). Padrão: segunda-feira às 09:00, enviado para todos os usuários ativos com e-mail válido.
3. Nunca versionar `.env` ou `credentials.json`. Quem clonar pelo GitHub deve criar o próprio `.env` com dados reais da sua planilha, banco e e-mail.

## Lembretes automáticos
- O agendador fica em `services/reminderService.js`.
- Padrão: executa todos os dias às 10:00 (fuso definido por `TZ`, padrão `America/Bahia` no `ecosystem.config.js`). Na subida do servidor ele roda imediatamente para cobrir atrasos se a máquina ficou desligada.
- Se `REMINDER_INTERVAL_MINUTES` estiver definido (>0), o ciclo roda a cada N minutos, também sem pular fins de semana.
- Quando o lembrete dispara, ele é enviado diariamente para toda demanda em aberto com e-mail válido, e uma cópia separada é enviada para todos os admins/root ativos. Você também pode forçar cópias administrativas extras com `ADMIN_NOTIFICATION_EMAILS`. Se nenhum admin válido for encontrado, o sistema usa `SMTP_USER` como fallback.
- Evita disparos duplicados no mesmo dia com registro no banco. Endpoint manual para admins: `POST /demandas/notificacoes/lembretes`.

## Relatório semanal das demandas
- O agendador fica em `services/weeklyReportService.js`.
- Padrão: executa toda segunda-feira às 09:00 no fuso configurado em `TZ` (padrão `America/Bahia`). Se o servidor estiver online na segunda, o envio é feito automaticamente no horário configurado.
- O e-mail vai para todos os usuários ativos com endereço válido cadastrado no sistema. Você pode adicionar destinatários extras com `WEEKLY_REPORT_EMAILS`.
- O relatório traz a evolução da semana anterior, com totais atuais, variação em relação ao relatório anterior, demandas criadas no período, concluídas no período, atrasadas e vencendo nos próximos dias.
- Para garantir o envio no horário, mantenha a API/app rodando em uma máquina ligada na segunda-feira. Se o processo estiver desligado, o envio não acontece naquele momento.
- Para reprocessar manualmente, use `POST /demandas/notificacoes/relatorio-semanal`.

## Atribuições criadas direto na planilha
- Serviço `assignmentWatcherService.js` verifica a planilha a cada `ASSIGNMENT_SYNC_INTERVAL_MINUTES` (padrão 1 min).
- Se encontrar uma demanda com e-mail válido que ainda não recebeu a notificação de atribuição (ou mudou responsável/e-mail), envia automaticamente.
- O histórico fica em `demanda_notifications` para evitar e-mails duplicados.
- Endpoint manual para admins: `POST /demandas/notificacoes/atribuicoes` (útil para forçar o disparo imediato).

## Deploy 24/7 (Google Cloud VM)
- Recomendo uma VM Linux no Compute Engine para manter os lembretes ativos mesmo quando ninguém estiver com o app aberto.
- Passo a passo detalhado em `DEPLOY-GCP.md`: instalar Node 20 LTS, configurar `.env`, `npm install --omit=dev`, `npm run db:migrate` e subir com `pm2 start ecosystem.config.js && pm2 save`.
- Restrinja o acesso à porta 3000 (ou use Nginx/HTTPS) e mantenha `TZ=America/Bahia` para horários corretos.

## Empacotar app desktop
- Desenvolvimento: `npm run desktop:dev`.
- Build Windows: `npm run build:win` (gera `.exe` em `dist/`).
- Build macOS: `npm run build:mac` (gera `.dmg` em `dist/`).
- Build para o SO atual: `npm run build:all`.
- Pré-requisitos de build:
  - macOS: Xcode CLT instalado. Para distribuir fora do time, assine/notarize conforme políticas Apple (não obrigatório para uso interno).
  - Windows: ambiente com Node 20 e dependências do `electron-builder`; execute em Windows para gerar o `.exe` assinado com certificado, se houver.

## Licença
MIT License.
