const { app, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const dotenv = require('dotenv');

let serverProcess = null;
let logPath = null;
let keepAliveWindow = null;
let activePort = null;

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function getPreferredPort(envFile) {
  if (envFile) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(envFile));
      const raw = parsed.PORT;
      const port = Number.parseInt(String(raw || '').trim(), 10);
      if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    } catch (_) {
      // ignore
    }
  }

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
      const chunks = [];
      let bytes = 0;

      res.on('data', (chunk) => {
        bytes += chunk.length;
        // evita carregar um body grande por engano (healthz deve ser pequeno)
        if (bytes > 64 * 1024) {
          res.destroy(new Error('response too large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        resolve({ statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(1500, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function isOurServerHealthy(port) {
  try {
    const res = await httpGet(healthzUrlFor(port));
    if (res.statusCode !== 200) return false;
    const json = parseJsonSafe(res.body);
    if (!json) return false;
    return json.ok === true && json.service === 'api-demandas';
  } catch (_) {
    return false;
  }
}

async function waitForHealthy(port, timeoutMs = 30000) {
  const start = Date.now();
  // simple backoff: 200ms -> 1000ms
  let delay = 200;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await isOurServerHealthy(port)) return;

    if (Date.now() - start > timeoutMs) {
      throw new Error('Servidor não respondeu a tempo.');
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(1000, Math.round(delay * 1.5));
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

function resolveEnvPath() {
  // Prioridade:
  // - Empacotado:
  //   1) userData (editável, persiste entre updates)
  //   2) pasta do executável (editável, mas pode exigir admin dependendo do install)
  //   3) recursos do app (copiado via extraResources)
  // - Dev: raiz do projeto
  const exeDir = path.dirname(process.execPath);
  const userDataDir = app.getPath('userData');
  const candidateUser = path.join(userDataDir, '.env');
  const candidateExe = path.join(exeDir, '.env');
  const candidateResources = path.join(process.resourcesPath, '.env');
  const candidateDev = path.join(app.getAppPath(), '.env');
  return { candidateUser, candidateExe, candidateResources, candidateDev, userDataDir, exeDir };
}

function ensureUserEnvFile() {
  const { candidateUser, candidateResources, candidateExe, candidateDev, userDataDir } = resolveEnvPath();

  if (!app.isPackaged) {
    if (fileExists(candidateDev)) return candidateDev;
    return fileExists(candidateUser) ? candidateUser : null;
  }

  if (fileExists(candidateUser)) return candidateUser;

  // Primeira execução: copia .env empacotado para userData (local gravável).
  const sources = [candidateResources, candidateExe, candidateDev].filter(Boolean);

  for (const src of sources) {
    if (!fileExists(src)) continue;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      const contents = fs.readFileSync(src);
      fs.writeFileSync(candidateUser, contents, { flag: 'wx' });
      return candidateUser;
    } catch (err) {
      // Se outra instância escreveu primeiro, seguimos com o arquivo existente.
      if (fileExists(candidateUser)) return candidateUser;
      logLine(`[${new Date().toISOString()}] failed to provision user .env from ${src}: ${String(err?.stack || err)}\n`);
      break;
    }
  }

  return null;
}

function ensureLogFile() {
  if (logPath) return logPath;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, 'local-server.log');
  return logPath;
}

function logLine(line) {
  try {
    fs.appendFileSync(ensureLogFile(), line);
  } catch (_) {
    // ignore logging failures
  }
}

function resolveServerEnv() {
  const envFile = ensureUserEnvFile();
  const fallbackCwd = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const cwd = envFile ? path.dirname(envFile) : fallbackCwd;
  return { envFile, cwd };
}

function startServer(port, envInfo = resolveServerEnv()) {
  const appPath = app.getAppPath();
  const serverJs = path.join(appPath, 'server.js');

  const { envFile, cwd } = envInfo;
  const { candidateUser, candidateExe, candidateResources, candidateDev, userDataDir, exeDir } = resolveEnvPath();

  // Faz o dotenv do server.js achar o .env ao definir o cwd.
  // Preferimos o diretório que de fato contém o arquivo.
  const ts = () => new Date().toISOString();
  logLine(`\n[${ts()}] starting server.js (port=${port}) cwd=${cwd}\n`);
  logLine(`[${ts()}] execPath=${process.execPath}\n`);
  logLine(`[${ts()}] serverJs=${serverJs}\n`);
  logLine(`[${ts()}] env candidates: user=${candidateUser} exe=${candidateExe} resources=${candidateResources} dev=${candidateDev}\n`);
  logLine(`[${ts()}] env selected: ${envFile || '(none)'}\n`);

  // Use file descriptor in stdio for broad Electron/Node compatibility.
  const logFd = fs.openSync(ensureLogFile(), 'a');

  try {
    // No app empacotado, precisamos rodar o Electron "como Node" para executar server.js.
    serverProcess = spawn(process.execPath, [serverJs], {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        ELECTRON_RUN_AS_NODE: '1',
        APP_ENV_DIR: cwd,
        APP_ENV_PATH: envFile || '',
        APP_USER_DATA_DIR: userDataDir,
        APP_RESOURCES_DIR: process.resourcesPath,
        APP_EXE_DIR: exeDir,
      },
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });
  } catch (err) {
    logLine(`[${ts()}] spawn throw: ${String(err?.stack || err)}\n`);
    serverProcess = null;
    throw err;
  }

  logLine(`[${ts()}] server pid: ${serverProcess?.pid}\n`);

  serverProcess.on('error', (err) => {
    logLine(`[${ts()}] spawn error: ${String(err?.stack || err)}\n`);
  });

  serverProcess.on('exit', (code, signal) => {
    logLine(`[${ts()}] server process exited (code=${String(code)} signal=${String(signal)})\n`);
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
    await app.whenReady();
    const envInfo = resolveServerEnv();
    const port = activePort || getPreferredPort(envInfo.envFile);
    await openAppInBrowser(port);
  });

  await app.whenReady();
  ensureKeepAliveWindow();

  const envInfo = resolveServerEnv();
  const preferredPort = getPreferredPort(envInfo.envFile);

  // Se já estiver rodando em alguma porta próxima, só abre o navegador.
  const maxPortScan = 20;
  let portToUse = null;

  for (let i = 0; i <= maxPortScan; i += 1) {
    const candidate = preferredPort + i;
    if (candidate >= 65536) break;

    if (await isOurServerHealthy(candidate)) {
      activePort = candidate;
      await openAppInBrowser(candidate);
      return;
    }

    if (await isPortAvailable(candidate)) {
      portToUse = candidate;
      break;
    }
  }

  if (!portToUse) {
    dialog.showErrorBox('Erro ao iniciar', `Não foi possível encontrar uma porta livre a partir de ${preferredPort}.`);
    app.quit();
    return;
  }

  activePort = portToUse;

  try {
    startServer(portToUse, envInfo);
  } catch (e) {
    const extra = logPath ? `\n\nLog: ${logPath}` : '';
    dialog.showErrorBox('Erro ao iniciar', `${String(e?.message || e)}${extra}`);
    app.quit();
    return;
  }

  const healthyPromise = waitForHealthy(portToUse, 30000).then(() => ({ healthy: true }));
  const exitPromise = new Promise((resolve) => {
    const proc = serverProcess;
    if (!proc) {
      resolve({ healthy: false, exited: true });
      return;
    }
    proc.once('exit', (code, signal) => resolve({ healthy: false, exited: true, code, signal }));
  });

  try {
    const result = await Promise.race([healthyPromise, exitPromise]);
    if (!result.healthy) {
      throw new Error('Servidor encerrou antes de ficar pronto.');
    }
  } catch (e) {
    const extra = logPath ? `\n\nLog: ${logPath}` : '';
    dialog.showErrorBox('Erro ao iniciar', `${String(e?.message || e)}${extra}`);
    app.quit();
    return;
  }

  await openAppInBrowser(portToUse);
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
