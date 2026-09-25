const fs = require("fs");
const path = require("path");
const { getDb } = require("../db");
const paths = require("../paths");

const KEEP = 30;
const NAME_RE = /^stocklocal-\d{8}-\d{6}(-[a-z]+)?\.db$/;

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// VACUUM INTO genera una copia consistente aunque el sistema esté en uso.
function createBackup(tag = "") {
  fs.mkdirSync(paths.BACKUP_DIR, { recursive: true });
  const name = `stocklocal-${stamp()}${tag ? `-${tag}` : ""}.db`;
  const file = path.join(paths.BACKUP_DIR, name);
  getDb().prepare("VACUUM INTO ?").run(file);
  prune();
  return { name, size: fs.statSync(file).size };
}

function listBackups() {
  if (!fs.existsSync(paths.BACKUP_DIR)) return [];
  return fs
    .readdirSync(paths.BACKUP_DIR)
    .filter((n) => NAME_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(paths.BACKUP_DIR, name));
      return { name, size: st.size, fecha: st.mtime.toISOString() };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function prune() {
  for (const b of listBackups().slice(KEEP)) fs.rmSync(path.join(paths.BACKUP_DIR, b.name), { force: true });
}

function backupPath(name) {
  if (!NAME_RE.test(name)) return null;
  const file = path.join(paths.BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// Copia automática al iniciar y luego cada 6 horas si pasaron más de 20 desde la última.
function scheduleAutoBackups(log = console) {
  const run = () => {
    try {
      const last = listBackups()[0];
      if (!last || Date.now() - new Date(last.fecha).getTime() > 20 * 3600 * 1000) {
        const b = createBackup("auto");
        log.log(`Copia de seguridad creada: ${b.name}`);
      }
    } catch (err) {
      log.error("No se pudo crear la copia de seguridad:", err.message);
    }
  };
  run();
  const timer = setInterval(run, 6 * 3600 * 1000);
  timer.unref();
}

module.exports = { createBackup, listBackups, backupPath, scheduleAutoBackups, NAME_RE };
