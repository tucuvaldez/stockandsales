const express = require("express");
const { getDb } = require("../db");
const { isBilling } = require("../settings");

const router = express.Router();

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const localKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

router.get("/dashboard", (req, res) => {
  const db = getDb();
  const now = new Date();
  const hoy = startOfDay(now).toISOString();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const hace7 = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)).toISOString();

  // Neto = total cobrado menos devoluciones. Las ventas anuladas no suman.
  const resumen = (desde) =>
    db.prepare("SELECT COUNT(*) AS cantidad, COALESCE(SUM(total - total_devuelto),0) AS total FROM sales WHERE estado = 'completada' AND fecha >= ?").get(desde);

  const porDia = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    porDia.set(localKey(d.toISOString()), { fecha: localKey(d.toISOString()), total: 0, cantidad: 0 });
  }
  for (const s of db.prepare("SELECT fecha, total - total_devuelto AS neto FROM sales WHERE estado = 'completada' AND fecha >= ?").all(hace7)) {
    const k = porDia.get(localKey(s.fecha));
    if (k) { k.total += s.neto; k.cantidad++; }
  }

  res.json({
    ventasHoy: resumen(hoy),
    ventasMes: resumen(inicioMes),
    ventasPorDia: [...porDia.values()],
    totalProductos: db.prepare("SELECT COUNT(*) AS n FROM products WHERE activo = 1").get().n,
    valorInventario: db.prepare("SELECT COALESCE(SUM(stock * precio_compra),0) AS v FROM products WHERE activo = 1").get().v,
    bajoStock: db.prepare("SELECT id, codigo, nombre, talle, stock, stock_minimo FROM products WHERE activo = 1 AND stock <= stock_minimo ORDER BY stock, nombre LIMIT 50").all(),
    topProductos: db
      .prepare(
        `SELECT i.codigo, i.nombre, SUM(i.cantidad - i.cantidad_devuelta) AS unidades, SUM(i.subtotal * (i.cantidad - i.cantidad_devuelta) / i.cantidad) AS ingresos
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.estado = 'completada' AND s.fecha >= ?
         GROUP BY i.product_id HAVING unidades > 0 ORDER BY unidades DESC LIMIT 5`
      )
      .all(inicioMes),
    mediosPago: db
      .prepare(
        `SELECT p.metodo_pago, COUNT(*) AS cantidad, SUM(p.monto) AS total FROM sale_payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.estado = 'completada' AND s.fecha >= ? GROUP BY p.metodo_pago ORDER BY total DESC`
      )
      .all(inicioMes),
    caja: (() => {
      const c = db.prepare("SELECT id, abierta_at, abierta_por FROM cash_sessions WHERE estado = 'abierta'").get();
      return c || null;
    })(),
    comprobantesConProblemas: isBilling()
      ? db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE estado IN ('pendiente','error','rechazada')").get().n
      : 0,
  });
});

module.exports = router;
