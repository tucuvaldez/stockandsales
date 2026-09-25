// Genera release/StockLocal-<versión>.zip listo para llevar a la PC del cliente:
// incluye la interfaz compilada y los componentes, así la instalación no necesita internet.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const { version } = require(path.join(ROOT, "package.json"));
const NAME = `StockLocal-${version}`;
const OUT = path.join(ROOT, "release", NAME);
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: "inherit" });

console.log("> Tests");
run("npm test");
console.log("> Compilando interfaz");
run("npm run build", path.join(ROOT, "frontend"));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (rel) => fs.cpSync(path.join(ROOT, rel), path.join(OUT, rel), { recursive: true });
["INSTALAR.bat", "INICIAR.bat", "DETENER.bat", "LEEME.md", "tecnico", "frontend/dist",
 "backend/server.js", "backend/package.json", "backend/package-lock.json", "backend/.env.example", "backend/src", "backend/scripts"].forEach(copy);
fs.copyFileSync(path.join(ROOT, "INSTALL_GUIDE.md"), path.join(OUT, "tecnico", "GUIA_TECNICO.md"));

console.log("> Instalando componentes de producción");
run("npm ci --omit=dev --no-audit --no-fund", path.join(OUT, "backend"));

const zip = path.join(ROOT, "release", `${NAME}.zip`);
fs.rmSync(zip, { force: true });
if (process.platform === "win32") {
  run(`powershell -NoProfile -Command "Compress-Archive -Path '${OUT}' -DestinationPath '${zip}'"`);
} else {
  run(`zip -qr "${zip}" "${NAME}"`, path.join(ROOT, "release"));
}
console.log(`\nListo: ${zip}`);
