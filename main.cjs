const { app, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let serverProcess = null;
let logPath = null;
let keepAliveWindow = null;

function getPort() {
  const raw = process.env.PORT || '3000';
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) ? port : 3000;
}

function urlFor(port) {
  return `http://localhost:${port}/`;
}

function healthzUrlFor(port) {
  return `http://localhost:${port}/healthz`;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const { statusCode } = res;
      // consume body to free socket
      res.resume();
      resolve({ statusCode });
    });
    req.on('error', reject);
    req.setTimeout(1500, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function waitForHealthy(port, timeoutMs = 30000) {
  const start = Date.now();
  // simple backoff: 200ms -> 1000ms
  let delay = 200;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await httpGet(healthzUrlFor(port));
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) return;
    } catch (_) {
      // ignore
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Servidor não respondeu a tempo.');
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(1000, Math.round(delay * 1.5));
  }
}

function resolveEnvPath() {
  // Prioridade:
  // 1) pasta do executável (usuário pode editar .env)
  // 2) recursos do app (copiado via extraResources)
  // 3) raiz do projeto (modo dev)
  const exeDir = path.dirname(process.execPath);
  const candidate1 = path.join(exeDir, '.env');
  const candidate2 = path.join(process.resourcesPath, '.env');
  const candidate3 = path.join(app.getAppPath(), '.env');
  return { candidate1, candidate2, candidate3 };
}

function ensureLogFile() {
  if (logPath) return logPath;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, 'local-server.log');
  return logPath;
}

function startServer() {
  const port = getPort();

  const appPath = app.getAppPath();
  const serverJs = path.join(appPath, 'server.js');

  const { candidate1, candidate2, candidate3 } = resolveEnvPath();

  // Faz o dotenv do server.js achar o .env ao definir o cwd.
  // Preferimos o diretório que de fato contém o arquivo.
  const cwd = [candidate1, candidate2, candidate3]
    .map((p) => ({ p, dir: path.dirname(p) }))
    .find(({ p }) => {
      try {
        fs.accessSync(p);
        return true;
      } catch {
        return false;
      }
    })?.dir || appPath;

  const out = fs.createWriteStream(ensureLogFile(), { flags: 'a' });
  out.write(`\n[${new Date().toISOString()}] starting server.js (port=${port}) cwd=${cwd}\n`);

  // No app empacotado, precisamos rodar o Electron "como Node" para executar server.js.
  serverProcess = spawn(process.execPath, [serverJs], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', out, out],
    windowsHide: true,
  });

  out.write(`[${new Date().toISOString()}] server pid: ${serverProcess.pid}\n`);

  serverProcess.on('error', (err) => {
    out.write(`[${new Date().toISOString()}] spawn error: ${String(err?.stack || err)}\n`);
  });

  serverProcess.on('exit', (code, signal) => {
    out.write(
      `[${new Date().toISOString()}] server process exited (code=${String(code)} signal=${String(signal)})\n`,
    );
    serverProcess = null;
  });

  return port;
}

async function openAppInBrowser(port) {
  await shell.openExternal(urlFor(port));
}

function ensureKeepAliveWindow() {
  // Em Windows/Linux, se não existir nenhuma janela, o app pode encerrar sozinho.
  // Criamos uma janela invisível mínima só para manter o processo vivo enquanto
  // o servidor local estiver rodando.
  if (keepAliveWindow) return keepAliveWindow;
  keepAliveWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  keepAliveWindow.loadURL('about:blank').catch(() => {});
  keepAliveWindow.on('closed', () => {
    keepAliveWindow = null;
  });
  return keepAliveWindow;
}

async function boot() {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return;
  }

  // Quando o usuário clicar de novo no app, só abre o navegador.
  app.on('second-instance', async () => {
    const port = getPort();
    await openAppInBrowser(port);
  });

  await app.whenReady();
  ensureKeepAliveWindow();

  const port = getPort();

  // Se já estiver rodando, só abre o navegador.
  try {
    await httpGet(healthzUrlFor(port));
    await openAppInBrowser(port);
    return;
  } catch (_) {
    // não está saudável ainda; tenta iniciar abaixo
  }

  startServer();

  try {
    await waitForHealthy(port, 30000);
  } catch (e) {
    const extra = logPath ? `\n\nLog: ${logPath}` : '';
    dialog.showErrorBox('Erro ao iniciar', `${String(e?.message || e)}${extra}`);
    app.quit();
    return;
  }

  await openAppInBrowser(port);
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch (_) {
    // ignore
  }
  serverProcess = null;
}

app.on('before-quit', () => {
  stopServer();
});

boot();

