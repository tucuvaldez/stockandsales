const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const paths = require("../../src/paths");
require("dotenv").config({ path: paths.ENV_FILE, quiet: true });

const PORT = Number(process.env.PORT) || 3000;
const URL = `http://localhost:${PORT}`;
const SERVER = path.join(paths.ROOT, "backend", "server.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function health() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function readPid() {
  try {
    const pid = Number(fs.readFileSync(paths.PID_FILE, "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function openBrowser(url = URL) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// Arranca el servidor en segundo plano (sin ventana) y espera a que responda.
async function start({ openBrowser: open = true } = {}) {
  if (await health()) {
    if (open) openBrowser();
    return "running";
  }
  paths.ensureDataDirs();
  const log = fs.openSync(path.join(paths.LOG_DIR, "servidor.log"), "a");
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", SERVER], {
    cwd: path.dirname(SERVER),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  child.unref();

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await health()) {
      if (open) openBrowser();
      return "started";
    }
    if (child.exitCode !== null) break;
  }
  throw new Error(`El sistema no pudo iniciar. Revisá el archivo ${path.join(paths.LOG_DIR, "servidor.log")}`);
}

async function stop() {
  const pid = readPid();
  if (!pid) return false;
  try { process.kill(pid, "SIGTERM"); } catch { return false; }
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    if (!readPid()) break;
  }
  if (readPid()) try { process.kill(pid, "SIGKILL"); } catch { /* ya terminó */ }
  fs.rmSync(paths.PID_FILE, { force: true });
  return true;
}

async function restartIfRunning() {
  if (!(await stop())) return false;
  await start({ openBrowser: false });
  return true;
}

module.exports = { start, stop, restartIfRunning, health, openBrowser, URL };
