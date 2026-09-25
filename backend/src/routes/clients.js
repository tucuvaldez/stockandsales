const express = require("express");
const { getDb, nowIso } = require("../db");
const { badRequest, notFound } = require("../errors");
const { str, num, id, likeTerm, isValidCuit } = require("../validate");
const { audit } = require("../audit");
const { DOC_TIPOS, CONDICIONES_IVA } = require("../services/afip/constants");

const router = express.Router();

function parseClient(body) {
  const c = {
    nombre: str(body.nombre, { name: "Nombre / Razón social", max: 120, required: true }),
    doc_tipo: num(body.docTipo, { name: "Tipo de documento", int: true, fallback: 96 }),
    doc_nro: str(body.docNro, { name: "Documento", max: 20 }).replace(/\D/g, ""),
    condicion_iva: num(body.condicionIva, { name: "Condición IVA", int: true, fallback: 5 }),
    email: str(body.email, { name: "Email", max: 120 }),
    telefono: str(body.telefono, { name: "Teléfono", max: 40 }),
    direccion: str(body.direccion, { name: "Domicilio", max: 200 }),
  };
  if (!(c.doc_tipo in DOC_TIPOS)) throw badRequest("Tipo de documento inválido");
  if (!(c.condicion_iva in CONDICIONES_IVA)) throw badRequest("Condición frente al IVA inválida");
  if ((c.doc_tipo === 80 || c.doc_tipo === 86) && !isValidCuit(c.doc_nro)) throw badRequest("El CUIT/CUIL no es válido");
  if (c.doc_tipo === 96 && !/^\d{7,8}$/.test(c.doc_nro)) throw badRequest("El DNI debe tener 7 u 8 dígitos");
  if (c.doc_tipo === 99) c.doc_nro = "0";
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw badRequest("El email no es válido");
  return c;
}

router.get("/", (req, res) => {
  const where = ["activo = 1"];
  const params = [];
  if (req.query.q) {
    where.push("(nombre LIKE ? ESCAPE '\\' OR doc_nro LIKE ? ESCAPE '\\')");
    const t = likeTerm(str(req.query.q, { max: 100 }));
    params.push(t, t);
  }
  res.json(getDb().prepare(`SELECT * FROM clients WHERE ${where.join(" AND ")} ORDER BY nombre COLLATE NOCASE LIMIT 500`).all(...params));
});

router.post("/", (req, res) => {
  const c = parseClient(req.body);
  const db = getDb();
  if (c.doc_tipo !== 99) {
    const dup = db.prepare("SELECT nombre FROM clients WHERE doc_tipo = ? AND doc_nro = ? AND activo = 1").get(c.doc_tipo, c.doc_nro);
    if (dup) throw badRequest(`Ya existe un cliente con ese documento: ${dup.nombre}`);
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO clients (nombre, doc_tipo, doc_nro, condicion_iva, email, telefono, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(c.nombre, c.doc_tipo, c.doc_nro, c.condicion_iva, c.email, c.telefono, c.direccion);
  audit(req, "cliente.crear", { entidad: "cliente", entidadId: Number(lastInsertRowid), detalle: { nombre: c.nombre } });
  res.status(201).json(db.prepare("SELECT * FROM clients WHERE id = ?").get(lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const clientId = id(req.params.id);
  const c = parseClient(req.body);
  const r = getDb()
    .prepare("UPDATE clients SET nombre=?, doc_tipo=?, doc_nro=?, condicion_iva=?, email=?, telefono=?, direccion=?, updated_at=? WHERE id=?")
    .run(c.nombre, c.doc_tipo, c.doc_nro, c.condicion_iva, c.email, c.telefono, c.direccion, nowIso(), clientId);
  if (!r.changes) throw notFound("Cliente no encontrado");
  audit(req, "cliente.editar", { entidad: "cliente", entidadId: clientId });
  res.json(getDb().prepare("SELECT * FROM clients WHERE id = ?").get(clientId));
});

router.delete("/:id", (req, res) => {
  const clientId = id(req.params.id);
  const r = getDb().prepare("UPDATE clients SET activo = 0, updated_at = ? WHERE id = ?").run(nowIso(), clientId);
  if (!r.changes) throw notFound("Cliente no encontrado");
  audit(req, "cliente.eliminar", { entidad: "cliente", entidadId: clientId });
  res.json({ ok: true });
});

module.exports = router;
