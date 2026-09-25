const express = require("express");
const { getDb } = require("../db");
const { requireRole } = require("../auth");
const { oneOf, id, dateRange, pagination, likeTerm, str } = require("../validate");
const { sendCsv, localDateTime } = require("../csv");
const { isBilling } = require("../settings");
const sales = require("../services/sales");
const billing = require("../services/billing");

const router = express.Router();
const canReverse = requireRole("admin", "supervisor");

function buildFilter(query) {
  const where = [];
  const params = [];
  const { desde, hasta } = dateRange(query.desde, query.hasta);
  if (desde) { where.push("s.fecha >= ?"); params.push(desde); }
  if (hasta) { where.push("s.fecha <= ?"); params.push(hasta); }
  if (query.estado) { where.push("s.estado = ?"); params.push(oneOf(query.estado, ["completada", "anulada"], { name: "Estado" })); }
  if (query.metodoPago) { where.push("s.metodo_pago = ?"); params.push(oneOf(query.metodoPago, sales.PAYMENT_METHODS, { name: "Método de pago" })); }
  if (query.q) {
    where.push("s.id IN (SELECT sale_id FROM sale_items WHERE nombre LIKE ? ESCAPE '\\' OR codigo LIKE ? ESCAPE '\\')");
    const t = likeTerm(str(query.q, { max: 100 }));
    params.push(t, t);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const SALE_LIST_SQL = `
  SELECT s.*,
    (SELECT group_concat(nombre || ' x' || cantidad, ', ') FROM sale_items WHERE sale_id = s.id) AS resumen,
    (SELECT estado FROM invoices WHERE sale_id = s.id AND tipo_cbte IN (1,6,11) AND estado <> 'cancelada' ORDER BY id DESC LIMIT 1) AS factura_estado
  FROM sales s`;

router.get("/", (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 30 });
  const { sql, params } = buildFilter(req.query);
  const db = getDb();
  const rows = db.prepare(`${SALE_LIST_SQL} ${sql} ORDER BY s.fecha DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const totals = db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN estado='completada' THEN total - total_devuelto END),0) AS neto FROM sales s ${sql}`)
    .get(...params);
  res.json({ sales: rows, total: totals.n, neto: totals.neto, pages: Math.max(1, Math.ceil(totals.n / limit)) });
});

router.get("/export.csv", (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = getDb().prepare(`${SALE_LIST_SQL} ${sql} ORDER BY s.fecha DESC LIMIT 100000`).all(...params);
  sendCsv(res, "ventas.csv", rows, [
    { label: "N° venta", value: "id" },
    { label: "Fecha", value: (r) => localDateTime(r.fecha) },
    { label: "Vendedor", value: "usuario_nombre" },
    { label: "Productos", value: "resumen" },
    { label: "Método de pago", value: "metodo_pago" },
    { label: "Subtotal", value: "subtotal" },
    { label: "Descuento", value: "descuento_monto" },
    { label: "Total", value: "total" },
    { label: "Devuelto", value: "total_devuelto" },
    { label: "Estado", value: "estado" },
    { label: "Factura", value: (r) => r.factura_estado || "" },
    { label: "Nota", value: "nota" },
  ]);
});

router.get("/:id", (req, res) => res.json(sales.getSale(id(req.params.id))));

/**
 * Registra la venta y, si corresponde, emite la factura.
 * Si ARCA falla, la venta queda guardada igual y la factura se puede reintentar.
 */
router.post("/", async (req, res) => {
  const factura = req.body.factura || {};
  const emitir = isBilling() && factura.emitir === true;
  if (emitir) {
    const { total } = sales.quoteSale(req.body);
    billing.precheckInvoice(factura.receptor, total);
  }

  const sale = sales.createSale(req.body, req);
  let invoice = null;
  let invoiceError = null;
  if (emitir) {
    try {
      invoice = await billing.invoiceSale(sale.id, factura.receptor, req);
    } catch (err) {
      invoiceError = err.message;
    }
  }
  res.status(201).json({ sale: sales.getSale(sale.id), invoice, invoiceError });
});

// Facturar una venta ya registrada (por ejemplo, si el cliente pidió factura después).
router.post("/:id/facturar", async (req, res) => {
  const invoice = await billing.invoiceSale(id(req.params.id), req.body.receptor, req);
  res.json({ invoice });
});

router.post("/:id/devolucion", canReverse, async (req, res) => {
  const saleId = id(req.params.id);
  const result = sales.returnItems(saleId, req.body, req);
  let creditNote = null;
  let invoiceError = null;
  try {
    creditNote = await billing.creditNoteForSale(saleId, { returnId: result.returnId }, req);
  } catch (err) {
    invoiceError = err.message;
  }
  res.json({ ...result, creditNote, invoiceError, sale: sales.getSale(saleId) });
});

router.post("/:id/anular", canReverse, async (req, res) => {
  const saleId = id(req.params.id);
  const result = sales.annulSale(saleId, req.body, req);
  let creditNote = null;
  let invoiceError = null;
  try {
    creditNote = await billing.creditNoteForSale(saleId, { annul: true }, req);
  } catch (err) {
    invoiceError = err.message;
  }
  res.json({ ...result, creditNote, invoiceError, sale: sales.getSale(saleId) });
});

module.exports = router;
