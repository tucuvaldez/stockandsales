const fs = require("fs");
const paths = require("./src/paths");
require("dotenv").config({ path: paths.ENV_FILE, quiet: true });

const { initDb, closeDb } = require("./src/db");
const settings = require("./src/settings");
const { createApp } = require("./src/app");
const { scheduleAutoBackups } = require("./src/services/backup");

const PORT = Number(process.env.PORT) || 3000;
// Por defecto solo acepta conexiones de esta misma PC. Para usarlo desde otras PCs de la red: HOST=0.0.0.0
const HOST = process.env.HOST || "127.0.0.1";

paths.ensureDataDirs();
if (!fs.existsSync(paths.DB_FILE)) {
  console.error("El sistema no está instalado. Ejecutá INSTALAR.bat primero.");
  process.exit(2);
}

initDb(paths.DB_FILE);
if (!settings.getMode()) {
  console.error("La instalación está incompleta (falta elegir el modo). Ejecutá INSTALAR.bat.");
  process.exit(2);
}

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  fs.writeFileSync(paths.PID_FILE, String(process.pid));
  console.log(`StockLocal en http://localhost:${PORT} | modo: ${settings.getMode()}`);
  scheduleAutoBackups();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`El puerto ${PORT} está ocupado. ¿Ya hay un StockLocal abierto? Si no, cambiá PORT en backend\\.env`);
  else console.error(err);
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    closeDb();
    fs.rmSync(paths.PID_FILE, { force: true });
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
