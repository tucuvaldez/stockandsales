const { getDb, nowIso } = require("../db");
const { badRequest, notFound } = require("../errors");

/**
 * Único punto donde cambia el stock. Siempre deja un movimiento con stock antes/después,
 * así el historial explica cada unidad. Debe llamarse dentro de una transacción.
 */
function changeStock({ productId, delta, setTo, tipo, motivo = "", refTipo = null, refId = null, user = null }) {
  const db = getDb();
  const product = db.prepare("SELECT id, codigo, nombre, stock FROM products WHERE id = ?").get(productId);
  if (!product) throw notFound("Producto no encontrado");

  const antes = product.stock;
  const despues = setTo !== undefined ? setTo : antes + delta;
  if (!Number.isInteger(despues)) throw badRequest("La cantidad debe ser un número entero");
  if (despues < 0) {
    throw badRequest(`Stock insuficiente para "${product.nombre}" (disponible: ${antes})`);
  }

  db.prepare("UPDATE products SET stock = ?, updated_at = ? WHERE id = ?").run(despues, nowIso(), productId);
  db.prepare(
    `INSERT INTO movements (fecha, tipo, product_id, codigo, nombre, cantidad, stock_antes, stock_despues, motivo, ref_tipo, ref_id, user_id, usuario_nombre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nowIso(), tipo, product.id, product.codigo, product.nombre, despues - antes, antes, despues,
    motivo, refTipo, refId, user?.id ?? null, user?.nombre ?? "Sistema"
  );

  return { antes, despues };
}

module.exports = { changeStock };
