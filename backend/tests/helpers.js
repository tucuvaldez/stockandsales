const { initDb, getDb } = require("../src/db");
const installer = require("../src/installer");
const TMP_DOCS = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "stocklocal-docs-"));

async function freshDb(mode = "local", { cajaAbierta = true } = {}) {
  initDb(":memory:");
  await installer.install({ mode, negocio: "Test", techPin: "tecnico1", admin: { nombre: "Admin", usuario: "admin", password: "clave123" } });
  const user = getDb().prepare("SELECT id, nombre, usuario, rol FROM users WHERE usuario = 'admin'").get();
  // Los PDF de los tests van a una carpeta temporal, nunca a Documentos del usuario.
  require("../src/settings").set("carpeta_documentos", TMP_DOCS);
  const ctx = { user, ip: "127.0.0.1" };
  if (cajaAbierta) require("../src/services/cash").openSession({ montoInicial: 1000 }, ctx);
  return ctx;
}

function addProduct({ codigo = "P1", precio = 100, stock = 10, alicuota = 21 } = {}) {
  const { lastInsertRowid } = getDb()
    .prepare("INSERT INTO products (codigo, nombre, precio, stock, alicuota_iva) VALUES (?, ?, ?, ?, ?)")
    .run(codigo, `Producto ${codigo}`, precio, stock, alicuota);
  return Number(lastInsertRowid);
}

const stockOf = (id) => getDb().prepare("SELECT stock FROM products WHERE id = ?").get(id).stock;

module.exports = { TMP_DOCS, freshDb, addProduct, stockOf };
