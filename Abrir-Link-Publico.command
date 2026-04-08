#!/bin/zsh

APP_DIR="/Users/vanderleineto/Desktop/UniFTC/sistema_demandas_bilioteca/api-demandas"

cd "$APP_DIR" || exit 1

if [ ! -f ".env" ]; then
  osascript -e 'display alert "Arquivo .env não encontrado" message "Crie o .env antes de abrir o sistema." as critical'
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm install --silent
  if [ $? -ne 0 ]; then
    osascript -e 'display alert "Falha no npm install" message "Verifique conexão e permissões." as critical'
    exit 1
  fi
fi

npm run db:migrate
if [ $? -ne 0 ]; then
  osascript -e 'display alert "Falha no db:migrate" message "Verifique DATABASE_URL no .env." as critical'
  exit 1
fi

npm run desktop:dev
