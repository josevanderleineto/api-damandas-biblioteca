#!/bin/zsh

APP_DIR="/Users/vanderleineto/Desktop/UniFTC/sistema_demandas_bilioteca/api-demandas"

cd "$APP_DIR" || exit 1

if [ ! -f ".env" ]; then
  osascript -e 'display alert "Arquivo .env não encontrado" message "Crie o .env antes de iniciar o sistema." as critical'
  exit 1
fi

echo "[1/4] Instalando dependências..."
npm install --silent
if [ $? -ne 0 ]; then
  osascript -e 'display alert "Falha no npm install" message "Verifique conexão e permissões." as critical'
  exit 1
fi

echo "[2/4] Aplicando schema do banco..."
npm run db:migrate
if [ $? -ne 0 ]; then
  osascript -e 'display alert "Falha no db:migrate" message "Verifique DATABASE_URL no .env." as critical'
  exit 1
fi

echo "[3/4] Iniciando servidor..."
nohup node server.js > local-server.log 2>&1 &
PID=$!
sleep 2

if ! kill -0 "$PID" 2>/dev/null; then
  osascript -e 'display alert "Servidor não iniciou" message "Confira local-server.log" as critical'
  exit 1
fi

echo "$PID" > .local-server.pid

echo "[4/4] Abrindo sistema no navegador..."
open "http://localhost:3000"

echo "Sistema iniciado com sucesso. PID: $PID"
osascript -e 'display notification "Sistema iniciado em http://localhost:3000" with title "API Demandas"'
