# App Desktop (Windows e macOS)

Este projeto agora pode ser executado como **aplicativo desktop**: ao abrir o app, ele **inicia o `server.js`** e **abre o sistema no navegador** (por padrão em `http://localhost:3000/`).

## Requisitos

- Node.js instalado (para **gerar** o app)
- `npm install` executado

## Rodar em modo desenvolvimento (sem gerar instalador)

```bash
npm run desktop:dev
```

## Gerar instalador

### macOS

```bash
npm run desktop:build:mac
```

Saída em `dist-desktop/` (ex.: `.dmg`).

### Windows

```bash
npm run desktop:build:win
```

Saída em `dist-desktop/` (ex.: instalador `nsis` `.exe`).

## Configuração de porta e `.env`

- A porta padrão é `3000` (ou `PORT` no `.env`).
- No app empacotado, o `.env` é copiado junto como recurso; você também pode manter um `.env` ao lado do executável para facilitar ajustes.

