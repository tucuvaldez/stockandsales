// Herramientas del técnico. Todas piden la clave de técnico definida en la instalación.
//   node scripts/tecnico.js cambiar-modo | restablecer-clave | restaurar | cambiar-clave-tecnico
const fs = require("fs");
const path = require("path");
const paths = require("../src/paths");
const { initDb, closeDb, getDb } = require("../src/db");
const settings = require("../src/settings");
const installer = require("../src/installer");
const backup = require("../src/services/backup");
const launcher = require("./lib/launcher");
const p = require("./lib/prompt");

async function requirePin() {
  for (let i = 0; i < 3; i++) {
    const pin = await p.askHidden("  Clave de técnico");
    if (installer.checkTechPin(pin)) return pin;
    console.log("  Clave incorrecta.");
  }
  throw new Error("Demasiados intentos");
}

async function cambiarModo() {
  p.title("Cambiar modo de uso");
  console.log(`  Modo actual: ${settings.getMode()}\n`);
  const pin = await requirePin();
  console.log("\n   [1] LOCAL (sin facturación)\n   [2] FACTURACIÓN ELECTRÓNICA\n");
  const mode = (await p.askChoice("  Nuevo modo", ["1", "2"])) === "1" ? "local" : "facturacion";
  if (mode === settings.getMode()) return console.log("\n  No hubo cambios.");
  if (mode === "local") console.log("\n  Nota: las facturas ya emitidas se conservan, pero no se podrán emitir nuevas.");
  installer.setMode(mode, pin);
  console.log(`\n  Modo cambiado a: ${mode}`);
  if (await launcher.restartIfRunning()) console.log("  El sistema se reinició para aplicar el cambio.");
}

async function restablecerClave() {
  p.title("Restablecer contraseña de un usuario");
  const pin = await requirePin();
  const users = getDb().prepare("SELECT usuario, nombre, rol, activo FROM users ORDER BY usuario").all();
  console.log("");
  for (const u of users) console.log(`   - ${u.usuario} (${u.nombre}, ${u.rol}${u.activo ? "" : ", desactivado"})`);
  const usuario = (await p.ask("\n  Usuario")).toLowerCase();
  const pass = await p.askNewSecret("  Nueva contraseña (mín. 6)", (v) => (v.length >= 6 ? null : "Mínimo 6 caracteres."));
  await installer.resetPassword(usuario, pass, pin);
  console.log(`\n  Listo. ${usuario} ya puede ingresar con la nueva contraseña.`);
}

async function restaurar() {
  p.title("Restaurar una copia de seguridad");
  await requirePin();
  const list = backup.listBackups();
  if (!list.length) return console.log("  No hay copias en data\\backups.");
  list.slice(0, 20).forEach((b, i) => console.log(`   [${i + 1}] ${new Date(b.fecha).toLocaleString("es-AR")}  ${b.name}`));
  const n = Number(await p.ask("\n  Número de copia a restaurar"));
  const chosen = list[n - 1];
  if (!chosen) throw new Error("Opción inválida");
  console.log("\n  ATENCIÓN: se reemplazarán los datos actuales por los de esa copia.");
  console.log("  (Antes se guarda una copia de los datos actuales, por las dudas.)");
  if ((await p.askChoice("  ¿Continuar?", ["s", "n"])) !== "s") return;

  const wasRunning = await launcher.stop();
  backup.createBackup("antes-de-restaurar");
  closeDb();
  for (const ext of ["-wal", "-shm"]) fs.rmSync(paths.DB_FILE + ext, { force: true });
  fs.copyFileSync(path.join(paths.BACKUP_DIR, chosen.name), paths.DB_FILE);
  initDb(paths.DB_FILE);
  console.log("\n  Copia restaurada.");
  if (wasRunning) {
    await launcher.start({ openBrowser: false });
    console.log("  Sistema reiniciado.");
  }
}

async function cambiarClaveTecnico() {
  p.title("Cambiar clave de técnico");
  const pin = await requirePin();
  const nuevo = await p.askNewSecret("  Nueva clave de técnico", (v) => (/^\S{6,}$/.test(v) ? null : "Mínimo 6 caracteres, sin espacios."));
  installer.changeTechPin(pin, nuevo);
  console.log("\n  Clave de técnico actualizada.");
}

const COMMANDS = { "cambiar-modo": cambiarModo, "restablecer-clave": restablecerClave, restaurar, "cambiar-clave-tecnico": cambiarClaveTecnico };

async function main() {
  const cmd = COMMANDS[process.argv[2]];
  if (!cmd) {
    console.log(`Uso: node scripts/tecnico.js <${Object.keys(COMMANDS).join("|")}>`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(paths.DB_FILE)) throw new Error("El sistema no está instalado. Ejecutá INSTALAR.bat");
  initDb(paths.DB_FILE);
  if (!installer.isInstalled()) throw new Error("La instalación está incompleta. Ejecutá INSTALAR.bat");
  await cmd();
}

main()
  .catch((err) => {
    console.error(`\n  ERROR: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    p.close();
    closeDb();
    console.log("");
  });
