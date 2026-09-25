const { initDb, getDb } = require("../src/db");
const installer = require("../src/installer");

async function freshDb(mode = "local") {
  initDb(":memory:");
  await installer.install({ mode, negocio: "Test", techPin: "tecnico1", admin: { nombre: "Admin", usuario: "admin", password: "clave123" } });
  const user = getDb().prepare("SELECT id, nombre, usuario, rol FROM users WHERE usuario = 'admin'").get();
  return { user, ip: "127.0.0.1" };
}

function addProduct({ codigo = "P1", precio = 100, stock = 10, alicuota = 21 } = {}) {
  const { lastInsertRowid } = getDb()
    .prepare("INSERT INTO products (codigo, nombre, precio, stock, alicuota_iva) VALUES (?, ?, ?, ?, ?)")
    .run(codigo, `Producto ${codigo}`, precio, stock, alicuota);
  return Number(lastInsertRowid);
}

const stockOf = (id) => getDb().prepare("SELECT stock FROM products WHERE id = ?").get(id).stock;

module.exports = { freshDb, addProduct, stockOf };
