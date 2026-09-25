const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { getDb } = require("../db");
const paths = require("../paths");

// Retención escalonada: alcanza para volver hasta un año atrás con ~25 archivos comprimidos.
const KEEP = { recientes: 3, dias: 7, semanas: 4, meses: 12 };
const NAME_RE = /^stocklocal-(\d{8})-(\d{6})(-[a-z-]+)?\.db(\.gz)?$/;

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// La fecha sale del nombre (más confiable que la del archivo si se copió a otra PC).
function dateFromName(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, d, t] = m;
  return new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
}

/** Copia consistente (VACUUM INTO) comprimida con gzip: ocupa ~5 veces menos que la base. */
function createBackup(tag = "") {
  fs.mkdirSync(paths.BACKUP_DIR, { recursive: true });
  const name = `stocklocal-${stamp()}${tag ? `-${tag}` : ""}.db.gz`;
  const file = path.join(paths.BACKUP_DIR, name);
  const raw = path.join(paths.BACKUP_DIR, `.${name}.tmp`);
  try {
    getDb().prepare("VACUUM INTO ?").run(raw);
    fs.writeFileSync(`${file}.part`, zlib.gzipSync(fs.readFileSync(raw), { level: 6 }));
    fs.renameSync(`${file}.part`, file);
  } finally {
    fs.rmSync(raw, { force: true });
    fs.rmSync(`${file}.part`, { force: true });
  }
  prune();
  return { name, size: fs.statSync(file).size };
}

function listBackups() {
  if (!fs.existsSync(paths.BACKUP_DIR)) return [];
  return fs
    .readdirSync(paths.BACKUP_DIR)
    .filter((n) => NAME_RE.test(n))
    .map((name) => ({ name, size: fs.statSync(path.join(paths.BACKUP_DIR, name)).size, fecha: dateFromName(name).toISOString() }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Semana del año (ISO) para agrupar las copias semanales.
function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return `${y}-W${Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)}`;
}

/** Decide qué copias conservar: las más nuevas, una por día, una por semana y una por mes. */
function selectToKeep(backups) {
  const keep = new Set();
  const days = new Set(), weeks = new Set(), months = new Set();
  backups.forEach((b, i) => {
    const d = new Date(b.fecha);
    const dk = d.toDateString(), wk = weekKey(d), mk = `${d.getFullYear()}-${d.getMonth()}`;
    let k = i < KEEP.recientes;
    if (!days.has(dk) && days.size < KEEP.dias) { days.add(dk); k = true; }
    if (!weeks.has(wk) && weeks.size < KEEP.semanas) { weeks.add(wk); k = true; }
    if (!months.has(mk) && months.size < KEEP.meses) { months.add(mk); k = true; }
    if (k) keep.add(b.name);
  });
  return keep;
}

function prune() {
  const all = listBackups();
  const keep = selectToKeep(all);
  for (const b of all) if (!keep.has(b.name)) fs.rmSync(path.join(paths.BACKUP_DIR, b.name), { force: true });
}

function backupPath(name) {
  if (!NAME_RE.test(name)) return null;
  const file = path.join(paths.BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// Restaura una copia (comprimida o no) sobre el archivo de la base. El servidor debe estar detenido.
function restoreFile(backupFile, dbFile) {
  const data = backupFile.endsWith(".gz") ? zlib.gunzipSync(fs.readFileSync(backupFile)) : fs.readFileSync(backupFile);
  if (data.subarray(0, 15).toString() !== "SQLite format 3") throw new Error("El archivo no es una copia válida de StockLocal");
  for (const ext of ["-wal", "-shm"]) fs.rmSync(dbFile + ext, { force: true });
  fs.writeFileSync(`${dbFile}.restaurando`, data);
  fs.renameSync(`${dbFile}.restaurando`, dbFile);
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

// Espacio que ocupa StockLocal en disco, para mostrarlo en Configuración.
function diskUsage(docsDir) {
  const base = ["", "-wal"].reduce((a, ext) => a + (fs.existsSync(paths.DB_FILE + ext) ? fs.statSync(paths.DB_FILE + ext).size : 0), 0);
  return { base, copias: dirSize(paths.BACKUP_DIR), documentos: dirSize(docsDir), registros: dirSize(paths.LOG_DIR) };
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

module.exports = { createBackup, listBackups, backupPath, restoreFile, selectToKeep, diskUsage, scheduleAutoBackups, NAME_RE };
