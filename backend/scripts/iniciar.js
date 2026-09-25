// Lo usan INICIAR.bat / DETENER.bat.   node scripts/iniciar.js [--detener] [--sin-navegador]
const fs = require("fs");
const paths = require("../src/paths");
const launcher = require("./lib/launcher");

async function main() {
  if (process.argv.includes("--detener")) {
    console.log((await launcher.stop()) ? "StockLocal se detuvo." : "StockLocal no estaba en ejecución.");
    return;
  }
  if (!fs.existsSync(paths.DB_FILE)) {
    console.error("El sistema no está instalado. Ejecutá INSTALAR.bat primero.");
    process.exitCode = 2;
    return;
  }
  const r = await launcher.start({ openBrowser: !process.argv.includes("--sin-navegador") });
  console.log(r === "running" ? `StockLocal ya estaba abierto: ${launcher.URL}` : `StockLocal iniciado: ${launcher.URL}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
