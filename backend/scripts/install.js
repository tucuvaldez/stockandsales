// Asistente de instalación. Lo ejecuta el técnico una sola vez por PC (INSTALAR.bat).
const fs = require("fs");
const paths = require("../src/paths");
const { initDb, closeDb } = require("../src/db");
const settings = require("../src/settings");
const installer = require("../src/installer");
const p = require("./lib/prompt");

const MODE_LABEL = { local: "LOCAL (solo registro, sin facturación)", facturacion: "FACTURACIÓN ELECTRÓNICA (ARCA/AFIP)" };

async function main() {
  paths.ensureDataDirs();
  if (!fs.existsSync(paths.ENV_FILE)) {
    fs.writeFileSync(paths.ENV_FILE, "# Puerto de la aplicación\nPORT=3000\n# 127.0.0.1 = solo esta PC. 0.0.0.0 = también otras PCs de la red\nHOST=127.0.0.1\n");
  }
  initDb(paths.DB_FILE);

  if (installer.isInstalled()) {
    p.title("StockLocal ya está instalado");
    console.log(`  Modo actual: ${MODE_LABEL[settings.getMode()]}`);
    console.log("  Se actualizaron los archivos del programa. Tus datos no se tocaron.");
    console.log("  Para cambiar el modo usá CAMBIAR_MODO.bat (requiere clave de técnico).\n");
    return;
  }

  p.title("StockLocal - Configuración inicial (técnico)");
  console.log("  ¿Cómo va a usar el sistema este cliente?\n");
  console.log("   [1] LOCAL: stock, ventas y registro de movimientos. Sin facturación.");
  console.log("   [2] FACTURACIÓN: todo lo anterior + facturas electrónicas reales (ARCA/AFIP).\n");
  const choice = await p.askChoice("  Opción", ["1", "2"]);
  const mode = choice === "1" ? "local" : "facturacion";

  const negocio = await p.ask("\n  Nombre del negocio", "Mi negocio");

  const { RUBROS } = require("../src/rubros");
  const rubros = Object.entries(RUBROS);
  console.log("\n  ¿Qué tipo de negocio es? (adapta ejemplos y sugiere categorías; se cambia después)\n");
  rubros.forEach(([, r], i) => console.log(`   [${i + 1}] ${r.nombre}`));
  const rubroIdx = Number(await p.askChoice("\n  Opción", rubros.map((_, i) => String(i + 1)))) - 1;
  const rubro = rubros[rubroIdx][0];

  console.log("\n  CLAVE DE TÉCNICO: la necesitás para cambiar el modo, restablecer contraseñas");
  console.log("  o restaurar copias. NO se la des al cliente. Guardala en un lugar seguro.");
  const techPin = await p.askNewSecret("  Clave de técnico (mín. 6 caracteres)", (v) => (/^\S{6,}$/.test(v) ? null : "Mínimo 6 caracteres, sin espacios."));

  console.log("\n  USUARIO ADMINISTRADOR del cliente (el dueño del negocio):");
  const nombre = await p.ask("  Nombre", "Administrador");
  let usuario;
  for (;;) {
    usuario = (await p.ask("  Usuario para ingresar", "admin")).toLowerCase();
    if (/^[a-z0-9._-]{3,40}$/.test(usuario)) break;
    console.log("  Usá 3 a 40 caracteres: letras, números, punto o guion.");
  }
  const password = await p.askNewSecret("  Contraseña (mín. 6 caracteres)", (v) => (v.length >= 6 ? null : "Mínimo 6 caracteres."));

  const { adminCode, techCode } = await installer.install({ mode, negocio, techPin, rubro, admin: { nombre, usuario, password } });

  p.title("CÓDIGOS DE RECUPERACIÓN - anotalos ahora");
  console.log("  Se muestran UNA sola vez. Sin ellos no hay forma de recuperar una clave olvidada.\n");
  console.log(`  Para el DUEÑO (dárselo en papel):   ${adminCode}`);
  console.log("    Sirve para entrar si se olvida la contraseña: en el ingreso, \"¿Olvidaste tu contraseña?\".");
  console.log("    También se puede generar uno nuevo desde Configuración > Negocio.\n");
  console.log(`  Para VOS, el técnico (no se lo des al cliente):   ${techCode}`);
  console.log("    Si te olvidás la clave de técnico: tecnico\\CAMBIAR_CLAVE_TECNICO.bat con este código.\n");
  await p.ask("  Presioná Enter cuando los hayas anotado");

  p.title("Instalación completa");
  console.log(`  Modo: ${MODE_LABEL[mode]}`);
  console.log(`  Usuario: ${usuario}`);
  if (mode === "facturacion") {
    console.log("\n  Siguiente paso para facturar: ingresá como administrador y abrí");
    console.log("  Configuración > Facturación para cargar CUIT, punto de venta y certificado.");
    console.log("  Empezá en HOMOLOGACIÓN (pruebas) y pasá a PRODUCCIÓN cuando funcione.");
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(`\n  ERROR: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    p.close();
    closeDb();
  });
