# App Desktop (Windows e macOS)

O app desktop inicia o `server.js` localmente e abre o sistema no navegador (`http://localhost:3000/`). Use esta página para gerar instaladores em outras máquinas sem erro.

## Checklist obrigatório antes de gerar
- Node.js 20.x LTS e npm 10.x instalados.
- `npm install` já executado na máquina onde vai gerar.
- Arquivo `.env` presente na raiz (copie de `.env.example` e preencha). Sem ele o build falha, porque é empacotado como recurso extra.
- Credenciais do Google: `GOOGLE_CREDENTIALS_JSON` no `.env` ou arquivo `credentials.json` na raiz.
- Acesso à internet para baixar dependências e toolchain do electron-builder.

## Requisitos por sistema
- **macOS**: macOS 12+ (Intel ou Apple Silicon) com Xcode Command Line Tools (`xcode-select --install`). O `hdiutil` nativo gera o `.dmg`.  
- **Windows**: Windows 10/11 x64. Instalar **Visual Studio Build Tools 2022** (carga “Desktop development with C++”) e **Python 3** (para `node-gyp`). O electron-builder baixa o NSIS automaticamente.

## Rodar em modo desenvolvimento (sem instalador)
```bash
npm run desktop:dev
```

## Gerar instalador (usar sempre o mesmo SO do alvo)
- macOS → `.dmg`:
```bash
npm run build:mac
```
- Windows → `.exe` (NSIS):
```bash
npm run build:win
```
- Build rápido para o SO atual:
```bash
npm run build:all
```

Saídas vão para `dist/` (ex.: `.dmg` ou `.exe`). Não suba esses binários para o GitHub público.

## Porta e `.env` no app empacotado
- Porta padrão `3000` (ou `PORT` no `.env`).
- O `.env` é empacotado junto; você também pode deixar um `.env` ao lado do executável/instalador para trocar configurações depois.
