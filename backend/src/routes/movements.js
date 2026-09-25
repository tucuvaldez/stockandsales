const express = require("express");
const { getDb } = require("../db");
const { oneOf, id, dateRange, pagination, likeTerm, str } = require("../validate");
const { sendCsv, localDateTime } = require("../csv");

const router = express.Router();
const TIPOS = ["alta", "ingreso", "egreso", "ajuste", "venta", "devolucion", "anulacion"];

function buildFilter(query) {
  const where = [];
  const params = [];
  const { desde, hasta } = dateRange(query.desde, query.hasta);
  if (desde) { where.push("fecha >= ?"); params.push(desde); }
  if (hasta) { where.push("fecha <= ?"); params.push(hasta); }
  if (query.tipo) { where.push("tipo = ?"); params.push(oneOf(query.tipo, TIPOS, { name: "Tipo" })); }
  if (query.productId) { where.push("product_id = ?"); params.push(id(query.productId, "Producto")); }
  if (query.q) {
    where.push("(nombre LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\' OR motivo LIKE ? ESCAPE '\\')");
    const t = likeTerm(str(query.q, { max: 100 }));
    params.push(t, t, t);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

router.get("/", (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 50 });
  const { sql, params } = buildFilter(req.query);
  const db = getDb();
  const rows = db
    .prepare(`SELECT m.*, (SELECT activo FROM products WHERE id = m.product_id) AS producto_activo FROM movements m ${sql} ORDER BY fecha DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM movements ${sql}`).get(...params);
  res.json({ movements: rows, total: n, pages: Math.max(1, Math.ceil(n / limit)) });
});

router.get("/export.csv", (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = getDb().prepare(`SELECT * FROM movements ${sql} ORDER BY fecha DESC, id DESC LIMIT 200000`).all(...params);
  sendCsv(res, "movimientos.csv", rows, [
    { label: "Fecha", value: (r) => localDateTime(r.fecha) },
    { label: "Tipo", value: "tipo" },
    { label: "Código", value: "codigo" },
    { label: "Producto", value: "nombre" },
    { label: "Cantidad", value: "cantidad" },
    { label: "Stock antes", value: "stock_antes" },
    { label: "Stock después", value: "stock_despues" },
    { label: "Motivo", value: "motivo" },
    { label: "Usuario", value: "usuario_nombre" },
  ]);
});

module.exports = router;
