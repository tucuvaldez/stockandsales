const express = require("express");
const { getDb } = require("../db");
const { requireRole } = require("../auth");
const { oneOf, id, dateRange, pagination } = require("../validate");
const { sendCsv } = require("../csv");
const billing = require("../services/billing");
const { CBTE_TIPOS } = require("../services/afip/constants");

const router = express.Router();

function buildFilter(query) {
  const where = [];
  const params = [];
  const { desde, hasta } = dateRange(query.desde, query.hasta);
  // invoices.fecha es YYYYMMDD (formato ARCA).
  if (desde) { where.push("fecha >= ?"); params.push(query.desde.replace(/-/g, "")); }
  if (hasta) { where.push("fecha <= ?"); params.push(query.hasta.replace(/-/g, "")); }
  if (query.estado) {
    where.push("estado = ?");
    params.push(oneOf(query.estado, ["pendiente", "autorizada", "rechazada", "error", "cancelada"], { name: "Estado" }));
  }
  if (query.problemas === "true") where.push("estado IN ('pendiente','error','rechazada')");
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const withTipo = (r) => ({ ...r, tipo: CBTE_TIPOS[r.tipo_cbte] });

router.get("/", (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 50 });
  const { sql, params } = buildFilter(req.query);
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, sale_id, return_id, entorno, pto_vta, tipo_cbte, numero, fecha, doc_tipo, doc_nro, receptor_nombre, imp_total, imp_iva, cae, cae_vto, estado, mensajes, intentos FROM invoices ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM invoices ${sql}`).get(...params);
  res.json({ invoices: rows.map(withTipo), total: n, pages: Math.max(1, Math.ceil(n / limit)) });
});

// Libro de ventas simplificado para el contador.
router.get("/export.csv", requireRole("admin", "supervisor"), (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const where = sql ? `${sql} AND estado = 'autorizada'` : "WHERE estado = 'autorizada'";
  const rows = getDb().prepare(`SELECT * FROM invoices ${where} ORDER BY fecha, tipo_cbte, numero`).all(...params);
  const sign = (r) => (CBTE_TIPOS[r.tipo_cbte].nc ? -1 : 1);
  sendCsv(res, "comprobantes.csv", rows, [
    { label: "Fecha", value: (r) => `${r.fecha.slice(6, 8)}/${r.fecha.slice(4, 6)}/${r.fecha.slice(0, 4)}` },
    { label: "Comprobante", value: (r) => CBTE_TIPOS[r.tipo_cbte].nombre },
    { label: "Número", value: (r) => `${String(r.pto_vta).padStart(5, "0")}-${String(r.numero).padStart(8, "0")}` },
    { label: "Receptor", value: "receptor_nombre" },
    { label: "Documento", value: "doc_nro" },
    { label: "Neto", value: (r) => sign(r) * r.imp_neto },
    { label: "IVA", value: (r) => sign(r) * r.imp_iva },
    { label: "Total", value: (r) => sign(r) * r.imp_total },
    { label: "CAE", value: "cae" },
    { label: "Entorno", value: "entorno" },
  ]);
});

router.get("/:id", (req, res) => res.json(billing.getInvoice(id(req.params.id))));

router.post("/:id/reintentar", async (req, res) => {
  res.json(await billing.retry(id(req.params.id), req));
});

router.post("/:id/descartar", requireRole("admin", "supervisor"), (req, res) => {
  billing.cancel(id(req.params.id), req);
  res.json({ ok: true });
});

module.exports = router;
