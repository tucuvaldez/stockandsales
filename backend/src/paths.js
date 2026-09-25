const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.resolve(process.env.STOCKLOCAL_DATA || path.join(ROOT, "data"));

const paths = {
  ROOT,
  DATA_DIR,
  DB_FILE: path.join(DATA_DIR, "stocklocal.db"),
  BACKUP_DIR: path.join(DATA_DIR, "backups"),
  LOG_DIR: path.join(DATA_DIR, "logs"),
  PID_FILE: path.join(DATA_DIR, "server.pid"),
  FRONTEND_DIST: path.join(ROOT, "frontend", "dist"),
  ENV_FILE: path.join(ROOT, "backend", ".env"),
};

function ensureDataDirs() {
  for (const dir of [paths.DATA_DIR, paths.BACKUP_DIR, paths.LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { ...paths, ensureDataDirs };
