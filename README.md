# API Demandas + App Desktop (Windows/macOS)

Este repositório contém o backend (`server.js`) e um **app desktop** que, ao abrir, **inicia o servidor local** e **abre o sistema no navegador** (padrão: `http://localhost:3000/`).

## Requisitos

- Node.js instalado
- `.env` preenchido na pasta do projeto

## Usar local (macOS) sem terminal (1 clique)

> Se você estiver no macOS e quiser usar sem terminal, use os arquivos `.command`:

- **Iniciar sistema**: duplo clique em `Iniciar-Sistema.command` (abre `http://localhost:3000`)
- **Parar sistema**: duplo clique em `Parar-Sistema.command`
- **Abrir no navegador**: duplo clique em `Abrir-Sistema.command`

Observações:

- O script aplica migração de banco automaticamente antes de iniciar.
- Logs ficam em `local-server.log`.

## App Desktop (Windows e macOS) — sem precisar abrir terminal para usar

O app desktop serve para o usuário **clicar no aplicativo** e ele:

- inicia o `server.js`
- espera o endpoint `GET /healthz`
- abre `http://localhost:3000/` no navegador

### Rodar o app desktop (modo desenvolvimento)

```bash
npm install
npm run desktop:dev
```

### Gerar instaladores

Os instaladores são gerados na pasta `dist-desktop/`.

#### macOS (gera `.dmg`)

```bash
npm run desktop:build:mac
```

#### Windows (gera instalador `.exe`/NSIS)

```bash
npm run desktop:build:win
```

> Recomendação: gerar o instalador do **Windows no Windows** e o do **macOS no macOS**.

## Manual de instalação (para o usuário final)

### Windows

1. Baixe o instalador (arquivo `.exe`) gerado em `dist-desktop/`.
2. Dê **duplo clique** no instalador e avance em **Next > Install**.
3. Abra o app pelo **Menu Iniciar** ou atalho.
4. O app vai abrir o navegador em `http://localhost:3000/`.

Se aparecer aviso:

- **Windows SmartScreen**: clique em **Mais informações** → **Executar assim mesmo**.

Desinstalar:

- **Configurações > Aplicativos > Aplicativos instalados** → “Sistema de Demandas (Biblioteca)” → **Desinstalar**.

### macOS

1. Baixe o arquivo `.dmg` gerado em `dist-desktop/`.
2. Abra o `.dmg`.
3. Arraste o app para **Applications (Aplicativos)**.
4. Abra o app em **Aplicativos**.
5. O app vai abrir o navegador em `http://localhost:3000/`.

Se o mac bloquear (desenvolvedor não identificado):

- Clique com botão direito no app → **Abrir** → **Abrir**  
  ou
- **Ajustes do Sistema > Privacidade e Segurança** → permitir/abrir mesmo assim.

Desinstalar:

- Apague o app da pasta **Aplicativos**.

## Porta e `.env`

- Porta padrão: `3000`
- Para mudar: defina `PORT` no `.env`
- No app empacotado: o `.env` é copiado junto como recurso; você também pode manter um `.env` **ao lado do executável** para facilitar ajustes.

