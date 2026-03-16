# App Desktop (Windows e macOS)

O app desktop inicia o `server.js` localmente e abre o sistema no navegador (`http://localhost:3000/`). Use esta página para gerar instaladores em outras máquinas sem erro.

## Checklist obrigatório antes de gerar
- Node.js 20.x LTS e npm 10.x instalados.
- `npm install` já executado na máquina onde vai gerar.
- Arquivo `.env` presente na raiz (copie de `.env.example` e preencha). Sem ele o build falha, porque é empacotado como recurso extra.
- Credenciais do Google: recomendado `GOOGLE_CREDENTIALS_JSON` no `.env`. Alternativa: `credentials.json`.
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
Para enviar para outra pessoa no Windows, envie o arquivo `*Setup*.exe` gerado dentro de `dist/` (não o `win-unpacked/`).

## Porta e `.env` no app empacotado
- Porta padrão `3000` (ou `PORT` no `.env`). Se a porta estiver ocupada, o app tenta a próxima disponível.
- No Windows/macOS empacotado, na **primeira execução** o app copia o `.env` empacotado para a pasta de dados do usuário (`userData`) para ficar editável e persistir entre updates.
- Para usar `credentials.json` em vez de `GOOGLE_CREDENTIALS_JSON`, coloque o arquivo na mesma pasta do `.env` do `userData` (ou ao lado do executável).

## Quando o Windows diz que é “suspeito”
- Avisos do SmartScreen (“Editor desconhecido”) são esperados em instaladores **não assinados**.
- Para reduzir/evitar esses avisos em distribuição real, gere o instalador com **assinatura de código** (certificado) e configure o electron-builder com as variáveis `CSC_LINK` e `CSC_KEY_PASSWORD`.

## Diagnóstico rápido (quando não abre em outra máquina)
- Abra o log do servidor local: arquivo `local-server.log` dentro da pasta `userData` do app (é mostrado na mensagem de erro ao iniciar).
