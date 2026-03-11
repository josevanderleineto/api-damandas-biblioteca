# Deploy 24/7 no Google Cloud (Compute Engine)

Objetivo: manter a API e o agendador de lembretes rodando 24 horas por dia numa VM Linux. A interface continua acessível em `http://<IP>:3000`, mas você pode restringir o acesso apenas ao seu IP.

## 1) Criar a VM
- Console do Google Cloud → Compute Engine → Instâncias de VM → Criar.
- Máquina sugerida: e2-micro ou e2-small, Debian/Ubuntu 22.04 LTS.
- Firewall: marque HTTP/HTTPS **ou** crie regra abrindo a porta 3000 somente para seu IP.
- Defina a região/zona próxima e mantenha o fuso `America/Bahia` no sistema.

## 2) Conectar e preparar ambiente
```bash
sudo apt update && sudo apt install -y git curl
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
# PM2 para manter o serviço ativo
sudo npm install -g pm2
```

## 3) Obter o código e configurar variáveis
```bash
git clone <seu-repo-ou-fork> api-demandas
cd api-demandas
cp .env.example .env
```
- Preencha `.env`: `DATABASE_URL`, `JWT_SECRET`, `SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_JSON` (JSON ou base64 do service account), `SMTP_*`, `EMAIL_FROM`.
- Lembretes em 12h: defina `REMINDER_INTERVAL_MINUTES=720`. Para manter o padrão de dias úteis às 10h, deixe vazio.
- Se preferir arquivo, coloque o JSON da credencial em `credentials.json` na raiz.

## 4) Instalar dependências e aplicar schema
```bash
npm install --omit=dev
npm run db:migrate
```

## 5) Subir com PM2 (mantém rodando após logout/reboot)
```bash
pm2 start ecosystem.config.js --name api-demandas
pm2 save
pm2 startup systemd -u $USER --hp $HOME   # copia o comando mostrado e execute
pm2 status
pm2 logs api-demandas
```
- O arquivo `ecosystem.config.js` já define `PORT=3000` e `TZ=America/Bahia`.
- Healthcheck rápido: `curl http://localhost:3000/healthz`.

## 6) (Opcional) Proxy na porta 80/443
- Instale Nginx e crie um server block com `proxy_pass http://127.0.0.1:3000;`.
- Use Certbot se quiser HTTPS público. Caso o sistema seja só para você, limite o firewall ao seu IP e acesse direto pela porta 3000.

## 7) Backup e atualização
- Para atualizar: `git pull` e `pm2 restart api-demandas`.
- Sempre mantenha o `.env` e `credentials.json` fora do controle de versão.

